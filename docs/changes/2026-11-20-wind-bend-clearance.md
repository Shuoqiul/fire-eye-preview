# Clearance between wind arrows at tight bends

The wind overlay reserves space between complete shafts, checks arrowhead
wings, and includes neighboring spatial bins in its collision search. A larger
clearance in bends thins crowded glyphs locally; straight corridors retain
their parallel lanes and tight bends retain the inner-slow, outer-fast pattern.

The browser regression covers a wide and strong Savannah-area V-shaped wind
corridor, including the actual Canvas strokes for both shafts and arrowheads.
The calculation of fire spread potential retains its existing inputs and formulas.
