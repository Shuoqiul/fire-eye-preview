# Public recipes, track envelopes and Preview configuration

## Shared main / dev behavior

The public editor starts each event on an actual recipe. Hurricane defaults to **Hurricane**, thunderstorm to **Scattered, dry**. Public timing is always start 0 / duration 24 hours, including when returning from Expert mode. Expert timing remains editable for every event.

Public controls are recipe buttons, with a corridor-width slider for high wind. Hurricane point tables, width/time fields and thunderstorm rain inputs stay out of the public conditions panel. Expert mode retains track-point winds, rain, lightning and treatment parameters; the unused hurricane width field is removed.

- Hurricane recipes: tropical storm, severe tropical storm, Hurricane (CMA typhoon), severe typhoon, super typhoon. Their initial winds are the category lower bounds 17.2 / 24.5 / 32.7 / 41.5 / 51 m/s, expressed in the existing kt track / mph expert fields.
- Thunderstorm recipes: isolated / scattered / widespread coverage, each dry or wet, for six combinations. Wet recipes carry 0.4 inches and display two drops; Expert mode can set other rain amounts.
- Heavy rain recipes: 0.2 / 0.4 / 0.6 / 0.8 / 1.0 inches. Treatment and high-wind numerical recipes remain available.

The public hurricane profile is recomputed after drawing or moving a track. It samples each 12-hour segment hourly against the installed map land polygons and coastline distances. Wind decays slowly offshore, faster near shore, and rapidly over land. These are illustrative monotone rates, rather than a calibrated intensity forecast. Expert track-point edits remain explicit. Each shadow radius now depends on that point's absolute wind (8 + 0.9 × kt km), independent of the track's extent or other points' winds; stronger wind always makes that point's shadow wider.

High-wind path length is fixed by the drawn line. The public width slider changes transverse extent without moving either endpoint. Width is displayed as the full corridor width; the stored radius remains its half-width. Longitudinal arrow spacing adapts to the local velocity-vector length, with a 5px tail/head gap. Lower-speed fields have more, shorter arrows; higher-speed fields have fewer, longer arrows. Acute overlaps combine velocity components, and the existing staggered entering/exiting animation stays local to each vector. Sampling continues across the whole smoothed path, including tiny line segments. Viewport clipping and bounded candidates keep zoomed paths responsive.

## dev and Cloudflare

The advanced six-keyframe area animation remains only on `dev`, with its direction/speed sliders. Its normalizer preserves Expert start time instead of forcing it to zero; public mode supplies 0 / 24. Standard lightning and rain glyphs continue to move and fade with the area.

The reported deployment failure came from the missing required `previews` block. Both branches now include `"previews": {}` in `wrangler.jsonc`, keeping assets and compatibility settings at the top level. This follows the [official Wrangler Preview configuration](https://developers.cloudflare.com/workers/previews/configuration/#wrangler-configuration-file). `dev` uses build `npm run build`, non-production deploy `npx wrangler preview`; `main` uses the production deploy command.

## Verification

Checks cover recipe membership/defaults, five lower-bound cyclone winds, six unique thunderstorm combinations, the rain increments, offshore/nearshore/land decay, shadow-radius monotonicity, adaptive vector gaps/density and the required Preview block. Browser regressions cover public controls, every event's Expert timing, defaults on mode return, width changes with fixed endpoints, drawn-path interactions, rendered intensities and the lightning/rain lattice. The installed Wrangler configuration parser checks the real configuration. Local validation exercises the bundle and UI; the connected Cloudflare Git build performs the authenticated deployment.

Completed locally: both branches passed their Node suites and Cloudflare builds; shared browser regression passed against both servers, with the main drawing/full-calculation regression and dev motion regression also passing. Wrangler 4.159.0 parsed the Preview configuration and completed the static-assets deploy dry-run. Authenticated Preview deployment remains with the connected Cloudflare Git build.
