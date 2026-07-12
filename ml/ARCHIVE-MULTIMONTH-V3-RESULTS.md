# Archive Multi-Month V3: Methodology and Results

> Status: completed on 2026-07-12.
> Run: `archive_v3_eight_month`.
> Visual report: [`results/archive_v3/archive_v3_eight_month/REPORT.html`](results/archive_v3/archive_v3_eight_month/REPORT.html).
> Decision: the eight-month statistical experiment passed; an all-years build,
> public product probability, and GPU/deep-model work are not yet approved.

## Executive finding

The exposure-aware HF nowcast generalized across season, solar regime, and the
locked October 2024 month. On 55,863,247 locked path-hour/power rows it achieved
a weighted Brier score of `0.043738`, versus `0.077440` for train-only band-hour
climatology, for Brier skill of `0.4352`. Open-path PR-AUC was `0.9685`.

The nowcast beat climatology on all 31 locked days. The day-block mean-Brier
delta bootstrap interval was `[-0.034318, -0.032340]`. It also beat the
geometry/space-weather-only tree on all 31 days, with interval
`[-0.012743, -0.011818]`.

This is credible evidence for the declared WSPR estimand, not universal contact
probability. Multi-year expansion remains blocked by three preregistered gates:

1. The 20M-to-50M relative Brier improvement was only `0.2828%`.
2. A trusted ITU-R P.533/VOACAP probability baseline was not completed.
3. The prospective Propulse collector window starts on 2026-08-01 and is not
   available yet.

The next run should improve evaluation and labels, not merely add years.

## Frozen design

### Months and splits

| Purpose | Months |
| --- | --- |
| Train | 2019-01, 2019-04, 2019-07, 2019-10, 2024-01, 2024-04 |
| Validation and calibration | 2024-07 |
| Locked archive test | 2024-10 |

The locked month was not evaluated until both rolling-origin nowcast folds had
positive Brier skill and day-block intervals wholly below zero.

### Sources

- [WSPRnet monthly archive](https://www.wsprnet.org/archive/): primary spot,
  power, grid, SNR, and inferred-exposure data.
- [NASA SPDF OMNI2](https://omniweb.gsfc.nasa.gov/html/ow_data.html): hourly
  solar-wind and geomagnetic history.
- [GFZ Hp60](https://kp.gfz.de/en/hp30-hp60/data): high-cadence geomagnetic
  state, CC BY 4.0.
- [ITU-R P.533-14](https://www.itu.int/rec/R-REC-P.533-14-201908-I/en) and
  [NTIA HF models](https://its.ntia.gov/software/high-frequency/high-frequency-propagation-models/):
  specified baseline references, not executed in this run.

The committed source registry records the exact URL/request, retrieval time,
byte size, SHA-256, source status, terms URL, and parser version for all 18 raw
inputs. Raw WSPR archives remain ignored because the archive states no clear
redistribution license.

### Observation and label

For each native WSPR slot and band:

1. A transmitter is active when at least one receiver heard it.
2. A receiver is active when it heard at least one transmitter.
3. All decoded transmitter-receiver pairs are positives.
4. Four deterministic active receivers are sampled per active transmitter;
   non-decoded pairs are negatives.
5. Sampled negatives receive inverse-probability weights.
6. Rows aggregate to `(hour, band, tx_grid4, rx_grid4, power_bin_dbm)`.

The fractional target is `successes / opportunities`; binomial cross-entropy
uses inferred opportunities as sample weight. The exact station-cartesian audit
was 8,003,944,014 HF opportunities. The weighted sample represented
7,993,056,794.25, with monthly relative errors between `-0.198%` and `-0.054%`,
well inside the 3% gate.

The estimand is:

```text
P(single WSPR decode | transmitter heard active somewhere,
                       receiver heard active on the band,
                       path, hour, band, power, prior-known state)
```

Transmissions heard nowhere are unobservable. This remains a conditional
network-detection probability, not a controlled transmission-success rate.

### Features and leakage control

The geometry/space-weather profile has 60 HF inputs: band/frequency, binned
power, distance, bearing, endpoint/midpoint coordinates, endpoint/midpoint solar
elevation, darkness, time cycles, and lag-aligned OMNI2/GFZ state and
missingness.

The nowcast adds four path-history features: H-1, H-2, H-3, and H-24 success.
Space-weather rows set `available_at = observed_hour + 1h` and join only where
`available_at = target_hour`. Target-hour or future path observations are never
features.

Calls, station identifiers, and exact path IDs are excluded from the model.
Six meters is built, fitted, calibrated, and reported as an independent task.

## Data engineering result

| Artifact | Rows | Size |
| --- | ---: | ---: |
| Compressed WSPR inputs | 810,545,893 valid spots | 15.04 GB |
| Typed bronze Parquet | 810,545,893 | 17.06 GB |
| HF path-hour/power opportunities | 273,137,641 | included in ignored workspace |
| Final HF feature matrix | 273,137,641 | 33.93 GB |
| Final 6m feature matrix | 613,388 | 57.0 MB |

DuckDB reads gzip directly and writes Zstandard Parquet. Polars lazy scans add
solar-geometry features and validate the model boundary; pandas is not used.

The first all-month feature join exposed 985 null rows during a large spilled
DuckDB join, which Polars then amplified into 1,036,220 invalid derived rows.
The result was rejected before training. The corrected builder processes each
non-contiguous month independently, explicitly disables implicit Hive partition
columns, and applies hard input/output row, timestamp, weight, and split
invariants. The rebuilt matrix reconciled exactly: 273,137,641 input and output
rows, zero invalid rows. Runtime fell from 409 to 99 seconds.

## Model selection

Both candidates use weighted binary log loss with fractional targets. The
bounded 1M-row validation bakeoff selected XGBoost:

| Engine | Validation Brier | Validation log loss | Best round |
| --- | ---: | ---: | ---: |
| XGBoost 3.3.0 | 0.053556 | 0.208161 | 339 |
| LightGBM 4.6.0 | 0.089601 | 0.299941 | 414 |

The selected XGBoost configuration used histogram trees, depth 9, learning rate
0.04, minimum child weight 200, 85% row sampling, 90% feature sampling, L1 0.25,
L2 8.0, and up to 1,000 rounds with 75-round early stopping. Training and
validation were deterministically capped at 50M and 5M rows. Global and
per-band isotonic calibrators were fitted on July only; per-band calibration won
on July for both HF profiles and the 6m nowcast.

## HF results

| Model | Locked Brier | Log loss | PR-AUC | ROC-AUC | Skill vs climatology |
| --- | ---: | ---: | ---: | ---: | ---: |
| Global train prevalence | 0.078071 | - | - | - | - |
| Band-hour climatology | 0.077440 | - | - | - | 0.0000 |
| Geometry + space weather | 0.056074 | 0.216208 | 0.9323 | 0.9036 | 0.2759 |
| Nowcast + legal path lags | **0.043738** | **0.173687** | **0.9685** | **0.9500** | **0.4352** |

Locked weighted prevalence was `0.098752`; the nowcast mean prediction was
`0.101691`. The highest reliability bin predicted `0.9374` and observed
`0.9153`, showing modest high-end overconfidence despite good overall Brier.

### Rolling-origin tests

| Fold | Model | Brier | Skill | Day-block 95% interval | Daily wins |
| --- | --- | ---: | ---: | --- | ---: |
| Jan/Apr -> Jul -> Oct 2019 | Geometry/weather | 0.057398 | 0.2902 | [-0.024040, -0.022680] | 31/31 |
| Jan/Apr -> Jul -> Oct 2019 | Nowcast | 0.045832 | 0.4332 | [-0.035819, -0.033975] | 31/31 |
| 2019 -> Jan -> Apr 2024 | Geometry/weather | 0.062058 | 0.2206 | [-0.017929, -0.016994] | 30/30 |
| 2019 -> Jan -> Apr 2024 | Nowcast | 0.046045 | 0.4217 | [-0.034334, -0.032446] | 30/30 |

### Learning curve

| Train rows | Locked Brier | Log loss | PR-AUC | Wall time |
| ---: | ---: | ---: | ---: | ---: |
| 5M | 0.044165 | 0.175068 | 0.96728 | 174 s |
| 20M | 0.043875 | 0.174198 | 0.96794 | 282 s |
| 50M | 0.043751 | 0.173922 | 0.96798 | 539 s |

The curve still improves, but the 20M-to-50M relative Brier gain is only
`0.2828%`. That does not justify an all-years materialization before label and
baseline gaps are closed.

### Generalization slices

- Unseen endpoint grids: 158,139 rows, Brier `0.036225`, PR-AUC `0.9630`.
- Unseen grid-pair paths: 2,307,065 rows, Brier `0.021884`, PR-AUC `0.9032`.
- Every HF band had PR-AUC above `0.932`; Brier ranged from `0.039922` on 20m
  to `0.066512` on 60m.
- Geomagnetic quiet/active/storm Brier was `0.044496`, `0.043767`, and
  `0.040585`; storm PR-AUC was lower at `0.9558` but did not collapse.
- Short paths remain hardest: Brier was `0.084264` below 1,000 km and
  `0.099455` from 1,000-3,000 km, versus about `0.010` beyond 6,000 km. This
  partly reflects different target prevalence, but it identifies the next
  calibration/modeling priority.

At prediction thresholds 0.5, 0.7, 0.8, and 0.9, observed rates were 0.637,
0.777, 0.841, and 0.915. Coverage falls from 6.85% at 0.5 to 0.16% at 0.9.

## Separate 6m result

The 6m nowcast used 386,832 train, 115,246 validation, and 111,310 locked rows.
Its locked Brier was `0.012749`, PR-AUC `0.9161`, and skill over 6m
band-hour climatology was `0.8434`; its day-block interval was
`[-0.073650, -0.067780]`.

This is encouraging but not a product-valid 6m probability. Active 6m WSPR
stations are sparse and event-selected, and the model lacks sporadic-E-specific
`foEs`, ionosonde, TEC, and terrestrial-weather diagnostics. Keep it separate
and collect more event/quiet coverage.

## Validation and limits

Automated validation passed `70/70` HF checks and `66/66` 6m checks, covering
source presence/checksums, month coverage, bronze uniqueness, opportunity
weights, exact-exposure error, schemas, target/weight bounds, temporal split
isolation, finite metrics, calibration support, and rolling stability.

The run intentionally stops short of claiming every item in the V3 plan:

- P.533/VOACAP was not executed. The repository's existing analytical code is
  not a validated P.533 reference implementation, and the available NTIA
  package was not adopted without a clean Apple Silicon/license evaluation.
- Callsigns are removed before the final aggregate, so unseen-station holdouts
  and cross-fitted receiver/transmitter nuisance effects were not evaluated.
- The V2 dataset has a different source/label definition and was not treated as
  a directly comparable baseline.
- Platt/beta and band-family calibration, band-family models, SHAP, formal
  cluster intervals, and geometry/weather ablations remain open. Physics versus
  nowcast is the completed path-history ablation.
- The prospective 2026-08-01 through 2026-09-30 collector window is future and
  remains unopened.
- WSPR network geography, equipment, antenna, power, local noise, and
  participation create selection bias that inverse negative-sampling weights
  do not remove.

## Compute decision

The run used an Apple M5 Max, 128 GB unified memory, Python 3.12.11, 18 logical
CPUs, and the external `Projects` SSD. Peak observed working memory was about
86 GB during full-test slicing. The corrected feature build took 99 seconds;
the 50M primary physics and nowcast stages took about 865 and 819 seconds before
the separate learning-curve fits.

The M5 is sufficient. A rented GPU is not justified for the next step. GPU or a
neural model should be reconsidered only after better labels/baselines produce
a still-rising, operationally meaningful learning curve.

## Next logical step

1. Freeze this report and implement a reproducible P.533/VOACAP circuit-score
   baseline plus validation-only probability mapping.
2. Preserve callsign only in ignored fold-building data so unseen-station and
   cross-fitted observation-effect experiments can be run without publishing
   identities or leaking test behavior.
3. Improve short-path and high-confidence calibration, using validation-only
   band/distance shrinkage rather than adding raw station identity to the
   propagation model.
4. Keep the 2026-08-01 through 2026-09-30 collector window unopened, then run
   one archive-to-product evaluation with the model and calibrator frozen.
5. Only then select a small set of additional years or targeted storm/season
   months. Do not build every available month yet.

Optional RBN, GNSS TEC, GIRO/ionosonde, and HamSCI data should enter as separate
external evaluation or research-feature arms. They should not be pooled with
WSPR labels as if their detection processes were equivalent.

## Reproduction

On a machine with at least 128 GB RAM and 150 GB free fast storage:

```bash
python3 -m venv ml/.venv
ml/.venv/bin/python -m pip install -r ml/requirements.txt

ml/.venv/bin/python ml/src/archive_v3/inventory.py \
  --output ml/data/manifests/archive_v3_eight_month_environment.json
ml/.venv/bin/python ml/src/archive_v3/download_sources.py \
  --config ml/config/archive_v3_eight_month.json
ml/.venv/bin/python ml/src/archive_v3/build_space_weather.py \
  --config ml/config/archive_v3_eight_month.json
ml/.venv/bin/python ml/src/archive_v3/build_bronze.py \
  --config ml/config/archive_v3_eight_month.json --force
ml/.venv/bin/python ml/src/archive_v3/build_source_manifest.py \
  --config ml/config/archive_v3_eight_month.json

for task in hf 6m; do
  ml/.venv/bin/python ml/src/archive_v3/build_opportunities.py \
    --config ml/config/archive_v3_eight_month.json --task "$task" --force
  ml/.venv/bin/python ml/src/archive_v3/build_features.py \
    --config ml/config/archive_v3_eight_month.json --task "$task" --force
done

# Must complete before the locked HF run.
ml/.venv/bin/python ml/src/archive_v3/rolling_evaluation.py \
  --config ml/config/archive_v3_eight_month.json --task hf

ml/.venv/bin/python ml/src/archive_v3/train_experiment.py \
  --config ml/config/archive_v3_eight_month.json --task 6m
ml/.venv/bin/python ml/src/archive_v3/train_experiment.py \
  --config ml/config/archive_v3_eight_month.json --task hf

for task in hf 6m; do
  ml/.venv/bin/python ml/src/archive_v3/audit_dataset.py \
    --config ml/config/archive_v3_eight_month.json --task "$task"
  ml/.venv/bin/python ml/src/archive_v3/validate_experiment.py \
    --config ml/config/archive_v3_eight_month.json --task "$task"
done
ml/.venv/bin/python ml/src/archive_v3/generate_report.py \
  --config ml/config/archive_v3_eight_month.json
```

The fitted binaries, raw archives, and large Parquet data remain ignored. The
committed configs, source, aggregate manifests, SHA-256 values, metrics,
validation JSON, model/data cards, and visual report define the auditable run.
