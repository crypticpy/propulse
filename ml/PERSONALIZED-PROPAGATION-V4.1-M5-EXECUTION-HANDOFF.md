# Personalized Propagation V4.1: M5 Execution Handoff and Resume Plan

> Current status: corrected development data, four-month input inventory, and
> raw M2 prediction materialization are frozen; full-data selection is next.
> Status date: 2026-07-12.
> Last executed M5 code checkpoint: `c2ecaa6` on
> `feat/archive-multimonth-v3`.
> Frozen scientific protocol:
> [`PERSONALIZED-PROPAGATION-V4.1-CALIBRATION-PLAN.md`](PERSONALIZED-PROPAGATION-V4.1-CALIBRATION-PLAN.md).
> Required compute: Apple M5 Max with 128 GB unified memory.
> Heavy data, model, evaluation, and report jobs are M5-only.

## Resume instruction

On the M5, pull the branch and give the coding agent this instruction:

> Read `ml/PERSONALIZED-PROPAGATION-V4.1-M5-EXECUTION-HANDOFF.md` and the
> frozen V4.1 calibration plan completely. Resume at **Next action**, execute
> every scientific step on the M5, and update the run manifest and this
> checklist as each stage completes. Do not access November 2024, December
> 2024, or any 2025 outcome before its mechanical gate permits it. Do not
> retrain M2, add data sources, alter the candidate families, or run a 100M
> experiment. Publish a failed result and stop if a frozen gate fails.

This handoff records execution status and engineering detail. It does not
replace or relax the frozen preregistration. If the documents conflict, the
frozen calibration plan and machine-readable config win.

## Decision summary

V4.1 is ready to continue. No additional development outcome data is needed
before calibration selection. February, May, and August 2024 have been
prepared and audited; April 2024 is an already observed development month from
V4. The immediate work is to generate frozen raw M2 probabilities, select C0-C4
with leave-one-month-out evidence, freeze the candidate and scorer, and only
then open November once.

Do not expand the core model to 100M or add another data source now. The current
question is whether guarded calibration repairs a known failure while the core
50M M2 model remains fixed. Changing training scale or inputs would confound
that question and consume the untouched gate. A 100M or source-expansion study
belongs in a separately preregistered V5 after V4.1 is decided.

October engineering evidence materially lowers the probability that V4.1 will
pass the frozen V3 replacement gate: frozen B2 beat calibrated M2 overall and
in every distance slice in October. October is observed, non-gating evidence,
so it cannot be used to change V4.1. Continue the preregistered experiment and
let November decide it once.

## Authoritative files

Read these before changing code or running a job:

- [`PERSONALIZED-PROPAGATION-V4.1-CALIBRATION-PLAN.md`](PERSONALIZED-PROPAGATION-V4.1-CALIBRATION-PLAN.md)
  contains the frozen hypotheses, candidates, data roles, gates, and stop rules.
- [`config/propagation_v4_1.json`](config/propagation_v4_1.json) is the
  machine-readable protocol.
- [`results/propagation_v4_1/preregistration/run_manifest.json`](results/propagation_v4_1/preregistration/run_manifest.json)
  is the permanent access and artifact ledger.
- [`results/propagation_v4_1/preregistration/development_data_audit.json`](results/propagation_v4_1/preregistration/development_data_audit.json)
  is the original defect-era development-data audit.
- [`results/propagation_v4_1/preregistration/development_data_audit_v2.json`](results/propagation_v4_1/preregistration/development_data_audit_v2.json)
  is the frozen post-repair audit.
- [`results/propagation_v4_1/preregistration/calibration_input_inventory.json`](results/propagation_v4_1/preregistration/calibration_input_inventory.json)
  freezes the four calibration-development inputs and M2 contract.
- [`results/propagation_v4_1/propagation_v4_1_calibration_recovery/manifests/sources.json`](results/propagation_v4_1/propagation_v4_1_calibration_recovery/manifests/sources.json)
  records source provenance for the new development months.
- [`results/propagation_v4_1/preregistration/b2_freeze.json`](results/propagation_v4_1/preregistration/b2_freeze.json)
  freezes the V3/B2 artifacts.
- [`results/propagation_v4_1/preregistration/b2_october_engineering.json`](results/propagation_v4_1/preregistration/b2_october_engineering.json)
  is the observed, non-gating October comparison.
- [`PERSONALIZED-PROPAGATION-V4-PLAN.md`](PERSONALIZED-PROPAGATION-V4-PLAN.md)
  and [`research/PERSONALIZED-PROPAGATION-V4-RESEARCH.md`](research/PERSONALIZED-PROPAGATION-V4-RESEARCH.md)
  contain the parent model and research context.

## Current status

### Repository and protocol

| Item | Current value |
|---|---|
| Branch | `feat/archive-multimonth-v3` |
| Last executed M5 code checkpoint | `c2ecaa6` |
| Frozen plan commit | `2af85f5` |
| Parent V4 evidence commit | `2cb309d` |
| Run ID | `propagation_v4_1_calibration_recovery` |
| Protocol state | `development_opened` |
| Development outcomes opened | yes: 2024-02, 2024-05, 2024-08 |
| November gate opened | no |
| Locked 2025 archive opened | no |
| Release approved | no |
| M5 repository | `/Users/crypticpy/Projects/propulse` |
| M5 large-artifact root | `/Volumes/Projects/PropulseML` |
| M3 policy | documentation and source staging only; no ML jobs |

The run manifest still labels Phase 0 `in_progress` and Phase 1 `not_started`
because candidate selection and scorer freeze are incomplete. Do not manually
change those values to make the checklist look current. Advance them through
validated orchestration when the corresponding artifacts exist.

### Completed work

- V4.1 schema, config validation, scoped access controls, M5 profile guard,
  atomic protocol state machine, and artifact freezing are implemented.
- C0 identity, C1-C4 hierarchy logic, legacy V4 calibrator loading, and
  leave-one-month-out selection primitives exist for bounded fixtures.
- Frozen V3/B2 models, calibrators, feature contracts, and checksums have been
  verified. The compatibility adapter and tests are implemented.
- B2 was scored on October 2024 under the V4 natural opportunity-weighted
  estimand. This is engineering evidence, not a selection gate.
- February, May, and August 2024 WSPR outcomes and matching exogenous inputs
  were downloaded, transformed, and audited on the M5.
- The new three-month HF feature dataset contains 150,815,873 rows and about
  4.6006 billion weighted opportunities. All 14 frozen audit checks passed.
- The canonical OMNI schema repair was applied and only the affected
  space-weather and feature partitions were rebuilt. The original audit is
  retained as defect-era evidence; `development_data_audit_v2.json` records
  the corrected 14-of-14 pass.
- The full April partition was found and frozen with the three new months. The
  calibration input inventory covers 206,843,263 natural rows with an exact
  112-field schema match across all four months.
- Streaming prediction materialization, 262,144-bin sufficient statistics,
  four-fold selection, and atomic output tests are implemented. The full M5
  materialization completed successfully; full-data selection has not yet run.
- Materialization scored 206,843,263 rows and 6,394,217,140 weighted
  opportunities in 308.76 seconds. Its prediction files total 2,916,112,502
  bytes and sufficient-statistic files total 644,610,998 bytes. Peak RSS was
  15.76 GB by `/usr/bin/time` with no swaps, safely below the 96 GB ceiling.
- All four monthly manifests and success markers passed. The aggregate
  calibration-prediction manifest SHA-256 is
  `03491647489580601391070d3dc16fa7065c12d772589fecc7b5020cfa74fee5`.
- Mechanical locks remain closed for November 2024, December 2024, and all
  four 2025 months.
- The current full `npm run verify` passes on the M5: 20 V4 tests, 7 service
  tests, 29 V4.1 tests, 27 frontend tests, lint, build, and bundle checks.
  It must run again against the final candidate-freeze implementation.

### Development data inventory

| Month | Raw WSPR bytes | Bronze rows | Reconstructed path-hours | Prevalence |
|---|---:|---:|---:|---:|
| 2024-02 | 2,994,192,526 | 159,340,133 | 54,289,793 | 0.11038 |
| 2024-05 | 2,548,268,121 | 138,340,313 | 50,323,668 | 0.08292 |
| 2024-08 | 2,456,281,555 | 135,873,245 | 46,202,412 | 0.08517 |

The processed feature data is stored outside Git under:

```text
/Volumes/Projects/PropulseML/data/processed/archive_v4_1/
  dataset_propagation_v4_1_calibration_recovery_hf.parquet/
```

It has three `part-*.parquet` files and a post-audit `_SUCCESS` marker. The
audit found zero target-hour nulls, non-positive weights, split violations, or
future-availability features. Exposure reconstruction error was 0.1082% in
February, 0.1034% in May, and 0.0535% in August, all well inside the 3% gate.

The first calibration-input inventory found a schema defect before any raw M2
prediction was generated: the 2024-only OMNI build inferred the entirely
missing `proton_flux_10mev` column as nonnumeric, so the three new months
omitted `proton_flux_10mev_missing` and used the wrong value type. The inventory
stopped without writing an artifact. The builder now casts canonical OMNI
columns explicitly, the three authorized feature partitions were rebuilt, and
the versioned audit passed all 14 checks. February, April, May, and August now
have identical field order, types, and metadata with schema SHA-256
`757e116ead45c80ebfeb1b5268bd5e3b139fbd134c10b61291aaadcde347c796`.

The frozen calibration inventory contains:

| Month | Natural rows | Input bytes |
|---|---:|---:|
| 2024-02 | 54,289,793 | 6,786,291,189 |
| 2024-04 | 56,027,390 | 7,136,849,835 |
| 2024-05 | 50,323,668 | 6,464,830,928 |
| 2024-08 | 46,202,412 | 5,936,865,614 |
| **Total** | **206,843,263** | **26,324,837,566** |

It freezes the 91-feature M2 order, best iteration 394, model SHA-256
`706d4f5ca6ad855bc9cbf1139cfeb53c0015e04c67d39184be78ca2e1f6755d5`,
and 262,144 probability bins. Its access audit records no November or locked
archive reads and no calibration outcome metrics were calculated during
inventory.

### Frozen B2 evidence

| Artifact | SHA-256 |
|---|---|
| V3 HF physics model | `0e440b77bc7e0e821669ccd0d5e6aaa51dd6e8645f25e4374d2d989cd289ca39` |
| V3 HF physics calibrator | `37206b075f6d36b9c976f0d00f774b6e64ea980887576c1fc35caae6f3a52915` |
| V3 HF nowcast model | `93a88864667d582939c1d9ec3a543e8745668be9331f1eae50b8ad973debc145` |
| V3 HF nowcast calibrator | `d1508f33d5a79abca7c2bc4650f48d71f8644de224c4a3f2333f518f8f35ee20` |

The frozen V3 feature contracts are exact subsets of V4: 60 physics features
and 64 nowcast features. B2 was neither refit nor recalibrated.

October used 1,314,399 identical natural evaluation rows and 44,075,112.75
weighted opportunities:

| Candidate | Weighted Brier | ECE |
|---|---:|---:|
| Frozen B2 | 0.04374707 | 0.0036790 |
| Raw M2 | 0.04498450 | 0.0082198 |
| V4 calibrated M2 | 0.04488206 | 0.0020871 |

`Brier(M2 calibrated) - Brier(B2)` was `+0.00113499`; the day-block
bootstrap 95% interval was `[+0.00098061, +0.00128236]`. M2 was worse than B2
in every fixed distance slice. This is a warning, not a V4.1 failure, because
October is explicitly non-gating.

## Data access ledger

| Outcomes | Access now | Rule |
|---|---|---|
| 2024-02, 04, 05, 08 | allowed | calibration development only |
| 2024-10 | already observed | engineering context only; never selection |
| 2024-11 | denied | unlock once after candidate and scorer freeze |
| 2024-12 | denied | reserved for a future protocol |
| 2025-01, 04, 07, 10 | denied | unlock once only if every November gate passes |
| 2026-08-01 through 2026-09-30 | future prospective window | collect immutably; no tuning |

No more data should be acquired before selection. The only permitted data check
at resume is locating the already observed full April 2024 V4 partition. Prefer
the full natural feature partition. If only the frozen April validation sample
exists, first determine whether the existing V4 opportunity weights make it a
valid representation. Rebuilding April from already observed frozen sources is
allowed if necessary; choosing a new month is not.

## What exists and what is missing

| Component | Status |
|---|---|
| M5-only orchestration and scope guards | implemented |
| V3/B2 freeze, adapter, October scorer | implemented and frozen |
| New development data preparation/audit | complete and frozen |
| In-memory C0-C4 reference implementation | implemented and tested |
| Streaming raw M2 prediction materialization | complete, audited, and frozen |
| Bounded-memory isotonic sufficient statistics | complete for all four months |
| Full-data leave-one-month-out selection | not run |
| Final selected calibrator bundle | not frozen |
| Candidate/scorer/environment manifests | not frozen |
| Synthetic dry-run report | not generated |
| November atomic gate | locked and not run |
| Development visual report | not generated |
| 2025 locked archive | locked and not run |
| Serving package | conditional on passing gates |

## Next action

Run full-data leave-one-month-out selection on the frozen predictions and
statistics, then freeze the candidate and scorer. Do not access November while
executing or debugging it.

### 1. Establish the M5 checkpoint

```bash
cd /Users/crypticpy/Projects/propulse
git status --short
git branch --show-current
git rev-parse HEAD
df -h /Volumes/Projects
source ml/.venv/bin/activate
python -V
npm run check:v4.1-preregistration
```

Requirements:

- branch is `feat/archive-multimonth-v3` at this handoff commit or later;
- unrelated safety stashes remain intact;
- the external artifact volume is mounted and has at least 400 GB free;
- no November, December, or 2025 access flag has changed;
- do not silently upgrade Python, XGBoost, scikit-learn, Polars, PyArrow,
  DuckDB, or Node after candidate freeze.

### 2. Verify the frozen calibration inventory

Verify `calibration_input_inventory.json` and its run-manifest checksum before
execution. It freezes full natural February, April, May, and August partitions,
their hashes, time ranges, identical schema, the 91-feature model contract, and
the M2 model hash. Stop if any input differs. Do not substitute October,
November, or a 2025 month.

### 3. Materialize raw M2 predictions once

**Status: complete.** The command below produced the frozen manifest recorded
in the run ledger. Do not rerun it unless a checksum audit fails.

Use `materialize_calibration_predictions.py` through its `run_pipeline.py`
stage. Stream April plus the three V4.1 months through the frozen 50M M2 model
in bounded Arrow/Polars batches. Never load the combined dataset into memory.

Write compact month-partitioned Parquet containing only fields required for
selection and audit:

```text
target_hour, utc_day, month, band, dist_km, serving_distance_group,
audit_distance_group, raw_probability, success_rate, opportunities
```

Use `float32` for raw probability and target rate only after a float64 parity
check; retain float64 for weights and metric accumulation. Each monthly output
must be atomic and resumable, with a manifest containing input hashes, model
hash, feature-order hash, output hashes, row counts, opportunity totals,
time range, environment, peak RSS, duration, and locked-scope audit.

### 4. Fit isotonic mappings from fixed sufficient statistics

The existing in-memory implementation is a correctness reference, not the
206.8M-row execution path. Use 262,144 fixed equal-width bins over the frozen
probability interval `[1e-7, 0.9999999]`. For each month and applicable group,
accumulate in float64:

```text
row_count, sum_weight, sum_weight_probability,
sum_weight_target, sum_weight_target_squared
```

The bin index is deterministic, clipped to `[0, 262143]`. Fit each isotonic
mapping at the weighted mean probability of nonempty bins using weighted PAVA
or `sklearn.isotonic.IsotonicRegression` with `sum_weight` as sample weight.
Use the frozen identity behavior outside fitted support.

Add tests before full execution:

- fixed-bin aggregation matches direct weighted sums;
- binned global isotonic matches exact isotonic on deterministic fixtures to
  at most `1e-6` weighted Brier difference, `5e-5` weighted mean absolute
  probability difference, and `1e-3` 99th-percentile absolute difference;
- empty bins and sparse groups fall back correctly;
- serialized mappings reproduce predictions exactly within existing serving
  tolerance;
- AppleDouble files are ignored and `_SUCCESS` appears only after final audit.

This is a numerical execution method, not a new candidate family. The original
65,536-bin implementation missed the fixed synthetic Brier tolerance by
`2.63e-6`; 262,144 bins reduced the difference to `1.34e-7`. This correction
was frozen before any development predictions or calibration metrics existed.
The isolated maximum point difference was rejected as a convergence statistic
because isotonic step boundaries left it near 0.013 even at 1,048,576 bins;
weighted and percentile errors remain the deterministic checks. Do not tune
the bin count from observed candidate performance.

### 5. Run frozen leave-one-month-out selection

For each held-out month in February, April, May, and August:

1. build C1-C3 mappings from the other three months' sufficient statistics;
2. stream the held-out original rows through C0-C3;
3. collect exact float64 weighted metrics overall, by band, serving distance,
   audit distance, and UTC day;
4. evaluate C4 recursively using the frozen support and evidence rules; and
5. retain daily paired loss aggregates for the 2,000-repetition bootstrap.

Eligibility remains at least 10,000 rows, 1,000 positive-equivalent weighted
opportunities, 1,000 negative-equivalent weighted opportunities, and three
represented months. A complex mapping replaces its fallback only when pooled
out-of-month Brier is lower, every represented month has non-negative gain,
and the upper 95% day-bootstrap bound for its paired Brier delta is at or below
zero. Exact ties choose the simpler mapping.

After selection, refit only the selected hierarchy on all four development
months. Do not reconsider topology after this refit. Write:

- candidate support and selection table;
- out-of-month metrics and daily aggregates;
- bootstrap distributions or reproducible quantiles;
- final mapping table and fallback coverage;
- serialized calibrator bundle and checksum;
- raw-prediction, sufficient-statistic, code, config, environment, and input
  manifests; and
- a plain-language selection summary that reports rejected candidates too.

### 6. Freeze candidate and scorer

Add and run orchestration stages equivalent to:

```bash
ml/.venv/bin/python ml/src/archive_v4_1/run_pipeline.py \
  materialize-calibration --profile m5
ml/.venv/bin/python ml/src/archive_v4_1/run_pipeline.py \
  select-calibration --profile m5
ml/.venv/bin/python ml/src/archive_v4_1/run_pipeline.py \
  freeze-candidate --profile m5
```

Candidate freeze requires:

- all development audits still pass;
- the selected bundle, mapping table, and support evidence are immutable;
- M2, M1, B0, P.533/B1, and B2 checksums are recorded;
- scorer source and configuration hashes are recorded;
- synthetic end-to-end gate and report fixtures pass;
- package inference matches offline inference;
- source-outage and stale-history behavior pass;
- privacy scan finds no identity or exact-location fields;
- `npm run verify` passes on the M5; and
- the manifest atomically enters `candidate_frozen`.

Only this transition can make November eligible for the one-shot command.

### 7. Run November exactly once

Do not manually download or inspect November. The one-shot gate command must
verify all frozen hashes, create an attempt ID, acquire and audit November,
stream identical rows through every frozen baseline/candidate, calculate all
metrics without exposing interim comparisons, atomically publish the complete
result, and permanently mark access even if a later reporting step fails.

```bash
ml/.venv/bin/python ml/src/archive_v4_1/run_pipeline.py \
  score-november-gate --profile m5
```

Every development gate must pass:

1. all integrity, exposure, split, and time-availability audits pass;
2. bootstrap lower bound for M2 Brier skill over B0 is above zero;
3. bootstrap upper bound for `Brier(M2) - Brier(M1)` is at or below zero;
4. M2 beats B2 overall and improves `<3,000 km` Brier by at least 3%;
5. calibrated M2 Brier is no worse than raw M2 overall;
6. calibrated-minus-raw Brier is at or below zero separately for 0-500,
   500-1,500, and 1,500-3,000 km;
7. no band regresses more than 2% versus its best eligible simpler mapping;
8. ECE is no more than 0.002 worse than raw and high-confidence reliability
   has no material regression;
9. source-outage and stale-history fallbacks remain bounded and honest; and
10. offline, packaged service, and frontend contract predictions match.

Any failure stops V4.1, keeps 2025 closed, and triggers publication of the
negative result. Do not inspect subgroups and modify V4.1 after November.

### 8. Generate the final development report

Generate a self-contained accessible HTML report and Markdown summary whether
November passes or fails. Include machine-readable aggregates behind every
figure. The report must show:

- a high-school-level explainer of prediction, calibration, Brier score, and
  why untouched data matters;
- a data-role timeline;
- the immutable V4 short-path failure;
- C0-C4 hierarchy and fallback flow;
- leave-one-month-out selection evidence;
- overall, band, and distance reliability plots;
- raw-minus-calibrated paired Brier deltas with zero marked;
- daily paired losses and bootstrap intervals;
- comparisons with B0, P.533/B1, frozen B2, M1, and raw M2;
- support and fallback coverage by band/distance;
- exact pass/fail status for every gate;
- compute time, peak RSS, storage, versions, hashes, and reproduction commands;
- limitations from receiver distribution, WSPR-to-QSO transfer,
  missing-not-at-random observations, and station selection;
- separate readiness panels for NowCast, FutureCast, StationCast, and 6m; and
- a clear statement that V4.1 did not test 100M or a new model class.

Interactive time animation is optional. If included, provide pause controls,
reduced-motion behavior, keyboard operation, and an equivalent static chart.
Verify desktop and mobile screenshots on the M5 before committing the report.

### 9. Conditional 2025 locked test

Only if all ten November gates pass, freeze the approved development bundle and
locked scorer, publish the development report, and then score January, April,
July, and October 2025 atomically. No interim comparisons or tuning are
permitted. The locked replacement decision remains the frozen V4.1 rule.

If November fails, do not acquire or transform 2025 for V4.1. Draft V4.2 or V5
against a new untouched gate instead.

## Data sources and provenance

The V4.1 source set is closed. Use the existing acquisition code and record
URL, retrieval UTC, byte length, SHA-256, parser version, schema, expected
month, observed range, row count, terms, and quarantine state for every object.

| Source | Purpose | Canonical link |
|---|---|---|
| WSPRnet monthly archive | decode outcomes and exposure evidence | [WSPRnet archive](https://www.wsprnet.org/archive/) |
| NASA SPDF OMNI | definitive historical solar-wind and geomagnetic context | [OMNI documentation](https://omniweb.gsfc.nasa.gov/html/ow_data.html) |
| GFZ Kp | geomagnetic context and status | [GFZ Kp data](https://kp.gfz.de/en/data) |
| GFZ Hp30/Hp60 | higher-cadence geomagnetic context | [GFZ Hp data](https://kp.gfz.de/en/hp30-hp60/data) |
| NOAA SWPC JSON | operational source-parity checks | [SWPC services](https://services.swpc.noaa.gov/json/) |
| ITU-R P.533 | frozen physical baseline | [ITU-R P.533](https://www.itu.int/rec/R-REC-P.533) |

Do not add ionosonde, GNSS TEC, new forecast products, private Propulse station
records, or user-equipment outcomes to V4.1. They may be useful in a later
ablation study, but each has availability, licensing, coverage, and leakage
questions that require a new preregistration and untouched test.

## Efficiency and safety requirements

- Use Polars lazy frames, PyArrow datasets, or DuckDB; do not add pandas to the
  large-data path.
- Read only `part-*.parquet`; ignore AppleDouble `._*` files.
- Use predicate pushdown, projected columns, bounded record batches, and
  float64 metric accumulators.
- Keep DuckDB at 14 threads and an 80 GB memory limit unless a lower setting is
  needed for stability. Process RSS must remain below 96 GB.
- Write large raw, processed, model, cache, and temporary artifacts only under
  `/Volumes/Projects/PropulseML`.
- Make every stage idempotent, resumable, hashed, and atomic. Write `_SUCCESS`
  only after final audits pass.
- Accumulate bootstrap inputs by UTC day; never bootstrap raw rows in memory.
- Stream all frozen candidates over identical gate rows in one pass.
- Preserve unrelated working-tree changes and all safety stashes.
- Never commit raw WSPR data, model binaries, credentials, machine addresses,
  callsigns, station identifiers, exact locations, or private shack records.

## Required artifacts

Small public evidence belongs under:

```text
ml/results/propagation_v4_1/propagation_v4_1_calibration_recovery/
```

Required deliverables are:

- permanent run, source, split, environment, model, candidate, scorer, and
  access manifests;
- calibration selection table, support table, mapping table, daily aggregates,
  and bootstrap evidence;
- November gate bundle and all gate decisions;
- locked 2025 bundle only if November permits it;
- `model_card.md`, `data_card.md`, and `reproduction.md`;
- `REPORT.html`, a Markdown result summary, and accessible static figure
  fallbacks;
- serving bundle manifest and offline/service/frontend parity evidence only if
  approved; and
- checksums or reproducible download/build instructions for ignored large
  artifacts.

## Completion checklist

### Done

- [x] Frozen V4.1 preregistration committed.
- [x] M5 execution profile and scoped access controls implemented.
- [x] V3/B2 artifacts verified and frozen.
- [x] October B2 engineering comparison published as non-gating evidence.
- [x] February, May, and August raw sources acquired on the M5.
- [x] Bronze, opportunity, space-weather, source, and feature data built.
- [x] Three-month corrected development dataset passed all 14 frozen audits.
- [x] Full April input located and the 206,843,263-row four-month inventory frozen.
- [x] Streaming M2 materialization and 262,144-bin statistics implemented and tested.
- [x] Full four-month M2 predictions and sufficient statistics materialized and audited.
- [x] Full verification suite passed on the M5 after the streaming implementation.
- [x] November, December, and 2025 access remain closed.

### Next

- [ ] Run four-fold leave-one-month-out C0-C4 selection.
- [ ] Refit the selected hierarchy on all four development months.
- [ ] Freeze the selected bundle, scorer, environment, and manifests.
- [ ] Generate and validate the synthetic dry-run report.
- [ ] Rerun the full verification suite against the final freeze implementation.

### Locked until candidate freeze

- [ ] Open and score November exactly once.
- [ ] Publish the complete pass/fail development report.
- [ ] Package serving behavior only if approved.

### Locked until every November gate passes

- [ ] Open and score the four 2025 archive months exactly once.
- [ ] Publish the locked archive decision without tuning.

### Time-dependent evidence

- [ ] Collect the 2026-08-01 through 2026-09-30 prospective NowCast window.
- [ ] Accumulate at least 90 valid FutureCast issuance days and complete their
  forecast horizons.
- [ ] Design a separately consented StationCast residual study when opt-in
  operator outcomes exist.
- [ ] Improve 6m only through its separate model, data, gates, and report.

## Definition of done

The V4.1 experiment is complete only when the candidate has been selected and
frozen without locked-data access, November has been scored once, every result
and failure is published in the visual and machine-readable report, and the
run manifest permanently records the decision. A November failure is a valid
completed experiment, but it is not release approval. The 2025 test is required
only after a complete November pass. Prospective, FutureCast, learned
StationCast, and 6m evidence remain separate follow-on goals.
