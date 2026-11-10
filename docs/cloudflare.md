# Cloudflare Create App

Use the GitHub repository `Shuoqiul/fire-eye-preview` and its `main` branch. The application root is the repository root.

## Workers Static Assets

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Asset directory: `dist` (set by `wrangler.jsonc`)
- Node: 22 or newer

For a Pages project, choose framework preset **None**, the same build command, and output directory `dist`.

The build bundles the application, small overview images, native numeric grids and the installed context assets. Four forecast PMTiles exceed the [25 MiB asset limit](https://developers.cloudflare.com/workers/platform/limits/). Generated [_redirects](https://developers.cloudflare.com/workers/static-assets/redirects/) send those requests to a commit-pinned public Hugging Face release. The mapping in `cloudflare-releases.json` records checked SHA-256 metadata and byte counts. Small fallback files retain local URLs.

Run `npm run build` and `npm test` before connecting the app. Wrangler authenticates through the Cloudflare account connected to the Git build; application source contains no Cloudflare token. The experimental motion branch has its own implementation and can be selected for a separate preview deployment.

## Short development Preview

Use branch `dev` for the advanced animation version. In Cloudflare Git builds set the build command to `npm run build` and the non-production deploy command to `npx wrangler preview`. Wrangler defaults the Preview name to the current branch, so this produces the short `dev` name. Production `main` continues to use `npx wrangler deploy`. Locally, `npm run preview` runs the build first and then invokes the same Preview command.

Reference: [Cloudflare Previews setup](https://developers.cloudflare.com/workers/previews/get-started/). The Preview CLI help was checked with Wrangler 4.159.0; this repository change does not create an account-side deployment.
