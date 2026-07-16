# FutureCast V1: synthetic end-to-end engineering report

## Result

The full M5 pipeline passed engineering validation across 90 synthetic
issue days, 360 leakage-audited partitions, and
8 frozen models. Release remains **withheld** for all four
horizons because this is synthetic evidence and the direct models did not beat their
best frozen full-gate baselines.

## Execution

- XGBoost: 18 native threads, two fresh spawn workers.
- Conservative combined peak RSS: 0.560 GiB.
- P.533: 4,800 paired rows, 4,000
  unique circuits, 18 workers.
- Release gates: 16/40 passed across four horizons.

The interactive `REPORT.html` is the primary visual report. This Markdown file is its
compact semantic companion. Synthetic results establish pipeline behavior only, not
real propagation forecast accuracy.
