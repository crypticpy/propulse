# Archive Multi-Month V3: Execution and M5 Handoff Plan

> Status: frozen preregistration; executed on 2026-07-12 with deviations
> documented in [`ARCHIVE-MULTIMONTH-V3-RESULTS.md`](ARCHIVE-MULTIMONTH-V3-RESULTS.md).
> The unchecked items below are intentionally preserved rather than rewritten
> after observing results.
> Created: 2026-07-11.
> Prerequisite: Archive Proof V2 and its validated report.
> Primary decision: run an exposure-aware, representative eight-month pilot
> before committing to a multi-year materialization or a neural model.

## Handoff instruction

On the M5, point the coding agent to this file with:

> Read `ml/ARCHIVE-MULTIMONTH-V3-PLAN.md` and execute it phase by phase. Start
> with Phase 0, preserve all locked-test rules, update the checklist and run
> manifest as work completes, and do not begin the full eight-month build until
> the two-month smoke experiment and label audits pass.

The agent should also read:

- [`ARCHIVE-PROOF-V2.md`](ARCHIVE-PROOF-V2.md) for the experiment being
  superseded;
- [`results/archive_v2/REPORT.html`](results/archive_v2/REPORT.html) for the V2
  results and limitations;
- [`ARCHIVE-TRAINING.md`](ARCHIVE-TRAINING.md) for the longer-term archive
  direction.

No passwords, API credentials, machine addresses, or private SSH details may be
written to this repository, manifests, logs, reports, or shell scripts.

## Executive decision

V2 is strong enough to justify scaling, but not strong enough to jump directly
to all available years. The largest remaining error is the observation process:
an absent spot can mean a closed path, an inactive transmitter, an inactive
receiver, a receiver on another band, insufficient power, or local noise.

V3 will therefore improve labels before model complexity. Its primary target is
the probability that one known transmission opportunity is decoded by a known
active receiver. A secondary product transform will estimate the probability of
at least one decode over a declared number of attempts.

The experiment must answer four questions:

1. Does exposure-aware WSPR training generalize across season and solar regime?
2. Does archive training improve a locked future Propulse collector window?
3. Does the model generalize to unseen paths, grid regions, and stations?
4. Is the learning curve still improving enough at 50 million opportunities to
   justify multi-year expansion?

## Non-goals

- Do not pool WSPR, PSK Reporter, Madrigal PSK, and RBN observations as if they
  were interchangeable labels.
- Do not treat every missing spot as a negative.
- Do not use target-hour measurements as one-hour-ahead predictors.
- Do not add station IDs to the primary propagation model.
- Do not rent a GPU or build a deep model before the boosted-tree learning curve
  and label audits are complete.
- Do not redistribute raw archives until source terms have been recorded and
  reviewed.
- Do not tune against the prospective collector test window.

## Source registry

All downloaders must record URL, request parameters, retrieval time, byte size,
SHA-256, source revision/status, declared license or terms URL, and the parser
version in `ml/data/manifests/archive_v3_sources.json`.

### Required sources

| Source | Role | Access | Terms and handling |
|---|---|---|---|
| WSPRnet monthly spots | Primary exposure-aware HF and 6m observations; power and SNR targets | [Monthly archive](https://www.wsprnet.org/archive/), filename pattern `wsprspots-YYYY-MM.csv.gz` | Publicly downloadable, but no clear redistribution license is stated on the archive index. Keep raw files ignored, publish download code and hashes, and confirm terms before redistributing rows or derived datasets. |
| NASA SPDF OMNI2 | Hourly IMF, solar-wind plasma, proton flux, F10.7, Kp, AE, and Dst history | [OMNIWeb](https://omniweb.gsfc.nasa.gov/ow.html), [data documentation](https://omniweb.gsfc.nasa.gov/html/ow_data.html) | Record NASA/SPDF acknowledgement and parameter provenance. Distinguish definitive/reprocessed data from values that would have been operationally available. |
| GFZ Kp and Hpo | Definitive/nowcast Kp plus 30- and 60-minute Hp indices | [Kp data](https://kp.gfz.de/en/data), [Hp30/Hp60 data](https://kp.gfz.de/en/hp30-hp60/data) | CC BY 4.0; retain attribution, DOI/version, and definitive/nowcast status. |
| Existing Propulse collector export | Locked cross-feed evaluation, never the archive training truth | Local ignored file `ml/data/processed/spots_slim.parquet` | Private working input. Record only schema, hashes, counts, and time bounds in Git. Do not publish callsign-level rows without a separate policy decision. |
| Existing Madrigal PSK Parquet | Dense PSK external comparison and continuity with V2 | Local ignored tree `ml/data/processed/madrigal/`; reconstruction uses [Madrigal remote-access documentation](https://cedar.openmadrigal.org/docs/name/madContents.html) | Preserve source/instrument metadata and Madrigal acknowledgements. Do not silently mix non-PSK modes. |
| Solar snapshots used by V2 | Reproduction and comparison only | Local ignored file `ml/data/raw/solar_snapshots.csv` | OMNI2/GFZ should become the canonical V3 historical source after reconciliation. |

### Required physics baseline

| Source | Role | Access | Handling |
|---|---|---|---|
| ITU-R P.533-14 | Established HF circuit-performance baseline for 2-30 MHz | [Recommendation and free download](https://www.itu.int/rec/R-REC-P.533-14-201908-I/en) | Do not copy the copyrighted recommendation into the repository. Record version and invocation parameters. |
| NTIA VOACAP/REC533 | Executable/reference implementation candidate | [NTIA HF propagation models](https://its.ntia.gov/software/high-frequency/high-frequency-propagation-models/), [NTIA user guide](https://its.ntia.gov/publications/details?pub=3258) | Confirm source-code license and Apple Silicon build behavior before vendoring anything. Prefer a reproducible external install or a clearly licensed implementation. |

### Secondary and optional sources

| Source | Proposed use | Gate before use |
|---|---|---|
| Reverse Beacon Network | Independent CW ranking test and later mode-specific detection head | Use the [RBN raw-data archive](https://www.reversebeacon.net/raw_data/). Keep CW separate from WSPR/PSK labels. Record RBN's request to share analysis and results with its community. |
| GNSS TEC through Madrigal | Path-integrated ionospheric research feature and error analysis | Add only after the exposure-aware baseline. Build an operational arm that works when TEC is absent or delayed. |
| GIRO/DIDBase ionosondes | `foF2`, `hmF2`, and especially `foEs` diagnostics for HF/6m | Review the [CC BY-NC-SA rules](https://giro.uml.edu/didbase/RulesOfTheRoad.html), obtain an account and written usage confirmation, and keep covered data out of unrestricted artifacts. Nonprofit status alone is not a license decision. |
| HamSCI GRAPE | Doppler/event diagnostics for flares, TIDs, and storms | Optional research validation after the primary contact model is stable; see [GRAPE science and repository information](https://hamsci.org/GRAPE-science/). |
| ERA5 | Weather/tropospheric experiments, mainly for later VHF work | Not a V3 HF priority. If used later, retrieve through the [Copernicus ERA5 hourly dataset](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels) and retain CC BY attribution. |

## Selected archive months

Use non-contiguous months to cover season and solar regime without immediately
creating a multi-year data problem:

| Regime | Months |
|---|---|
| Lower solar activity | 2019-01, 2019-04, 2019-07, 2019-10 |
| Higher solar activity | 2024-01, 2024-04, 2024-07, 2024-10 |

The two-month smoke experiment uses `2019-04` and `2024-04`. This holds season
approximately constant while changing solar regime. The full pilot uses all
eight months.

Do not decompress full WSPR CSV files to persistent disk. Stream `.csv.gz` into
typed, partitioned Parquet and retain the compressed raw input plus hashes.
Recent WSPR files are multiple compressed gigabytes per month, so require at
least 150 GB free working storage before the eight-month build. Report actual
sizes after Phase 1 rather than relying on this estimate.

## Directory contract

All large paths remain ignored by Git.

```text
ml/data/
  manifests/
    archive_v3_sources.json
    archive_v3_run.json
  raw/archive_v3/
    wspr/year=YYYY/month=MM/wsprspots-YYYY-MM.csv.gz
    rbn/year=YYYY/month=MM/*.zip
    omni/
    gfz/
  bronze/archive_v3/
    wspr/year=YYYY/month=MM/*.parquet
    rbn/year=YYYY/month=MM/*.parquet
    space_weather/*.parquet
  processed/archive_v3/
    opportunities/task=hf/year=YYYY/month=MM/*.parquet
    opportunities/task=6m/year=YYYY/month=MM/*.parquet
    folds/*.parquet
ml/models/archive_v3/
ml/results/archive_v3/
```

Committed artifacts will include schemas, manifests without private rows,
checksums, aggregate quality reports, metrics, model cards, environment lock,
and a self-contained visual report. Raw data, opportunity tables, predictions
containing station identifiers, and model binaries remain ignored unless a
separate release review approves them.

## Canonical observation schema

The bronze WSPR parser must preserve at least:

```text
observed_at_utc       timestamp[us, UTC]
band                  canonical string
frequency_hz          int64
tx_call               string
tx_grid                string
rx_call               string
rx_grid                string
tx_power_dbm          float32
snr_db                float32
drift_hz_per_min      float32
distance_km           float32 (recomputed and source value retained if present)
source_row_id          deterministic hash
source_file_sha256    string
```

Validate every monthly schema before concatenation. Quarantine malformed rows
with reason codes. Normalize calls and Maidenhead grids, but retain the raw
values. Track station location epochs when one callsign changes grid.

## Exposure-aware label construction

### Opportunity grain

Construct opportunities at the native WSPR reporting slot and aggregate them to
path-hour only after opportunity inference.

For each `(slot, band)`:

1. A transmitter is observed active if at least one receiver decodes it in that
   slot and band.
2. A receiver is observed active if it decodes at least one transmitter in that
   slot and band.
3. Candidate opportunities are active-transmitter x active-receiver pairs,
   excluding invalid/self paths.
4. `decoded=1` when that receiver reported that transmitter in the slot;
   otherwise `decoded=0`.

This still conditions on the transmitter being heard somewhere and cannot
recover transmissions decoded nowhere. State that limitation in every report.
Audit cartesian growth per slot before the full build and cap pathological slots
only through a deterministic, documented rule.

Aggregate opportunity rows to `(target_hour, band, tx_grid, rx_grid, power_bin)`:

```text
successes       number of decoded opportunities
opportunities   number of inferred opportunities
success_rate    successes / opportunities
```

Fit binomial cross-entropy using `success_rate` as the response and
`opportunities` as sample weight, or demonstrate equivalence to the unaggregated
fit on the smoke dataset. Do not let paths with more inferred attempts silently
change the estimand.

### Product estimands

Primary research estimand:

```text
P(single WSPR decode | active tx, active rx, path, band, power, prior-known state)
```

Secondary product transform for `n` comparable attempts:

```text
P(at least one decode in n attempts) = 1 - (1 - p_single)^n
```

Do not describe either probability as universal contact success without
declaring mode, power, bandwidth, attempt count, and calibration population.

### Station observation model

The primary propagation model excludes callsign, transmitter ID, receiver ID,
and exact path ID. A separate nuisance/detection model may use cross-fitted:

- receiver sensitivity and uptime;
- transmitter residual strength after power normalization;
- station-grid epoch;
- network/source and mode.

Station effects must be estimated inside each training fold. They may not be
computed from validation or test observations. Compare:

1. propagation features only;
2. propagation plus cross-fitted station effects;
3. shared propagation score plus source-specific detection/calibration heads.

## Prediction-time feature contract

Every feature must have `event_time` and `available_at`. For a target hour `H`,
an operational feature is legal only if `available_at <= H`. Prefer the last
completed observation at or before `H-1` for a one-hour-ahead product.

### Required feature groups

- frequency/band and band interactions;
- path distance, bearing, midpoint, endpoint and path-sampled solar elevation;
- darkness fraction and terminator crossings;
- geographic and corrected geomagnetic coordinates, magnetic local time, and
  auroral-zone intersection where a reproducible implementation is available;
- hour/day/year cycles and contest/weekend state;
- lagged OMNI/GFZ state, changes, extrema, missingness, and data age;
- WSPR activity and decode history at H-1, H-2, H-3, and H-24 for the nowcast
  arm only;
- transmit power for opportunity-level and power-normalized targets;
- P.533/VOACAP output in a separate hybrid arm.

Maintain two feature profiles:

- `operational`: only inputs available with production latency;
- `research_upper_bound`: may include contemporaneous/reprocessed TEC or
  ionosonde values, clearly marked as unavailable for live inference.

## Split and holdout policy

Splits are created once from deterministic hashes and committed as aggregate
specifications before fitting.

### Archive development split

- Train: all four 2019 months plus 2024-01 and 2024-04.
- Validation/calibration: 2024-07.
- Locked archive test: 2024-10.
- Secondary evaluation: rolling-origin tests across the selected months where
  at least two earlier selected months exist.

### Generalization slices

Report each primary metric for:

- seen and unseen four-character transmitter grids;
- seen and unseen four-character receiver grids;
- unseen transmitter callsigns and unseen receiver callsigns;
- unseen grid-pair paths;
- quiet, active, and storm geomagnetic regimes;
- dawn/dusk, day/day, night/night, and mixed-light paths;
- distance buckets and every supported band;
- contest and non-contest periods;
- lower-activity 2019 and higher-activity 2024 months.

Hash-based station and grid assignments must be independent of labels and based
on a committed seed. No minimum-activity gate may inspect validation or test
labels.

### Prospective collector test

Reserve a future Propulse collector window after the pipeline and acceptance
criteria are frozen. The proposed window is 2026-08-01 00:00 UTC through
2026-09-30 23:59 UTC. Do not query, summarize, visualize, or tune on that window
until the archive model, calibration method, and report template are locked.

If anyone has already inspected that period when evaluation begins, record the
contamination and select a later unopened window. Never relabel an opened test
as locked.

## Model and baseline matrix

### Baselines

- `B0`: global prevalence.
- `B1`: train-only band x hour x month climatology with smoothing.
- `B2`: train-only geography/distance climatology.
- `B3`: V2 XGBoost physics and nowcast profiles on compatible rows.
- `B4`: ITU-R P.533/VOACAP circuit score mapped to probability using validation
  data only.

### Candidate models

- `M1`: XGBoost histogram model, operational physics features only.
- `M2`: M1 plus legal H-1/H-2/H-3/H-24 source lags.
- `M3`: M2 plus cross-fitted station observation effects.
- `M4`: M2 plus P.533/VOACAP hybrid features.
- `M5`: separate low-band (160-60m), middle-HF (40-20m), and upper-HF
  (17-10m) models, compared with the shared HF model.

Run a bounded LightGBM comparison on the 5M-row matrix. Add CatBoost only to the
station-effect arm if categorical handling is genuinely needed. Do not repeat a
broad framework bakeoff after a clear loser is established.

Keep 6m as a separate task, dataset, feature profile, calibration, and report.
Do not declare it validated until there are enough positive opportunities in
each split for meaningful PR-AUC and calibration.

### Calibration and uncertainty

Compare logistic/Platt, beta, and isotonic calibration on validation only.
Evaluate global, per-band, and band-family calibration, with shrinkage or a
global fallback for sparse bands. Preserve raw scores.

Use an ensemble of temporal-fold models for uncertainty only after the primary
single-model result is known. Report dispersion and out-of-distribution flags;
do not present ensemble spread as a formal confidence interval for an individual
prediction.

## Metrics and statistical analysis

Primary metrics:

- weighted log loss and weighted Brier score on exposure opportunities;
- Brier skill relative to B1 and B4;
- calibration intercept/slope and reliability curves;
- PR-AUC and ROC-AUC as ranking metrics.

Operational metrics:

- precision and coverage at 50%, 70%, 80%, and 90% claims;
- probability error by band, path distance, light state, and geomagnetic regime;
- cold-start performance on unseen stations, grids, and paths;
- inference latency and model size.

Inference must use month/day blocks and station/path clustered resampling as
appropriate. Do not use row-level bootstrap intervals on correlated spots.

Run predeclared ablations for geometry, solar/geomagnetic state, activity lags,
station effects, and the P.533 hybrid. Add SHAP summaries only after metrics are
frozen; interpretations do not replace ablation evidence.

## Acceptance gates

Proceed from the two-month smoke run to eight months only if:

- source schemas and hashes validate;
- opportunity audits show plausible active TX/RX counts and success rates;
- duplicate, malformed-grid, impossible-frequency, and station-location checks
  pass;
- no target-time or cross-fold feature leakage is found;
- aggregate and unaggregated binomial fits agree within a predeclared tolerance;
- the full pipeline is reproducible from raw compressed inputs.

Proceed from eight months to multi-year only if:

- the selected operational model has positive Brier skill over climatology and
  P.533/VOACAP on the locked archive month;
- the paired block interval for the primary improvement excludes zero overall;
- calibration is acceptable across major bands rather than only in aggregate;
- performance does not collapse on unseen grids, stations, or paths;
- gains survive multiple rolling-origin folds and disturbed-condition slices;
- the 20M-to-50M learning curve shows material improvement after uncertainty;
- the prospective collector evaluation confirms archive-to-product transfer;
- source terms permit the planned code, weight, and research release.

If the learning curve is flat by 20M, stop scaling and improve labels/features.
If rank skill improves but calibration transfer fails, keep the ranker and build
a product-feed calibration layer. If only station-aware models improve, treat
the result as detection modeling rather than propagation improvement.

## Compute and efficiency plan

The M5 Max with 128 GB unified memory is the primary machine.

1. DuckDB streams compressed/bronze data and performs grouped aggregation.
2. Parquet is partitioned by source, year, month, task, and optionally band.
3. Polars lazy scans perform validation and bounded feature materialization.
4. NumPy/Arrow is the model boundary; pandas is not used for full datasets.
5. Train deterministic learning curves at 5M, 20M, and 50M effective
   opportunities before any 100M run.
6. Use XGBoost `QuantileDMatrix` or external-memory pages only after measuring
   end-to-end memory, cache size, and runtime.
7. Record physical cores, threads, RAM, free disk, library versions, wall time,
   peak resident memory, input rows, effective weights, and output sizes.

GPU rental is gated on either a still-rising 50M learning curve that is too slow
on the M5 or a predeclared neural/source-factor model that beats XGBoost on the
same locked folds. GPU availability alone is not a reason to change algorithms.

## Planned CLI contract

These commands define the interface Phase 0 must implement. Keep commands
restartable and idempotent.

```bash
python3 -m venv ml/.venv
ml/.venv/bin/python -m pip install --upgrade pip
ml/.venv/bin/python -m pip install -r ml/requirements.txt

# Inventory hardware, disk, environment, local V2 inputs, and source manifests.
ml/.venv/bin/python ml/src/archive_v3/inventory.py

# Download only immutable raw inputs selected in a versioned YAML manifest.
ml/.venv/bin/python ml/src/archive_v3/download_sources.py \
  --config ml/config/archive_v3_smoke.yaml

# Parse, normalize, and audit without creating opportunities.
ml/.venv/bin/python ml/src/archive_v3/build_bronze.py \
  --config ml/config/archive_v3_smoke.yaml

# Build exposure-aware HF and 6m opportunities separately.
ml/.venv/bin/python ml/src/archive_v3/build_opportunities.py \
  --config ml/config/archive_v3_smoke.yaml --task hf
ml/.venv/bin/python ml/src/archive_v3/build_opportunities.py \
  --config ml/config/archive_v3_smoke.yaml --task 6m

# Freeze folds before model training.
ml/.venv/bin/python ml/src/archive_v3/build_folds.py \
  --config ml/config/archive_v3_smoke.yaml

# Fit baselines, candidates, calibrators, and predeclared ablations.
ml/.venv/bin/python ml/src/archive_v3/run_experiment.py \
  --config ml/config/archive_v3_smoke.yaml --task hf
ml/.venv/bin/python ml/src/archive_v3/run_experiment.py \
  --config ml/config/archive_v3_smoke.yaml --task 6m

# Validate metrics and generate a portable report.
ml/.venv/bin/python ml/src/archive_v3/validate_experiment.py \
  --run ml/results/archive_v3/smoke/run.json
ml/.venv/bin/python ml/src/archive_v3/generate_report.py \
  --run ml/results/archive_v3/smoke/run.json --deliver
```

After the smoke gates pass, rerun the same interface with
`ml/config/archive_v3_eight_month.yaml`. Configuration files, schemas, and
aggregate manifests are committed; downloaded files and derived tables are not.

## Phase checklist

### Phase 0: Bootstrap and preregistration

- [ ] Confirm branch/commit and make a new V3 feature branch.
- [ ] Record M5 hardware, macOS, Python, free disk, and filesystem details.
- [ ] Implement source/config schemas and the planned CLI skeleton.
- [ ] Pin and lock Apple Silicon dependency versions.
- [ ] Add source-terms and attribution records.
- [ ] Freeze targets, splits, metrics, seeds, and acceptance gates in config.
- [ ] Add unit tests for time availability, fold isolation, Maidenhead parsing,
      band mapping, opportunity aggregation, and deterministic hashing.

### Phase 1: Two-month acquisition and bronze tables

- [ ] Download 2019-04 and 2024-04 WSPR archives with resume support.
- [ ] Download aligned OMNI2 and GFZ history plus adequate lag warm-up.
- [ ] Convert streams to typed partitioned Parquet.
- [ ] Produce schema drift, missingness, duplicates, station-grid, band, power,
      SNR, and source-volume audits.
- [ ] Reconcile V2 solar fields with OMNI/GFZ definitions.

### Phase 2: Exposure smoke experiment

- [ ] Build slot-level active TX/RX sets and opportunity aggregates.
- [ ] Validate inferred negatives through sampled slot reconstructions.
- [ ] Measure cartesian expansion and choose any deterministic cap before the
      full build.
- [ ] Compare aggregated versus unaggregated loss on a bounded sample.
- [ ] Run B0-B4 and M1-M4 on HF.
- [ ] Build 6m separately and report whether class support is sufficient.
- [ ] Generate a portable smoke report and pass all gates.

### Phase 3: Eight-month experiment on the M5

- [ ] Acquire the remaining six months from the frozen config.
- [ ] Run 5M, 20M, and 50M learning curves.
- [ ] Run archive, rolling-origin, spatial, station, path, and regime holdouts.
- [ ] Compare shared HF and band-family models.
- [ ] Run calibration and predeclared ablations.
- [ ] Record compute, storage, and reproducibility manifests.

### Phase 4: Locked evaluation and final report

- [ ] Freeze chosen model and calibrator before opening archive test results.
- [ ] Evaluate 2024-10 once for the primary archive decision.
- [ ] When available and still unopened, evaluate the prospective collector
      window once.
- [ ] Publish a self-contained technical report with learning curves,
      reliability plots, per-band results, cold-start slices, block intervals,
      error examples, limitations, source terms, and the scale/no-scale verdict.
- [ ] Validate report rendering at desktop and mobile widths.

### Phase 5: Multi-year decision

- [ ] Expand only if every multi-year gate passes.
- [ ] Select representative additional years through a written sampling plan.
- [ ] Decide whether M5 CPU, external-memory XGBoost, or rented GPU is justified
      from measured learning curves and throughput.
- [ ] Create a model card, data card, citation file, and release checklist before
      publishing weights.

## Required committed deliverables

- V3 source and experiment YAML configs;
- dependency lock and environment inventory;
- downloader/parser/opportunity/training/report source code and tests;
- source manifest schema plus aggregate manifests and hashes;
- frozen fold definitions and leakage audit;
- baseline, learning-curve, ablation, calibration, and slice metrics;
- validation JSON with explicit pass/fail gates;
- self-contained HTML report and Markdown methodology;
- data card, model card, source acknowledgements, and release decision;
- exact commands needed to reproduce the selected run.

The final report must distinguish observed facts, statistical inference, and
engineering judgment. It must state that WSPR exposure is inferred, not a record
of every attempted transmission, and that amateur receiving networks have
geographic and equipment selection bias.

## Stop conditions

Stop and document rather than improvising if:

- a source schema cannot be reconciled without dropping material data;
- source terms conflict with open weights or the intended nonprofit product;
- the opportunity cross product exceeds storage estimates by more than 2x;
- a feature lacks a defensible `available_at` timestamp;
- locked test data was opened or used during development;
- spatial/station holdouts reveal that aggregate skill is mostly memorization;
- 6m lacks enough positive opportunities for stable evaluation;
- a failed validation repeats after two corrections and requires a target or
  protocol change.

Protocol changes after preregistration require a new run ID and an explicit
amendment. Never overwrite the original metrics or silently redefine a gate.
