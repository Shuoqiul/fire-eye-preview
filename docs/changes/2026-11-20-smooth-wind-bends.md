# Wind arrows through bends

The wind overlay uses a single stroke style. Every visible shaft carries an
arrowhead throughout its entrance and exit, with staggered gaps between passes.
Arrow length and travel rate encode the illustrative wind pattern with one
opacity across the corridor.

Each shaft follows a short arc with a capped turn angle. Signed turning
determines the inside lane; the visible travel distance in one animation pass
shrinks inside a bend and grows outside it. The rule applies to left and right
turns, and wide straight guides retain parallel shafts.

These changes affect the map overlay. The counterfactual spread calculations
retain the existing scientific formulas and event inputs.
