# Fire-eye independent platform preview

An independent, public map of published CONUS FireWx-FM forecasts and environmental observations.

This preview contains the +12, +24, +36 and +48 hour windows. Forecast values describe modeled active-fire occupancy, not ignition probability. All displayed times are UTC.

The production website is unchanged. This preview does not contact the laboratory server.

Data: RAI Lab / NOAA HRRR. Map libraries: MapLibre GL JS and PMTiles; their licenses are included in assets. Basemaps: OpenFreeMap / OpenMapTiles / OpenStreetMap and Natural Earth.

Active fires and Summaries are primary controls. Active fires is an independent overlay on the same standard or 50 m heatmap; toggling reports does not replace the heatmap, change its selected date, or unload experimental detail. Historical windows use matching dated reports; latest reports are explicitly labeled background observations. Historical summaries use actual matching saved reports and the established spatial-correspondence metrics; forecast ranges do not show observation-verification statistics. Missing historical snapshots remain unavailable. Optional layers are grouped under Map layers. Client downloads contain only native risk cells clipped to a selected polygon; full-extent and other dataset export actions are removed. The HF Dataset remains public: interface restrictions are not data access control. During zooming and detail-tile failures, the same-window overview remains available. Dated report snapshots refresh independently every hour.

Restored features include published fire reports and perimeters, satellite detections, drought, soil moisture, weather advisories, regional charts, city/county/state/coordinate/incident search, source dates, downloads and a monthly catalog of all available historical model outputs. Older issues may contain only +12h; unarchived lead times cannot be selected. Input, generation and source-record publication times are preserved separately; an old input date does not by itself establish an advance forecast. The archive updates independently of website deployments, and verified historical issues are retained when the upstream registry rotates. The Simulation button zooms the existing geographic map into mapped local buildings and streets. The optional Illustration action retains the representative scene and 3 km landscape context; visual building detail does not increase forecast resolution. Dated incident-history queries are available under Details. Six landscape and exposure backgrounds are delivered on demand from HF, retaining original display tiles through zoom 10. Deeper views magnify these tiles; this is not native-resolution numeric analysis. Ask Flamme has global and regional entries and a controlled map-tool interface. Visitors may connect a browser-compatible Chat Completions API; credentials stay in tab memory. Institutional password access is enabled only when an independently hosted gateway is verified; no laboratory-server connection or frontend institutional key is used. WUI, historical burn-severity polygons and Microsoft building outlines use spatially indexed HF sources with viewport and resource limits. Source years are explicitly listed; missing archive years are not treated as zero. Atlantic advisory tracks from the installed 2010–2025 archive are available by season and storm; they are historical context, not live warnings. Viewport vector queries use verified index prefixes and a bounded in-memory cache. The separate resolution lab displays 53 existing October windows with verified 50 m experimental terrain/fuel detail; it is retrospective refinement of 5 km fields, not a native 50 m forecast. What-if comparisons use verified paired model outputs, synchronized maps and a maintainer-approved GitHub request queue. The browser never calls laboratory APIs; requests require a GitHub account and their settings are public. Treatment dates are context only, not a recovery simulation. Visitor writes are not yet migrated.

The webpage is hosted on GitHub Pages and normally reads verified forecast releases from Hugging Face. It checks the publication index every five minutes while visible. If remote data cannot load, a bundled snapshot remains available; its original issue time is always displayed. The snapshot may be older than the latest release.

Public dataset: https://huggingface.co/datasets/yx21e/fire-eye-forecasts-preview


## Counterfactual predictor

The map sidebar includes a separate **Counterfactual predictor** entry. It applies five event rules (hurricane, thunderstorm, high wind, heavy rain and prescribed burn) to the selected published forecast issue. Everyone presets and Expert numeric fields share scenario parameters. Baseline, scenario and change views use the same map and available forecast windows.

The calculation is an exploratory rule response on published scores. Published occupancy is used as a receptivity proxy; physical driver data and calibrated response magnitudes remain future work. Results describe scenario scores and score changes. Long-term context is maintained in [PROJECT_STATUS.md](../PROJECT_STATUS.md); current formulas and validation are in the [mechanism handoff](docs/changes/2026-11-10-mechanisms-and-cloud-churn.md).

Serve this directory over HTTP to preview locally:

```sh
python3 -m http.server 5199 --bind 127.0.0.1 --directory fire-eye-preview
```

Run the calculation checks from the repository root:

```sh
node --test fire-eye-preview/tests/counterfactual-*.test.cjs
```

The native-grid checks read the bundled forecast binary grids, verify their SHA-256 hashes, and exercise identity, nodata preservation and localized event response. The application uses its existing verified grid loader for browser calculations.

Browser regression (start the static server first; uses the existing Playwright dependency in `cf-app`):

```sh
node fire-eye-preview/tests/counterfactual-browser.mjs
```

Browser checks use the bundled release with external requests blocked, and cover five events, shared parameter modes, repeated runs, edits, missing data, release changes, cleanup and mobile layout. Downwind field transfer and automatic landfall detection remain future integration work; Expert mode accepts a declared hurricane landfall hour.

The public scenario editor now includes **Draw event on map**: confirm a smoothed hurricane/wind path, or paint and erase an irregular rain/lightning/treatment footprint. The basic branch includes rotating CMA-colour cyclone markers and looping wind arrows. See [drawing change notes](docs/changes/2026-11-10-counterfactual-drawing.md) and [Cloudflare setup](docs/cloudflare.md).

Weather-symbol, wind-vector and preset visual refinements are documented in [weather visual changes](docs/changes/2026-11-10-weather-visuals.md). Use `dev` for the advanced motion preview, with build `npm run build` and non-production deploy `npx wrangler preview`; production stays on `main`.

The public editor uses complete event recipes and now/24-hour timing. Expert mode retains timing and numerical edits. High-wind width adjusts across the drawn path, while arrow density adapts to wind speed. See [public recipes and Preview fix](docs/changes/2026-11-10-public-presets-and-preview.md).

Current mechanism equations, visual changes and the questions for scientific review are collected in [mechanisms and cloud-churn handoff](docs/changes/2026-11-10-mechanisms-and-cloud-churn.md). Wind width is 20–200 km. Change maps keep event tint separate from score differences.
