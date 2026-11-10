# Counterfactual drawing and deployment

This change replaces the placement-only public workflow with a drawing tool. Hurricane and high-wind paths are smoothed and previewed as arrows, then confirmed or redrawn. Hurricanes sample six equal arc-length positions; high wind produces tangent-aligned small arrows with a stronger centre and weaker edges.

Rain, thunderstorms and treatment areas share a brush/eraser editor with independent size sliders (mouse wheel supported). Confirmed masks retain holes and irregular boundaries. Their displayed fields use inward distance bands and a soft outward extension: blue for rain, yellow with lightning for thunderstorms, red for treatment. The same masks drive the rule engine with stronger interior response.

Default hurricane tracks use the current visible map centre to choose a nearby east/west coast, then follow an offshore reference line. Segment scale follows zoom and stays within 1.5° of longitude and latitude; user-drawn and manually edited tracks remain unrestricted by that default limit. Representative defaults are checked against the installed Natural Earth land polygons. Map-handle dragging changes one point; line/shadow dragging translates the whole track.

Track markers use rotating cyclone SVGs and the six CMA colours from the supplied hurricane reference. The editor retains kt, and labels its CMA legend. Wind arrows traverse their shafts in the same 1.6-second interval, followed by a 0.5-second empty gap. Reduced-motion mode presents a static field.

Cloudflare build output contains no file above 25 MiB. Four large PMTiles requests redirect to a verified, commit-pinned HF release; small overview images and numeric grids retain bundled fallback URLs. See [Cloudflare setup](../cloudflare.md).

The advanced six-keyframe drifting/dissipating area animation is implemented on `feat/counterfactual-motion`; it is separate from main. Its direction and speed are illustrative controls, and score calculation continues to use the confirmed footprint.

Validation: Node checks cover geometry, masks, causal rule response, actual-grid identity/locality and the deploy bundle. Browser regression exercises path drawing, confirmation, brush/eraser, single-point and whole-track dragging, parameter sharing, cleanup and mobile layout. Screenshots are in `review/`.
