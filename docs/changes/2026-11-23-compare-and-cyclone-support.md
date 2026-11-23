# Compare scale and cyclone score support

Compare uses a fixed signed published-score scale from −0.10 to +0.10. Its
colours remain consistent when the event, forecast window, and map zoom
change. Small positive changes use a pale tint, and a Gaussian feather softens
only the display near support boundaries. The stored deltas stay unchanged.
Feathering is a visual aid and does not introduce geographic probability or
precision.

The cyclone **native rain diagnostic** retains the R-CLIPER Table 2 radial
rate and its 35–150 kt intensity domain. The app ends that radial field at
500 km with a smooth taper. Tuleya et al. (2007) fitted the profile within
500 km and also verified rare frontal rainfall beyond it; 500 km is therefore
an application domain edge rather than a physical rain boundary. The native
rain and FFMC/ISI response remains visible as a separate diagnostic.
The former 1.5× reach appeared only in the search margin used to discover
candidate cells. Local wind forcing retains its preexisting 0.85×R34 bound.

The **illustrative published-score bridge** for cyclones uses the local wind
ISI and introduces its added-rain ISI contribution gradually over a rolling
24 h added-rain accumulation of 2.54–6.35 mm. These are the two lowest
24 h verification levels in Tuleya et al. (2007), used as an explicit
application conservatism choice. The gate is a low-confidence mapped-score
choice: no wildfire study establishes it as a causal impact threshold. A weak
track below 34 kt keeps the exact released published score; the bounded local
wind diagnostic remains a weather quantity and can be absent for a very small
core. Out-of-support cells also keep their exact released score.

Sources:

- [Tuleya et al. (2007), R-CLIPER](https://doi.org/10.1175/WAF972.1), including
  its fit domain, gauge verification, and 0.1/0.25 in rainfall levels.
- [Knaff et al. (2007)](https://doi.org/10.1175/WAF1026.1), source of the
  North Atlantic R34/R64 wind geometry.
- [Van Wagner and Pickett (1985) / CFFDRS FFMC and ISI implementation](https://github.com/cffdrs/cffdrs_r),
  source of the native moisture and spread-index processes.

## Synthetic Daytona-type proxy

An independent proxy used exactly 106 × 111 = 11,766 all-valid 5 km cells and
a uniform released baseline of 0.22. Wet and dry runs used the same six-track
positions and intensities without clipping:

```text
[-76.4,29.2,82], [-77.7,28.95,69], [-79,29.12,61],
[-80.3,29,47], [-81.65,28.95,14], [-82.95,28.65,2]
```

The table reports cells with published-score change below −0.02:

| Window | Before score support | After low-amount gate |
| --- | ---: | ---: |
| +12 h | 7,292 | 2,236 |
| +24 h | 10,196 | 5,027 |
| +36 h | 11,719 | 7,669 |
| +48 h | 0 | 0 |

These are intermediate synthetic proxy measurements, assembled from the
implementation rather than reconstructed from the user's screenshot. They
show a material contraction in the illustrative score while the underlying
wet native diagnostics response remain available. They test behavior only and provide
no storm-specific field validation or wildfire-impact calibration.
