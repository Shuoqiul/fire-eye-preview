# World-anchored high-wind renderer

The high-wind overlay now samples the browser-compatible `createWorldWindField` geometry through its geographic stream field. Each displayed shaft is a short screen-space arc, with four 3 px integration steps on each side of a stable 32 px placement grid. The renderer resamples the field direction at every step, stops at support boundaries and retains every intermediate geographic vertex. It keeps short shafts visible, uses the existing staggered `windFrame` handoff and draws each shaft with `drawWindCurve`.

The sampled field is cached by event geometry, half-width and wind speed. Each camera update uses one shared pad/zoom/bearing/pitch/viewport key, while field sampling uses the current camera. Default wind directions use the same synthesized guide key during refreshes and polling. Glyph length remains constant in CSS pixels and the animation phase is independent of zoom. Zero wind speed renders no shafts.

## Verification

Run from `fire-eye-preview`:

```sh
npm test
LD_LIBRARY_PATH=/home/gxy/.local/browsers/lib node tests/counterfactual-wind-browser.mjs
LD_LIBRARY_PATH=/home/gxy/.local/browsers/lib CF_URL=http://127.0.0.1:5236 node tests/counterfactual-interactions-browser.mjs
```

The suite has 9/9 Node test files passing. The standalone wind renderer test checks staggered visible shafts. The real app browser test covers drawing, wide straight support, real zoom density, acute bends, nearest-stroke clearance, reduced motion and close-out. Final evidence: 363 complete acute-bend strokes, with 8 CSS px nearest-stroke clearance. The host independently verified dense headings and high zoom.

Screenshots: `/tmp/wb-wind-final/wind-desktop.png`, `wind-source-path.png`, `wind-straight-wide.png`, `wind-acute-bend.png`, `wind-bend-clearance.png`.
