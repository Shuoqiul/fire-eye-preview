const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
test('Cloudflare bundle uses pinned verified redirects and preserves local fallback',async()=>{
 const {build}=await import('../scripts/build-cloudflare.mjs');
 const result=await build();
 const manifest=JSON.parse(await fs.readFile(path.join(root,'latest.json'))),mapping=JSON.parse(await fs.readFile(path.join(root,'cloudflare-releases.json'))).releases[manifest.release_id];
 assert.match(mapping.asset_base,/\/resolve\/[a-f0-9]{40}\//);
 assert.equal(result.redirects.length,4);
 for(const run of manifest.runs){const source=await fs.readFile(path.join(root,manifest.asset_base,run.path));const sha=crypto.createHash('sha256').update(source).digest('hex');assert.equal(sha,run.sha256);assert.equal(mapping.files[run.path].sha256,sha);assert.equal(mapping.files[run.path].bytes,source.length);await assert.rejects(fs.stat(path.join(root,'dist',manifest.asset_base,run.path)));}
 const bootstrap=JSON.parse(await fs.readFile(path.join(root,'dist/bootstrap.json')));assert.equal(bootstrap.asset_base,manifest.asset_base);
 const redirects=await fs.readFile(path.join(root,'dist/_redirects'),'utf8');assert.match(redirects,/ 307/);assert.ok(!redirects.includes('/resolve/main/'));
 for(const file of result.files){const stat=await fs.stat(path.join(root,'dist',file));assert.ok(stat.size<=25*1024*1024);assert.ok(!/^(\.git|tests|scripts|docs|review|node_modules)/.test(file));}
 assert.ok(result.files.includes('index.html'));assert.ok(result.files.includes('assets/counterfactual.js'));
});
