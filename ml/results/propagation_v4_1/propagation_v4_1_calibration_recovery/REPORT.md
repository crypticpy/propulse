# Propagation V4.1 Calibration Recovery Report

Generated: 2026-07-12T19:32:23.474231+00:00

## Technical summary

V4.1 **failed** its untouched November 2024 development gate. Eight of ten
preregistered gates passed. `G4_frozen_v3` failed because C4 Brier
(`0.04689390`) was worse than frozen V3/B2
(`0.04568175`) by `+0.00121215`.
`G6_short_path_calibration` failed because C4 regressed raw M2 by
`+0.00006100` on 0-500 km paths.

The locked 2025 archive remains closed. This is a published negative result,
not permission to tune against November.

## Key findings

| Candidate | Brier | Log loss | ECE |
|---|---:|---:|---:|
| B0 climatology | 0.08025316 | 0.32873978 | 0.00697513 |
| M1 physics/weather | 0.05761244 | 0.22184143 | 0.00738907 |
| B2 frozen V3 | 0.04568175 | 0.18139344 | 0.00363459 |
| M2 raw | 0.04693992 | 0.18521430 | 0.00677257 |
| C1 global isotonic | 0.04682430 | 0.18474755 | 0.00173166 |
| C2 per-band isotonic | 0.04682860 | 0.18476568 | 0.00142101 |
| C3 hierarchical isotonic | 0.04682108 | 0.18483220 | 0.00145543 |
| C4 guarded hierarchical | 0.04689390 | 0.18507296 | 0.00571991 |

## All frozen gates

| Gate | Status | Observed | Threshold |
|---|---|---|---|
| `G1_integrity` | **PASS** | true | Boolean contract |
| `G2_overall_skill_vs_b0` | **PASS** | +0.40967749 | 0.0 |
| `G3_history_value_vs_m1` | **PASS** | -0.01025274 | 0.0 |
| `G4_frozen_v3` | **FAIL** | M2-B2: +0.00121215; short-path relative improvement: -3.004% | 0.03 |
| `G5_calibration_overall` | **PASS** | -0.00004602 | 0.0 |
| `G6_short_path_calibration` | **FAIL** | 0-500km: +0.00006100; 500-1500km: -0.00020866; 1500-3000km: -0.00011107 | 0.0 |
| `G7_band_safety` | **PASS** | 10m: +0.00169867; 12m: +0.00123235; 15m: +0.00285121; 160m: +0.00585959; 17m: +0.00440238; 20m: +0.00251478; 30m: +0.00022937; 40m: +0.00234682; 60m: +0.01036103; 80m: +0.00848481 | 0.02 |
| `G8_reliability` | **PASS** | ECE delta: -0.00105266; high-confidence gap delta: -0.00227445 | 0.002 |
| `G9_operational_fallback` | **PASS** | true | Boolean contract |
| `G10_serving_parity` | **PASS** | true | Boolean contract |


## Scope and methodology

Every candidate was scored on the same `54,544,159` November 2024 rows
and `1,722,518,874.75` weighted opportunities. The target is conditional
single-decode WSPR probability for inferred-active path-hours, not general QSO
probability. The frozen 50M M2 model was not retrained. February, April, May,
and August selected the guarded calibration policy; November was opened once
after candidates, gates, service packaging, and scoring code were frozen.

## What worked

- C4 improved raw M2 overall by `-0.00004602` Brier.
- The paired-day 95% interval for C4 skill versus climatology was
  `40.97%` to
  `42.03%`.
- C4 improved the 500-1,500 km and 1,500-3,000 km slices.
- Integrity, band safety, reliability, fallback, and serving parity passed.

## What failed

- Frozen V3/B2 remained better overall and on the short-path criterion.
- C4 made 0-500 km Brier `+0.00006100` worse than raw M2.
- Because the decision required all ten gates, the 2025 archive cannot open.

## Recovery incident

The permanent attempt `november-fe4f874f7a514075bcb6f48e3333d0e9` was never reset. Orchestration,
duplicate projection, and path-provenance defects interrupted the same attempt,
but no metric was exposed before the atomic result. The repair did not change
data, models, calibrators, candidates, thresholds, metrics, seed, or bootstrap
repetitions. See `november_gate_incident.json` for hashes and event details.

## Recommended next steps

Publish this result unchanged, then build a performance-driven V4.2 under the
broader V4 product plan. Diagnose V3 versus M2 by band, distance, history
availability, solar regime, and coarse geography. Retraining, feature changes,
receiver-availability modeling, other algorithms, and more rows are valid when
the diagnostics support them. Preregister the successor with a fresh untouched
gate; do not score 2025 for V4.1.

## Reproduction

```bash
ml/.venv/bin/python ml/src/archive_v4_1/generate_report_artifact.py --profile m5
node ml/src/archive_v4/package_report.mjs --input \
  ml/results/propagation_v4_1/propagation_v4_1_calibration_recovery/REPORT.artifact.json --output \
  ml/results/propagation_v4_1/propagation_v4_1_calibration_recovery/REPORT.html
```
