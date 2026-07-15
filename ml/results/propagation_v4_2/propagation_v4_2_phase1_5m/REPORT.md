# Propagation V4.2 Phase 1: Controlled 5M Ablations

Generated: 2026-07-15T02:50:31.133738+00:00

## Answer first

Advance **A4 recent cycle**, **A5 recency weighted**, **A2 long natural** to the 20M scale gate. Each beat A0 in both evaluation months and its paired-day 95% upper bound remained below zero. The conditional policy gate also advances **A6 A4/A5 blend**. The component models to scale are **A4 recent cycle**, **A5 recency weighted**, **A2 long natural**.

The best point estimate was **A6 A4/A5 blend** at
`0.04460490` Brier (`-0.00128150` versus A0).

## Held-out evaluation

| Candidate | Brier | Delta vs A0 | October | November | Upper 95% | Decision |
|---|---:|---:|---:|---:|---:|---|
| A0 V3 control | 0.04588640 | +0.00000000 | +0.00000000 | +0.00000000 | +0.00000000 | Hold |
| A1 + availability flags | 0.04553578 | -0.00035062 | -0.00034933 | -0.00035203 | -0.00030346 | Hold |
| A2 long natural | 0.04552943 | -0.00035697 | -0.00043791 | -0.00026878 | -0.00026229 | Advance |
| A3 long balanced | 0.04853705 | +0.00265065 | +0.00260977 | +0.00269519 | +0.00275576 | Hold |
| A4 recent cycle | 0.04464395 | -0.00124245 | -0.00133525 | -0.00114133 | -0.00112123 | Advance |
| A5 recency weighted | 0.04498763 | -0.00089877 | -0.00093029 | -0.00086441 | -0.00080817 | Advance |


## Conditional A6/A7 follow-up

| Policy | Brier | Delta vs A4 | Delta vs B2 | October | November | Upper 95% | Decision |
|---|---:|---:|---:|---:|---:|---:|---|
| A6 A4/A5 blend | 0.04460490 | -0.00003906 | -0.00000132 | -0.00002334 | -0.00005618 | -0.00002289 | Advance |
| A7 A1-on-60m router | 0.04464395 | +0.00000000 | +0.00003773 | +0.00000000 | +0.00000000 | +0.00000000 | Hold |


August selected A6 at `0.75` A4 and
`0.25` A5. A7 routed
`no band`
to A1 and used A4 elsewhere.

## A0 reproduction

- Original V3 5M October Brier: `0.04416474`.
- Phase 1 A0 October Brier: `0.04488558`.
- Absolute difference: `+0.00072084`.
- Contract difference: Phase 1 uses a stable natural top-hash cohort, 1,200-round ceiling, and August calibration; the original curve used a RNG subset of the V3 50M sample, 600 rounds, and July calibration.

## Methodology

All six candidates used exactly 5,000,000 training rows and identical XGBoost
hyperparameters. July 2024 supplied 5,000,000 early-stopping rows. August 2024
supplied 5,000,000 calibration rows using the existing time-aware selection
protocol. The scorer read full October and November once in 100,000-row Arrow
batches, retained aggregate sufficient statistics, and performed 2,000 paired
UTC-day bootstrap resamples against calibrated A0.

A6/A7 were triggered by October/November residual diagnostics, so they are
conditional development policies rather than independent evaluation claims.
Their numeric parameters were selected with temporary calibrators fit on August
days 1-20 and policy selection on days 21-end. The frozen policies were then
rescored over October and November with a second checksum-verified stream.

Evaluation covered `110,407,406` rows in
`21.4` minutes with
`9.84` GiB peak RSS. Every evaluation input
checksum was verified. December 2024 and all 2025 outcomes remained closed.
Conditional scoring took `9.8`
minutes with `9.95` GiB peak RSS.

## Interpretation

A0/A1 isolate the 27 V4 availability and missingness indicators. A2/A3 isolate
natural versus balanced historical sampling. A4 tests a recent-cycle window.
A5 retains long history with an 18-month exponential half-life. Raw-versus-
calibrated results in the visual report separate probability calibration from
the underlying representation and ranking behavior.

## Limits

October and November were already observed before V4.2, so these results guide
development but are not fresh validation. A0 is a controlled reproduction, not
a byte-identical replay of the original V3 learning-curve run. No result here
authorizes production replacement or access to December 2024 or 2025 outcomes.

## Reproduction

```bash
ml/.venv/bin/python ml/src/archive_v4_2/score_phase1_ablations.py \
  --profile m5 --verify-input-hashes
ml/.venv/bin/python ml/src/archive_v4_2/validate_phase1.py --profile m5
ml/.venv/bin/python ml/src/archive_v4_2/score_phase1_conditional.py \
  --profile m5 --verify-input-hashes
ml/.venv/bin/python ml/src/archive_v4_2/validate_phase1_conditional.py --profile m5
ml/.venv/bin/python ml/src/archive_v4_2/generate_phase1_report.py --profile m5
node ml/src/archive_v4/package_report.mjs --input \
  ml/results/propagation_v4_2/propagation_v4_2_phase1_5m/REPORT.artifact.json --output \
  ml/results/propagation_v4_2/propagation_v4_2_phase1_5m/REPORT.html
```
