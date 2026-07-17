# A Multi-Year, Equipment-Aware Propagation Nowcast for Amateur Radio

## Abstract

Propulse V4 studies calibrated amateur-radio propagation nowcasting across
quarterly WSPR archives from 2018 through 2024 while preserving a locked 2025
archive and a prospective 2026 window. The approach combines an exposure-aware
single-decode estimand, deterministic regime-balanced nested samples, boosted
trees, an official [ITU-R P.533](https://www.itu.int/rec/R-REC-P.533) baseline,
and a privacy-safe deterministic station adapter derived from the operator's
existing virtual shack. This document reports development evidence only.

## The high-school version

Radio signals do not travel equally well in every direction or at every hour.
The Sun, Earth's ionosphere, geomagnetic disturbances, distance, darkness, band,
and recent reports all supply clues. The model learns how those clues lined up
with real WSPR decodes in the past. It then answers a narrow question: **if a
transmitter and a receiver are available, how likely is one WSPR decode on this
path-hour?** StationCast adjusts that open core estimate for the operator's
realizable power, cable loss, directional antenna gain, receiver evidence, and
mode assumptions. It is a probability map, not a promise of a contact.

## Development result

The current M2 candidate uses 50.0M rows and reaches Brier
`0.04473073023523096` on the full October 2024 development
gate, with skill `0.42504900711090876` versus natural
band-hour climatology. On 10,000 identical October circuits, M2 Brier was 0.043771 versus 0.078157 for calibrated P.533. These numbers do not include the locked
2025 or prospective 2026 tests and must not be described as final generalization.

### Why the locked test remains closed

The detailed October gate **failed** its short-path calibration non-regression
check. Calibrated M2 was slightly worse than raw M2 on
0-500 km (+0.000153 Brier versus raw M2), 500-1500 km (+0.000287 Brier versus raw M2). M2 still beat
M1 and climatology strongly in those slices, but the calibration guardrail is a
frozen release condition. We therefore did not open 2025 and will not retrofit
this candidate after seeing October. A future version must preregister any
identity/raw-by-distance calibration choice using calibration data only and use
a fresh untouched development gate.

### Learning curve

| Training rows | October Brier | Runtime minutes | Peak RSS GB |
|---:|---:|---:|---:|
| 5,000,000 | 0.047195 | 2.3 | 18.0 |
| 20,000,000 | 0.045565 | 2.9 | 68.7 |
| 50,000,000 | 0.044731 | 7.2 | 68.7 |

The 50M cap was preregistered. A 100M experiment is justified only if the
20M-to-50M gain is material enough to outweigh compute, serving, and open-source
reproduction costs. More rows are not automatically better evidence.

### Rolling-origin checks

| Gate month | Brier | Skill vs climatology |
|---|---:|---:|
| 2020-10 | 0.052307 | 38.60% |
| 2021-10 | 0.051758 | 38.27% |
| 2022-10 | 0.050787 | 37.70% |
| 2023-10 | 0.050506 | 39.58% |

## Data and provenance

The development archive uses Jan/Apr/Jul/Oct snapshots so multiple years and
solar regimes are represented without loading every raw row at once. Primary
sources and baselines are:

- [WSPRnet archive](http://wsprnet.org/drupal/downloads) for public decode
  observations and network exposure evidence;
- [NASA SPDF OMNI](https://spdf.gsfc.nasa.gov/pub/data/omni/) and
  [GFZ Kp data](https://kp.gfz-potsdam.de/en/data) for historical solar-wind and
  geomagnetic context;
- [NOAA SWPC JSON services](https://services.swpc.noaa.gov/json/) for
  operationally available space-weather features;
- [ITU-R P.533](https://www.itu.int/rec/R-REC-P.533) as a pinned physical
  propagation baseline;
- the [NOAA 45-day forecast](https://services.swpc.noaa.gov/json/45-day-forecast.json)
  for forward-archived FutureCast inputs; and
- [PSK Reporter developer information](https://www.pskreporter.info/pskdev.html)
  for later external digital-mode validation, subject to service terms.

Raw source bytes, retrieval timestamps, checksums, parser versions, licenses,
and time semantics are recorded in the source registry and manifests. The HF
candidate pool contains `673,981,409` natural rows
and `17,921,373,181` inferred opportunities.
The exact nested cohorts contain 5M, 20M, and 50M rows, with post-stratification
back to natural opportunity mass.

## Why missing spots are not automatic failures

A public spotting network is not a controlled laboratory. A receiver may be
offline, listening elsewhere, overloaded, or unable to hear the transmitter for
equipment reasons. V4 first estimates transmitter/receiver availability and
constructs path-hour opportunities. The outcome is a single decode conditional
on that inferred exposure. This reduces a major label error in naive approaches
that mark every absent spot as failed propagation.

## Leakage controls and evaluation protocol

Training uses quarterly anchors from 2018-2023. January and July 2024 control
early stopping. April days 1-20 fit calibration candidates; April days 21-end
select the calibration family; full April refits only that selected family.
October 2024 is evaluation-only. The 2025 archive remains locked until every
pre-2025 gate passes, and the frozen prospective window is 2026-08-01 through
2026-09-30. Forecast features must have `issued_at <= prediction issue_time`;
observations may never masquerade as historical forecasts.

## Model design

M1 uses geometry, calendar/solar position, power bin, and operationally
available space-weather inputs. M2 adds recent path-history features and is the
NowCast candidate. Both use XGBoost histogram trees because they handle mixed
nonlinear regimes efficiently, reproduce on Apple silicon, and serve without a
GPU. Isotonic calibration is selected only inside April, with band/distance
fallbacks for sparse strata. The inference bundle contains independent physics
and nowcast profiles, checksums, exact feature order, calibrators, and version
metadata.

The bounded 5M LightGBM check selected **xgboost**: LightGBM minus XGBoost Brier was `-0.000441` against a fixed `0.000473` tolerance. This is a regression guard, not permission to tune across
frameworks after seeing the locked test.

## Source outages

Recent network history is useful but fragile. When it is stale, the API selects
M1 rather than filling missing evidence, adds an explicit OOD flag, and lowers
confidence. The packaged fallback passed all gates on 5,000 held-out rows; mean confidence changed from 0.99 to 0.74. This behavior is part of the model contract and
is shown to operators through freshness and profile metadata.

## StationCast and the virtual shack

The product already stores radios, amplifiers, feed lines, inline components,
antennas, presets, chains, and saved operating locations. StationCast resolves
the active chain or preset and its linked location. For every path bearing, the
browser derives a versioned envelope with conducted power, passive loss, power
at the antenna, EIRP/ERP, directional gain, receiver evidence, local-noise
assumptions, mode bandwidth/threshold, warnings, and a stable fingerprint.

Raw equipment IDs and inventory records are rejected by the prediction API.
Stage A is a deterministic, auditable link-budget adapter. Learned station or
mode residuals require opt-in prospective outcomes and separate evidence; they
are not inferred from private profiles in this study.

## ReachMap product flow

ReachMap scores a 15-degree global grid in one batch from the active operating
location. Each cell gets its own bearing-dependent antenna envelope. The same
probability surface renders on the 3D globe, flat map, and azimuthal view with a
shared five-step scale, issue/valid time, confidence, served profile, and model
version. Current live path history is unavailable globally, so the first map
correctly serves the physics fallback. Future horizons stay disabled until
their issued-forecast gates pass.

## Independent 6m program

Six meters is not mixed into HF. Its candidate routes auroral, tropospheric,
F2/TEP, sporadic-E, meteor-scatter, and unknown mechanism hypotheses. Covered
development rows currently show overall Brier skill
`0.7604474481979135` versus mechanism climatology, but
sporadic-E, meteor-scatter, and unknown cases lack sufficient evidence. The 6m
model remains experimental until mechanism labels are validated with permitted
ionosonde, weather/reanalysis, and event-catalog sources such as
[NOAA NOMADS](https://nomads.ncep.noaa.gov/).

## FutureCast is deliberately withheld

FutureCast requires genuine forecasts that were issued before each prediction,
at +3, +6, +12, and +24 hours. The minimum required archive is 90 distinct
issuance days; the current archive contains `1` day(s).
No historical observation backfill is allowed. Unsupported horizons therefore
remain visibly withheld rather than being presented as forecasts.

## Reproduction

The committed orchestration is resumable and uses partitioned Parquet, Polars,
DuckDB, PyArrow, and XGBoost rather than loading the full 886M-row feature store
into memory. On a prepared machine:

```bash
npm install
ml/.venv/bin/python ml/src/archive_v4/run_pipeline.py prepare --profile m5
ml/.venv/bin/python ml/src/archive_v4/run_pipeline.py train-validation --profile m5
ml/.venv/bin/python ml/src/archive_v4/run_pipeline.py rolling-validation --profile m5
ml/.venv/bin/python ml/src/archive_v4/run_pipeline.py compare-lightgbm --profile m5
ml/.venv/bin/python ml/src/archive_v4/run_pipeline.py detailed-validation --profile m5
ml/.venv/bin/python ml/src/archive_v4/run_pipeline.py package-serving --profile m5
ml/.venv/bin/python ml/src/archive_v4/run_pipeline.py source-outage-validation --profile m5
ml/.venv/bin/python ml/src/archive_v4/run_pipeline.py report-artifact --profile m5
node ml/src/archive_v4/package_report.mjs --input   ml/results/propagation_v4/propagation_v4_multiyear_50m/REPORT.artifact.json --output   ml/results/propagation_v4/propagation_v4_multiyear_50m/REPORT.html
npm run verify
```

Large raw/processed files and model binaries remain ignored; checksums and
manifests make each permitted artifact traceable. The locked 2025 command is a
separate scoped execution and is intentionally absent above.

## Limitations and release boundary

- The short-path calibration non-regression gate failed on 0-500 km (+0.000153 Brier versus raw M2), 500-1500 km (+0.000287 Brier versus raw M2).
- The frozen V3/B2 development comparison has not been produced.
- 2025 and the 2026 prospective window have not been scored.
- Public network participation and equipment exposure remain imperfect.
- WSPR evidence does not establish FT8, CW, SSB, receive, or two-way-QSO
  probability.
- 6m mechanism labels are hypotheses, and FutureCast lacks enough issuances.
- UI shadow parity, operator decision utility, and opt-in beta calibration are
  not yet complete.

## Open, nonprofit research commitment

Propulse is intended as an open, nonprofit research and community project.
Subscriptions or donations cover operating costs and product services; they do
not turn the scientific core into a closed claim. Code, configs, schemas,
feature definitions, tests, aggregate metrics, model/data cards, the research
article, and legally redistributable model artifacts will be public. Restricted
raw archives, private locations, callsigns, and shack inventories will not be
redistributed. Failed gates, weak bands, disabled horizons, and negative results
will be published alongside successes.
