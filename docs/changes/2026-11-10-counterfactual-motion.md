# Experimental area motion

Branch: `feat/counterfactual-motion`, based on main's drawing editor.

Rain, thunderstorms and treatment areas start at offset zero. Their public and expert start/duration fields are replaced by direction (degrees) and speed (0–100 px/s) sliders, including wheel adjustment. Initial bearing is sampled once per new event; initial speed is 12 px/s. Motion metadata round-trips with event JSON.

The visual loop contains six keys at 0, 0.5, 1, 1.5, 2 and 2.5 seconds. Position uses smooth interpolation, and two raster layers crossfade progressively evaporating textures. Each half-second displacement is capped at 50 screen pixels at the current map scale. The final transparent frame is held for 0.5 seconds; the three-second cycle then resets. Lightning symbols follow their area. Reduced-motion mode shows the initial static frame.

This motion is an illustrative preview. Risk calculation uses the confirmed geographic mask and the available published forecast windows; it does not treat a UI animation second as a forecast hour.

Validation: 29 Node checks passed, including frame timing, pixel bound, direction and normalization. Chromium checks passed for all three moving event types, both sliders, absence of start/duration controls, two-layer interpolation, closing cleanup and mobile layout. Main retains its separate static-area implementation. Screenshots: `review/counterfactual-motion-desktop.png` and `review/counterfactual-motion-mobile.png`.
