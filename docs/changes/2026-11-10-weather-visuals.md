# Weather symbols, local wind vectors and preset visuals

## Shared behavior on main and dev

- Hurricane markers use a continuous hollow-eye, two-tail cyclone silhouette, with the existing rotation. Lightning uses the broad three-step silhouette. Rain uses a scalloped cloud and separate teardrops. All are transparent SVGs without warning-card panels.
- Wind arrows stay in their local vector windows. A translating arrow enters, extends, exits and leaves a blank interval. Neighbour phases are staggered for handoff rather than a field-wide disappearance. Sustained mph scales vector length directly; coincident screen cells combine velocity components, including cancellation, instead of stacking arrows at acute bends.
- Everyone presets and Expert fields retain the same numerical parameters. Rain amount, lightning coverage, and treatment fraction/age now control displayed colour/opacity as well as the calculation. Larger magnitudes produce darker areas using the same boundary-distance bands.
- Thunderstorm rain is editable in either mode. Zero rain hides rain symbols; positive rain shows at least one drop, with another complete drop per 0.2 inches (0.4 inches = two). A cloud appears only at the centre of a lightning square with at least three visible corners inside the painted footprint. The full supported 50-inch input range fits the SVG viewport.

## Symbol and colour sources

Sources are local project references: `example_figs/27962-2011-gbt-e-300.pdf`, physical pages 6 (typhoon), 7 (rainstorm), and 13/table 9 (lightning); `hurricane.jpg`, `raindrops.png` and `thunder示意.png`.

The PDF's glyphs are embedded images, rather than extractable vector paths. The SVG silhouettes are clean vector fits to those glyph panels, inspected against the original embedded images. Text, borders and background panels are excluded. They are reference-based reconstructions, not original PDF vector exports.

Flat legend-dot samples from `hurricane.jpg` (a PNG despite its extension): depression `#eed008`, tropical storm `#0000ff`, severe tropical storm `#0f8000`, typhoon `#fe9c45`, severe typhoon `#fe00fe`, super typhoon `#fe0000`, extratropical `#5b5555`. A neutral `#8c9caa` covers sub-depression winds. CMA wind thresholds remain 10.8/17.2/24.5/32.7/41.5/51 m/s, converted from the editor's knots.

## Preview branches and verification

`dev` starts from the advanced-motion feature branch, preserving its six drifting/dissipating keyframes and direction/speed controls. Production `main` retains the basic area display. Both receive the symbol, vector and intensity refinements. Use build `npm run build` and non-production deploy `npx wrangler preview` for `dev`; see [Cloudflare setup](../cloudflare.md).

Verification includes Node geometry/symbol/engine/native-grid/build checks and browser checks of mode sharing, wind-length ratios, overlapping-vector combination, rendered raster intensity, rain-grid eligibility, zero-rain cleanup and transparent SVG markers. The dev regression also checks the movement controls, raster crossfade and symbol movement/cleanup. Browser regressions require the existing sibling `cf-app` Playwright install and a local HTTP server; the shared visual regression accepts `CF_URL`.
