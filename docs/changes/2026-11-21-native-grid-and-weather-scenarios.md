# Native-grid scenario and weather rendering

**Baseline** uses the released forecast. **Scenario** colors edited values on the original 5,000 m × 5,000 m grid over the same release; transparency follows the score and the display opacity control. Unchanged cells use the released layer. **Compare** uses a feathered overlay of signed score deltas; the per-cell values and readouts remain exact. Automatic 50 m refinement pauses while the scenario explorer is open.

## Illustrative event responses

- **Prescribed burn:** for a cell inside the painted footprint or treatment polygon, `q = s × (1 − 0.60 × f × 2^(−a/8) × c)`. Here `s` is the published score, `f` the treated fraction, `a` years since treatment, and `c` the fraction of the treatment duration elapsed at the forecast-window end, clipped to [0,1]. This is a score demonstration. To estimate a treatment effect, collect dated treatment footprints and severity, pre/post fuel loads and composition, fuel moisture, recovery trajectories, matched controls or paired spread runs, and 5 km / 12 h active-fire labels. The baseline remains independent of these inputs.
- **Thunderstorm:** on top of the rainfall/ISI response, add `0.16 × footprint weight × lightning coverage × window overlap fraction × exp(−rain inches / 0.25)` to the score log-odds. This small positive term lets dry lightning produce a visible signed change; the coefficient and rainfall attenuation are demonstration settings. Estimate them with matched lightning exposures that include fire and fire-free events, plus fuel moisture, rainfall and observation coverage. Conditional discovery timing remains a separate quantity. Weather symbols belong to the event editor and disappear on Run.

Wind glyphs use viewport-clipped lateral bands, running arrowheads with downstream phase handoff, and compressed inner offsets at bends. These are visualization rules; the drawn geographic path remains the input of the scenario engine.
