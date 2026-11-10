import { cp, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'dist');
const limit = 25 * 1024 * 1024;
const excluded = new Set(['.git', '.github', '.gitignore', 'tests', 'review', 'docs', 'scripts', 'node_modules', 'dist', 'package.json', 'package-lock.json', 'wrangler.jsonc', 'cloudflare-releases.json', 'README.md']);
const releasePathPattern = /^\.\/releases\/[A-Za-z0-9._-]+\/$/;
const pmtilePattern = /^forecast-h(?:12|24|36|48)\.pmtiles$/;

function redirectLine(pathname, target) {
  return `${pathname} ${target} 307`;
}

async function exists(file) {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function collectFiles(directory, relative = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!relative && excluded.has(entry.name)) continue;
    const rel = path.posix.join(relative, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolute, rel));
    else if (entry.isFile()) files.push(rel);
  }
  return files;
}

function immutableRelease(manifest, releaseId) {
  let url;
  try {
    url = new URL(manifest.asset_base);
  } catch {
    throw new Error(`Release ${releaseId}: asset_base must be an absolute URL`);
  }
  if (
    url.protocol !== 'https:' || url.origin !== 'https://huggingface.co' ||
    !/^\/datasets\/[^/]+\/[^/]+\/resolve\/[a-f0-9]{40}\/.+\/$/.test(url.pathname) ||
    url.search || url.hash
  ) {
    throw new Error(`Release ${releaseId}: asset_base must be a commit-pinned Hugging Face dataset release URL`);
  }
  return url.href;
}

export function redirectsFor(manifest, publishedReleases) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.runs)) {
    throw new Error('Manifest must contain forecast runs');
  }
  if (manifest.schema_version !== 1 || !releasePathPattern.test(manifest.asset_base || '')) {
    throw new Error('Manifest must use a local release asset_base');
  }
  const published = publishedReleases?.[manifest.release_id];
  if (!published) throw new Error(`Release ${manifest.release_id}: no verified Cloudflare release mapping`);
  const base = immutableRelease(published, manifest.release_id);
  const releaseDir = base.slice(0, base.lastIndexOf('/') + 1);
  if (!releaseDir.endsWith(`${manifest.asset_base.slice(2, -1)}/`)) {
    throw new Error(`Release ${manifest.release_id}: pinned release directory does not match the local bundle`);
  }
  const runs = new Map();
  const leads = new Set();
  for (const run of manifest.runs) {
    if (![12, 24, 36, 48].includes(run.lead_hours) || !pmtilePattern.test(run.path)) {
      throw new Error(`Release ${manifest.release_id}: unexpected forecast tile path`);
    }
    if (runs.has(run.path) || leads.has(run.lead_hours)) throw new Error(`Release ${manifest.release_id}: duplicate forecast run`);
    leads.add(run.lead_hours);
    if (!/^[a-f0-9]{64}$/.test(run.sha256 || '') || !Number.isSafeInteger(run.bytes) || run.bytes <= limit) {
      throw new Error(`Release ${manifest.release_id}: ${run.path} requires a valid checksum and exceeds the static-assets size limit`);
    }
    runs.set(run.path, run);
  }
  if (runs.size !== 4) throw new Error(`Release ${manifest.release_id}: expected four forecast archives`);

  const runByLead = new Map(manifest.runs.map(run => [run.lead_hours, run]));
  const normalizedRuns = [];
  for (const lead of [12, 24, 36, 48]) {
    const run = runByLead.get(lead);
    if (!run) throw new Error(`Release ${manifest.release_id}: missing +${lead}h run`);
    normalizedRuns.push(run);
  }
  const bootstrap = {
    ...structuredClone(manifest),
    runs: normalizedRuns,
    asset_base: base,
  };
  const redirects = [...runs.values()].map(run => redirectLine(
    `/releases/${manifest.release_id}/${run.path}`,
    new URL(run.path, releaseDir).href,
  ));
  return { bootstrap, redirects };
}

async function materializeLargeReleaseTiles(sourceDir) {
  const releaseDir = path.join(sourceDir, 'releases');
  if (!await exists(releaseDir)) return;
  for (const [releaseId, files] of await mapDirectories(releaseDir)) {
    for (const file of files) {
      if (!file.endsWith('.pmtiles')) continue;
      const destination = path.join(sourceDir, 'releases', releaseId, file);
      if ((await stat(destination)).size > limit) await rm(destination, { force: true });
    }
  }
}

async function mapDirectories(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return Promise.all(entries.filter(x => x.isDirectory()).map(async x => [x.name, await readdir(path.join(directory, x.name))]));
}

export async function build(sourceDir = root, destinationDir = outputDir) {
  await rm(destinationDir, { recursive: true, force: true });
  await mkdir(destinationDir, { recursive: true });
  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    await cp(path.join(sourceDir, entry.name), path.join(destinationDir, entry.name), { recursive: true });
  }
  await materializeLargeReleaseTiles(destinationDir);

  const manifest = JSON.parse(await readFile(path.join(sourceDir, 'latest.json'), 'utf8'));
  const releases = JSON.parse(await readFile(path.join(sourceDir, 'cloudflare-releases.json'), 'utf8'));
  if (releases.schema_version !== 1) throw new Error('Invalid Cloudflare release mapping');
  const mapping=releases.releases[manifest.release_id];
  for(const run of manifest.runs){const record=mapping?.files?.[run.path];if(!record||record.sha256!==run.sha256||record.bytes!==run.bytes)throw Error('Pinned tile metadata differs from the bundled manifest: '+run.path);}
  const { bootstrap, redirects } = redirectsFor(manifest, releases.releases);
  // Keep bundled overview/value URLs local for offline fallback; only large tiles redirect.
  await writeFile(path.join(destinationDir, '_redirects'), [
    '# Forecast archives are pinned to the manifest release; ordinary files remain bundled.',
    ...redirects,
    '',
  ].join('\n'));

  const files = await collectFiles(destinationDir);
  for (const rel of files) {
    if (/^(?:\.git|tests|review|docs|scripts|node_modules)(?:\/|$)/.test(rel)) {
      throw new Error(`Excluded path was copied: ${rel}`);
    }
    const size = (await stat(path.join(destinationDir, rel))).size;
    if (size > limit) throw new Error(`${rel} is ${size} bytes, above the 25 MiB static-assets limit`);
  }
  console.log(`Cloudflare bundle: ${files.length} files, largest below 25 MiB, ${redirects.length} pinned forecast redirects`);
  return { outputDir: destinationDir, files, redirects, bootstrap };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build();
}
