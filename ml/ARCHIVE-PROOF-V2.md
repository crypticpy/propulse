# Archive Proof V2: Common-Support PSK Experiment

> Status: complete on the M3 development machine; full report validated at
> desktop and mobile widths.
> Written 2026-07-11 after review of the original March archive proof.

## Decision this experiment supports

The original proof established that a denser archive can improve model scores,
but it mixed PSKReporter and WSPR labels, evaluated different pair universes,
and included 6m in the HF aggregate. This experiment asks a narrower and more
defensible question:

> On the same path-band-hours, with the same train/validation/test dates and
> the same source-independent features, does training on the dense Madrigal
> PSKReporter feed produce a model that predicts dense PSKReporter holdout
> labels better than training on our sparse PSKReporter collector feed?

This is a data-quality proof, not the final multi-year production evaluation.
February-April 2026 has already informed model development and must not be
treated as an untouched final test.

## Result

The stricter proof supports archive-first training, with a more qualified and
useful conclusion than the original experiment:

| HF reference test | Dense physics | Sparse physics | Dense - sparse |
|---|---:|---:|---:|
| ROC-AUC | 0.9152 | 0.8983 | +0.0169 |
| PR-AUC | 0.9197 | 0.9050 | +0.0147 |
| Brier, common reference calibration | 0.1248 | 0.1285 | -0.0038 |

Dense physics training improved PR-AUC on all ten HF bands. It won six of
eight test days on reference-recalibrated Brier, but the day-block 95% interval
for the mean Brier difference included zero (`[-0.0078, 0.0009]`). The ranking
gain is the stronger physics-only result.

The full nowcast comparison was larger and stable:

| HF reference test | Dense nowcast | Sparse nowcast | Dense - sparse |
|---|---:|---:|---:|
| ROC-AUC | 0.9491 | 0.9157 | +0.0334 |
| PR-AUC | 0.9564 | 0.9262 | +0.0301 |
| Brier, common reference calibration | 0.0935 | 0.1173 | -0.0238 |

Dense nowcast won all eight test days; the day-block Brier interval was
`[-0.0255, -0.0215]`. Native sparse calibration produced Brier 0.2752 on dense
truth because the collector captured only 37.1% of reference positives. That
large native gap measures feed prevalence mismatch, not classifier skill.

The independent dense 6m model reached PR-AUC 0.7061 physics-only and 0.7998
with nowcast lags. Sparse 6m training was skipped because the collector had
zero positive 6m labels in every split.

XGBoost won the bounded engine bakeoff. Dataset construction took about 92
seconds, HF training and evaluation about 7.2 minutes, and 6m about 18 seconds
on the M3 machine. The primary visual and technical report is
`ml/results/archive_v2/REPORT.html`.

## Source contract

| Name | Filter | Role |
|---|---|---|
| Reference | Madrigal `ssrc = 'PSK'`, `mode_class = 'digital'` | Dense label source and evaluation truth |
| Sparse | Collector `source = 'pskreporter'`, supported digital modes | Comparison training labels |

WSPR (`ssrc = 'WSP'`) is excluded from both labels. RBN and DX Cluster are
excluded. Source composition is recorded in the generated dataset manifest so
future upstream changes cannot silently alter the experiment.

## Grain, exposure, and labels

One row is:

```text
(hour_utc, band, tx_field, rx_field)
```

The row exists only when all of the following are true:

1. The directional field pair has at least 300 reference and 300 sparse spots
   in the training period.
2. At least one transmitter in `tx_field` was decoded somewhere on that band
   during the preceding hour in the reference feed.
3. At least one reporter in `rx_field` decoded something on that band during
   the preceding hour in the reference feed.

This is a one-hour-ahead region-level opportunity set. It is tighter than the
old any-band endpoint activity rule and uses no target-hour activity, but it
still does not prove that a particular receiver heard a particular attempted
transmission. The labels are:

- `reference_open`: at least one matching Madrigal PSK report.
- `sparse_open`: at least one matching collector PSKReporter report.
- `reference_count` / `sparse_count`: matching report counts for diagnostics.

The candidate rows are identical for both models. No negative sampling is used;
the measured March risk set is small enough to retain in full.

## Independent tasks

- **HF:** 160m, 80m, 60m, 40m, 30m, 20m, 17m, 15m, 12m, and 10m.
- **6m:** a separate dataset and model. No HF aggregate includes 6m.

If the sparse 6m training label has only one class, the experiment records it
as not trainable instead of manufacturing a model or pooling it with HF.

## Time split

| Split | UTC interval |
|---|---|
| Train | 2026-03-01 through 2026-03-19 |
| Validation | 2026-03-20 through 2026-03-23 |
| Test | 2026-03-24 through 2026-03-31 |

Pair eligibility is computed from train only. Missing Madrigal hours never
enter the opportunity set. Validation selects the algorithm and iteration
count and fits calibration. Test is read only after those choices are fixed.

## Feature profiles

### Physics-only proof

This is the primary causal comparison. Both label sources receive identical
features:

- band and frequency;
- hour and day-of-year cyclic encodings;
- endpoint and midpoint latitude/longitude encodings;
- great-circle distance and initial bearing;
- endpoint and midpoint solar elevation;
- path darkness fraction sampled along the great circle;
- prior-completed-hour solar and geomagnetic observations;
- trailing solar/geomagnetic extrema and deltas using only prior hours;
- weekend and contest indicators;
- explicit missingness indicators for operational space-weather inputs.

No path, transmitter-field, or receiver-field ID is included in the primary
profile. That prevents pair memorization from masquerading as propagation
skill and permits evaluation on geography not represented by a categorical ID.

### Nowcast profile

A secondary profile adds source-specific observations available before the
target hour:

- path reports 1, 2, 3, and 24 hours earlier;
- reverse-path reports one hour earlier;
- transmitter-field and receiver-field band activity one hour earlier.

Reference-trained models use reference lags and sparse-trained models use
sparse lags. This arm measures the complete operational feed advantage, while
the physics-only arm isolates label density.

## Modeling and calibration

LightGBM and XGBoost histogram classifiers are compared on validation Brier
score, then PR-AUC. Inputs are prepared with Polars and NumPy; pandas is not
part of the V2 pipeline. Categorical pair IDs are intentionally absent.

The selected model is calibrated on validation predictions with isotonic
regression when both classes and enough distinct predictions exist. Native
calibration measures the operational feed probability. A sensitivity calibrates
both models against the same dense validation truth before comparing Brier and
log loss; this prevents source prevalence alone from deciding that comparison.
Raw, native-calibrated, and reference-recalibrated metrics are retained. Model
artifacts include the feature list, split boundaries, source filters, library
versions, and manifest hash.

## Metrics and acceptance criteria

Primary comparison: reference-trained versus sparse-trained model, both scored
against `reference_open` on identical test rows.

Reported metrics:

- ROC-AUC, PR-AUC, Brier score, Brier skill versus band/hour climatology, and
  log loss;
- calibration error and precision at 50%, 70%, 80%, and 90% claims;
- per-band row count, prevalence, PR-AUC, and Brier score;
- paired per-day Brier differences with a day-block bootstrap interval;
- source label agreement, sparse recall of reference positives, and false-open
  rate relative to the reference feed.

The archive-density claim passes when the reference-trained physics-only model
improves reference-test Brier and PR-AUC, the direction is stable across most
test days and major HF bands, and calibration does not regress materially.

## Efficient implementation

1. DuckDB scans the source Parquet, constructs the train-only common pair set,
   aggregates labels/activity, joins lagged values, and writes one HF and one
   6m Parquet file.
2. Static geometry is computed once per pair. Time and solar features are
   computed once per hour where possible.
3. Polars lazy scans validate schema and build model matrices without a pandas
   copy of the complete table.
4. The full common-support dataset is retained. If future archives exceed the
   machine limit, deterministic hash sampling and inverse-probability weights
   will be added explicitly rather than using unseeded `random()`.

Final one-hour-ahead dataset size on this machine:

| Task | Train | Validation | Test |
|---|---:|---:|---:|
| HF | 4,879,718 | 1,088,845 | 2,220,493 |
| 6m | 318,557 | 68,605 | 146,480 |

## Commands

```bash
ml/.venv/bin/python ml/src/archive_v2/build_proof_dataset.py
ml/.venv/bin/python ml/src/archive_v2/train_proof.py --task hf
ml/.venv/bin/python ml/src/archive_v2/train_proof.py --task 6m
```

Generated data and models remain ignored under `ml/data/` and `ml/models/`.
The small manifest and final experiment report are committed under
`ml/results/archive_v2/`.

## Reproducing on the M5 Max

Git contains the pipeline, locked dependency versions, manifests, metrics, and
the self-contained report. It intentionally does not contain source or derived
Parquet files or fitted model binaries. Before running on another machine,
transfer these inputs while preserving their repository-relative paths:

- `ml/data/processed/madrigal/**/*.parquet` (about 14 GB);
- `ml/data/processed/spots_slim.parquet`;
- `ml/data/raw/solar_snapshots.csv`.

The Madrigal Parquet can instead be reconstructed from the public archive with
the existing pull and conversion tools. `spots_slim.parquet` is the local
collector export and must be copied from this machine. To skip dataset assembly,
also transfer `ml/data/processed/archive_v2/`; to skip fitting entirely, transfer
`ml/models/archive_v2/` as well. Create `ml/.venv`, install
`ml/requirements.txt`, then run the three commands above from the repository
root. The manifest records input sizes, time bounds, and source counts so the
copy can be checked before training.

## Follow-on multi-year experiment

Do not immediately materialize a billion-row training table. After this proof:

1. Build opportunity-level WSPR and RBN pilots from representative months near
   solar minima/maxima and across seasons.
2. Produce learning curves at 5M, 20M, 50M, and 100M rows on the M5 Max.
3. Reserve a future collector window as the locked production test.
4. Rent CUDA hardware only if the learning curve is still improving or a
   compact embedding model beats the tree baseline on temporal and spatial
   holdouts.
