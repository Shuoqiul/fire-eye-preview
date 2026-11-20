# Wide wind corridors and radar on main

- Straight wind guides use one crosswind offset per arrow, keeping even the outer
  arrows parallel to the guide. The renderer absorbs small pointer jitter while
  retaining genuine turns, local curvature and staggered arrow animation.
- The dev radar loop now runs on main for heavy rain, thunderstorms and prescribed
  burns. Its stronger contour displacement and nine-second default cycle make
  the movement clearer. The core, coordinates and weather symbols remain fixed.
- The motion slider adjusts tempo; zero holds a still frame. Scientific mechanism
  equations and the forecast data remain unchanged.
