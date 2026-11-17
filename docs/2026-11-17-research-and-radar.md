# Research formulas, drawing workflow and stationary radar clouds

## Shared main/dev behavior

Selecting any event opens its path or area drawing tools immediately. The primary
“Draw event on map” action has a map-pencil icon above its label. Confirm retains
the sketch, Redraw starts a new sketch, and Cancel preserves the current event.

Wind is displayed as short curved flow traces along a smooth corridor, with
stronger visual emphasis on a few main streams. Lane variation and spatial
packing keep traces distinct around bends. Inner paths compress while longer
outer paths traverse their curve in the same animation period. These speed cues
are a rendering convention. The accepted prediction formulas and native ISI
comparisons keep their scientific meaning independently of the animation.

The research runtime uses published hourly FFMC/ISI mechanisms, Atlantic cyclone
wind geometry and R-CLIPER rain. Lightning discovery is conditional on matched
reported fires. Fuel-treatment output identifies its required fuel transformation
and paired spread runtime. The published fire forecast remains an immutable,
separate reference; native ISI quantities retain their own units and map scale.
The local-only sample adapter stays available through `npm run research`.

## Dev-only stationary radar

The cloud mass and its interior remain fixed. A small organic ripple affects only
the soft outer edge, with 24 texture keys forming a seamless cycle. Default cycle
length is 12 seconds; the activity slider changes tempo, and zero holds a visible
static frame. The camera, event center, interior color/alpha and weather symbols
retain fixed positions and values.

A single [MapLibre canvas source](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/CanvasSourceSpecification/)
receives premultiplied pixel interpolation between adjacent keys. Identical
interior pixels retain their RGBA values through interpolation. Main retains its
static area rendering.

## Verification

- Node tests cover the scientific formula reference cases, event inputs, drawing
  geometry and viewport bounds. Dev also tests periodicity, static interiors,
  edge amplitude and exact interior pixel interpolation.
- Browser acceptance covers event-selection auto-draw, the primary icon action,
  stroke confirmation, mobile layout and cleanup. The dev animation check covers
  fixed camera/center/texture coordinates, stable interior pixels, changing outer
  edges, stationary symbols and the zero-activity mode.
- Cloudflare builds retain the existing previews configuration. Collaborator data
  arrays remain in the parent workspace, outside Git and deployment assets.
