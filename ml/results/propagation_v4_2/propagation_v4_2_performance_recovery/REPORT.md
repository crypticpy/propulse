# Propagation V4.2 Phase 0 Performance Diagnosis

Generated: 2026-07-12T20:59:25.407410+00:00

## Answer first

Every development-selected blend and router collapsed to **frozen B2** at Brier 0.04460622; none added value. The six-month evidence does not justify blindly scaling the
existing M2. Run the controlled 5M reproduction, recency, sampling, capacity,
and missingness ablations before another 50M training run. Ensemble and expert
routing tests are conditional on new candidates showing complementary residuals.

December 2024 and all 2025 outcomes remain closed.

## Overall comparison

| Scope | B2 Brier | Raw M2 Brier | M2 minus B2 | Opportunities |
|---|---:|---:|---:|---:|
| Development: Feb/Apr/May/Aug | 0.04117401 | 0.04398309 | +0.00280907 | 6,394,217,140.00 |
| Evaluation: Oct/Nov | 0.04460622 | 0.04585356 | +0.00124734 | 3,599,391,845.75 |

## No-retraining policies on October and November

| Policy | Brier | Delta versus B2 |
|---|---:|---:|
| B2 frozen V3 | 0.04460622 | +0.00000000 |
| Raw M2 | 0.04585356 | +0.00124734 |
| Fixed blend | 0.04460622 | +0.00000000 |
| Band router | 0.04460622 | +0.00000000 |
| Stable band-distance router | 0.04460622 | +0.00000000 |


## Model interpretation

- Analytic development blend weight: `1.000000` B2.
- Robust rounded blend weight: `1.00` B2.
- Development-selected M2 specialist bands: `none`.
- Cross-month stable M2 band-distance cells: `0`.
- Best no-retraining decision: `retain frozen B2; no policy improved it`.

## Methodology

Both models were streamed over the same `317,250,669` full-month rows. The
scorer retained weighted B2 error, M2 error, their cross-product, row count, and
positive opportunity mass by month, day, band, distance, recent-history state,
solar and geomagnetic regime, source missingness, coarse receiver latitude, and
prediction disagreement. Policies were selected only on February, April, May,
and August, then evaluated on October and November with 2,000 paired UTC-day
bootstrap repetitions.

Peak RSS was `9.93 GB`; wall time was
`21.2` minutes. Input checksums were
verified during this run.

## Recommendation

Proceed to the exact nested 5M A0-A5 ablations in
`ml/PERSONALIZED-PROPAGATION-V4.2-PERFORMANCE-PLAN.md`. Do not acquire December
2024. Run A6/A7 only if new models show complementary cross-month residuals or
stable specialties. Only three candidates may advance to 20M and two to 50M;
100M requires an improving scale curve and a demonstrated variance/support
limitation.

## Limits

This is development diagnosis on previously observed outcomes, not fresh
validation. The target is conditional WSPR single-decode probability for
inferred-active path-hours, not generic QSO probability. No result authorizes
December 2024, the locked 2025 archive, or production replacement.

## Reproduction

```bash
ml/.venv/bin/python ml/src/archive_v4_2/diagnose_v3_v4.py \
  --profile m5 --verify-input-hashes
ml/.venv/bin/python ml/src/archive_v4_2/generate_diagnostic_report.py \
  --profile m5
node ml/src/archive_v4/package_report.mjs --input \
  ml/results/propagation_v4_2/propagation_v4_2_performance_recovery/REPORT.artifact.json --output \
  ml/results/propagation_v4_2/propagation_v4_2_performance_recovery/REPORT.html
```
