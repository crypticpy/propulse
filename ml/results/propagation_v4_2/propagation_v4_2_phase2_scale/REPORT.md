# Propagation V4.2 Phase 2: Scale, Transfer, and Efficiency

Generated: 2026-07-15T23:11:31.839439+00:00

## Answer first

Select **A6 A4/A5 blend** for the frozen Phase 3 serving candidate using `robust_b2_win`. December remains closed.

The 50M focus result is **A6 A4/A5 blend** at
`0.04355603` Brier
(`-0.00105019` versus frozen B2).

## Plain-language explanation

Each row asks whether at least one public WSPR receiver reports a decode for a
particular path, hour, band, power level, weather state, and recent network
history. The model outputs a probability; lower Brier means those probabilities
were closer to what happened. NowCast is the identity-free core. StationCast
applies the operator's private equipment chain at inference time. FutureCast is
a separate future-forecast claim and is not established by this experiment.
Receiver coverage remains part of what the dataset can observe, so this is not
a guarantee of a completed two-way contact.

## Scale decisions

| Scale M | Candidate | Brier | Delta vs B2 | October | November | Upper 95% vs B2 | Decision |
|---:|---|---:|---:|---:|---:|---:|---|
| 20 | A2 long natural | 0.04509740 | +0.00049118 | +0.00036639 | +0.00062716 | +0.00056310 | did not advance |
| 20 | A4 recent cycle | 0.04395729 | -0.00064893 | -0.00076136 | -0.00052644 | -0.00058414 | advanced to 50M |
| 20 | A5 recency weighted | 0.04427149 | -0.00033473 | -0.00039075 | -0.00027370 | -0.00026562 | advanced to 50M |
| 20 | A6 A4/A5 blend | 0.04391670 | -0.00068952 | -0.00079389 | -0.00057579 | -0.00062719 | did not advance |
| 50 | A4 recent cycle | 0.04361894 | -0.00098728 | -0.00111947 | -0.00084324 | -0.00091808 | not selected |
| 50 | A5 recency weighted | 0.04377520 | -0.00083102 | -0.00090121 | -0.00075454 | -0.00076523 | not selected |
| 50 | A6 A4/A5 blend | 0.04355603 | -0.00105019 | -0.00116955 | -0.00092013 | -0.00098712 | selected for Phase 3 |


## Apple Silicon execution

The frozen 50M backend is `streamed_in_memory_quantile`. It was
`2.603x` faster end to end than external memory at
identical recorded validation log loss. The conservative two-worker 50M memory
projection is `72.81` GiB.

The scheduler uses two spawn-isolated fits, nine XGBoost OpenMP threads per fit,
four Arrow I/O threads per fit, and 18 DuckDB threads for cohort construction.
XGBoost's macOS build is native arm64 and has no CUDA/Metal training backend.
Single-process scoring uses the measured fastest bit-identical setting of
`18` XGBoost prediction threads.

## Interpretation limits

October and November are development evidence, not a fresh gate. December 2024
and the four 2025 archive months remain closed. The model predicts a public WSPR
single-decode opportunity; it does not directly prove QSO success or causal
propagation mechanisms.

## Reproduce the visual report

```bash
ml/.venv/bin/python ml/src/archive_v4_2/benchmark_prediction_threads.py \
  --profile m5
ml/.venv/bin/python ml/src/archive_v4_2/generate_phase2_report.py --profile m5
node ml/src/archive_v4/package_report.mjs --input \
  ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/REPORT.artifact.json --output \
  ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/REPORT.html
```
