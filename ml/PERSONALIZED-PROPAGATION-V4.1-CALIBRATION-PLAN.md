# Personalized Propagation V4.1: Calibration Recovery and Release Plan

> Status: preregistration frozen; Phases 0 and 1 complete on 2026-07-12.
> The single untouched November gate is complete and V4.1 **failed** two of
> ten required gates. Phase 3 publication is complete except for the final Git
> commit and push. The locked 2025 archive remains closed. This file is the
> canonical execution status and resume point for closing V4.1 and beginning a
> separately preregistered, performance-driven V4.2.
> Parent experiment: [`PERSONALIZED-PROPAGATION-V4-PLAN.md`](PERSONALIZED-PROPAGATION-V4-PLAN.md).
> Frozen V4 evidence commit: `2cb309d` on `feat/archive-multimonth-v3`.
> Primary compute target: Apple M5 Max with 128 GB unified memory.
> Heavy data preparation, scoring, training, and report generation are M5-only.
> Large ignored artifacts belong on `/Volumes/Projects/PropulseML`.

## Resume instruction

On the M5, point the coding agent to this file with:

> Read `ml/PERSONALIZED-PROPAGATION-V4.1-CALIBRATION-PLAN.md` completely and
> execute it in order. Begin with Phase 0. Update this checklist and the V4.1
> run manifest as work completes. Preserve the published V4 failure, do not
> read or score the locked 2025 outcomes, do not run a 100M experiment, and do
> not change an analysis after viewing the November 2024 gate. Stop and publish
> a failed V4.1 result if any frozen gate fails. Run all heavy jobs on the M5
> and use `/Volumes/Projects/PropulseML` for raw data, processed data, models,
> caches, and temporary files.

Before execution, also read:

- [`PERSONALIZED-PROPAGATION-V4-PLAN.md`](PERSONALIZED-PROPAGATION-V4-PLAN.md);
- [`research/PERSONALIZED-PROPAGATION-V4-RESEARCH.md`](research/PERSONALIZED-PROPAGATION-V4-RESEARCH.md);
- [`results/propagation_v4/propagation_v4_multiyear_50m/REPORT.html`](results/propagation_v4/propagation_v4_multiyear_50m/REPORT.html);
- [`results/propagation_v4/propagation_v4_multiyear_50m/run_manifest.json`](results/propagation_v4/propagation_v4_multiyear_50m/run_manifest.json);
- [`ARCHIVE-MULTIMONTH-V3-RESULTS.md`](ARCHIVE-MULTIMONTH-V3-RESULTS.md);
- [`src/archive_v4/README.md`](src/archive_v4/README.md); and
- [`README.md`](README.md).

Never write passwords, private machine addresses, credentials, callsigns,
station identifiers, exact home locations, private shack records, or Supabase
data into Git, logs, manifests, screenshots, reports, or model features.

## Executive decision

V4.1 is a narrow recovery experiment, not a new search for a better core
model. The frozen 50M M2 NowCast model is retained unchanged. V4.1 tests whether
a calibration policy selected without November outcomes can preserve the
model's strong overall discrimination while eliminating the small calibration
regressions observed below 1,500 km.

V4.1 will:

1. preserve V4 and its failed gate as an immutable public negative result;
2. implement and freeze the missing V3/B2 comparison before the new gate;
3. acquire unused February, May, August, and November 2024 observations and
   matching exogenous inputs;
4. use February, April, May, and August only for calibrator development;
5. use November 2024 exactly once as the untouched V4.1 development gate;
6. keep all 2025 outcomes locked until every V4.1 development gate passes;
7. keep 100M, neural networks, M3-M5, FutureCast training, and learned
   StationCast residuals outside this experiment; and
8. publish the result whether it passes or fails.

This plan is frozen before downloading or inspecting the new WSPR outcome
months. Implementation defects may be fixed without changing the scientific
choices below, but every fix must be recorded. Any change to data roles,
candidate families, thresholds, features, core model, or endpoint creates a new
version and requires another untouched gate.

## North-star interpretation

[`PERSONALIZED-PROPAGATION-V4-PLAN.md`](PERSONALIZED-PROPAGATION-V4-PLAN.md)
remains the north star: build the strongest useful, efficient, personalized
propagation model that can operate honestly inside Propulse. V4.1 is one
controlled calibration experiment in that program, not a permanent limit on
the model search or product design.

The frozen V4.1 candidates, metrics, gates, and stop rules are non-negotiable
only when interpreting and publishing **this** experiment. A failed gate must
not be waived, retuned, or relabeled as a V4.1 pass after viewing November.
After V4.1 is published, however, November becomes legitimate diagnostic and
development evidence for a successor version. That successor may retrain the
core, change features, model receiver availability, revise calibration,
compare other algorithms, expand data, or change product integration when the
evidence justifies it. It must be called a new version and evaluated on a new
untouched gate.

The practical optimization order for the successor is:

1. improve out-of-time Brier score and calibration across actionable band,
   distance, geography, activity, and solar-regime slices;
2. preserve operational source availability, serving parity, bounded memory,
   latency, privacy, and clear fallback behavior;
3. improve personalized operator decisions using the existing virtual-shack
   and location data without leaking identity into the open core;
4. add rows or model complexity when diagnostics show they address the actual
   error mode; and
5. retain a fresh gate and locked final archive so performance claims remain
   credible.

The current default successor protocol is V4.2: use the now-observed November
result to diagnose V3-versus-M2 transfer and short-path behavior, keep December
2024 untouched as the next development gate unless a new preregistration
chooses a stronger boundary, and preserve the 2025 archive for final validation.

## Current status as of 2026-07-12

### Repository and compute

| Item | Status |
|---|---|
| Git branch | `feat/archive-multimonth-v3` |
| Published V4 evidence commit | `2cb309d` |
| Draft pull request | [GitHub PR #5](https://github.com/crypticpy/propulse/pull/5) |
| M5 repository | `$HOME/Projects/propulse` |
| M5 large-artifact root | `/Volumes/Projects/PropulseML` |
| M5 V4 repository state | clean at the published V4 evidence commit before this plan |
| Local M3 policy | source inspection and small checks only; no data or ML jobs |
| V4 safety backup | redundant M5 Git stash retained; do not drop until V4.1 is published |

### V4.1 execution status

All data preparation, prediction materialization, selection, packaging, and
gate scoring has run on the M5. The M3 has been limited to source edits, Git
transport, and repository inspection.

| Item | Current result |
|---|---|
| Latest published pre-November commit | `882aef3` |
| Corrected calibration-development rows | 150,815,873 across 2024-02, 04, 05, and 08 |
| Development audit | 14/14 checks passed |
| Streaming calibration rows | 206,843,263 |
| Weighted calibration opportunities | 6,394,217,140 |
| Materialization wall time | 308.76 seconds |
| Materialization peak RSS | 15.76 GB; zero swaps |
| Leave-one-month-out selection wall time | 1,731.95 seconds |
| Selection peak RSS | 7.99 GB; zero swaps |
| Selected policy | `C4_guarded_hierarchical_isotonic` |
| Selected mapping behavior | 42/50 band-distance leaves use raw identity; 4 use C2; 4 use C3 |
| Candidate validation | 1,024 rows; exact offline/service probability parity; all package, fallback, freshness, privacy, and locked-scope checks passed |
| Candidate freeze SHA-256 | `905d02636f8bf5d755568bc1d28b82ab2b2aaa864adda966ef02a2a8779c27c2` |
| Scorer freeze SHA-256 | `cfefe185edd50965aa02c968785cbeee8ed97d913f89549a9dea97e73ff8c756` |
| Selected calibrator SHA-256 | `26bb7950b4d3c858432740f66fdad14ff57f97e02abd8960625f572d5905cf36` |
| November attempt | permanently opened as `november-fe4f874f7a514075bcb6f48e3333d0e9` |
| November gate data | 54,544,159 rows; 1,722,518,874.75 weighted opportunities |
| November integrity audit | 11/11 checks passed; 0.0776% exposure reconstruction error |
| November scoring | complete: 54,544,159 rows in 431.22 seconds; 12.78 GB peak RSS; zero swaps |
| November decision | **failed**: 8/10 gates passed; `G4_frozen_v3` and `G6_short_path_calibration` failed |
| C4 November Brier / ECE | 0.04689390 / 0.00571991 |
| Raw M2 November Brier / ECE | 0.04693992 / 0.00677257 |
| Frozen V3/B2 November Brier | 0.04568175; better than C4 by 0.00121215 |
| C4 0-500 km delta vs raw M2 | +0.00006100 Brier; exact non-regression failed |
| C4 500-1,500 / 1,500-3,000 km deltas | -0.00020866 / -0.00011107; both improved |
| Visual report QA | passed canonical packaging, source interaction, and 1440 px / 390 px browser checks |
| Locked 2025 archive | closed; no 2025 outcome has been transformed, inspected, or scored |

The development selection favored a conservative repair. C2 had the best
pooled development Brier score, but its broad mappings were not stable in every
month and scope. C4 therefore retains raw M2 for most leaves and applies a
calibrator only where the frozen cross-month support and non-regression rules
permit it. On development data, C4 improved raw M2 Brier from `0.04398309` to
`0.04393383` (an absolute improvement of `0.00004925`, about 0.112% relative)
while reducing ECE from `0.00745883` to `0.00630001`. These are selection
results, not untouched-gate evidence.

The one-shot November orchestrator permanently opened the attempt before a
resume-authorization defect stopped the wrapper and before any download. The
same attempt was resumed without resetting the access ledger, changing a
candidate, changing a gate, or viewing an outcome metric. The first scorer
invocation then exposed a duplicate PyArrow projection field because
`dist_km` was both a model feature and an audit column. The repair only
deduplicates the projection; it does not alter rows, predictions, metrics,
bootstrap logic, candidates, or thresholds. Every recovery command and source
hash must be included in the Phase 2 incident record and final report.

### Completed V4 evidence

| Evidence | Result |
|---|---:|
| Valid processed Parquet files | 122 |
| Natural HF candidate rows | 673,981,409 |
| Inferred HF opportunities | 17,921,373,181 |
| Full processed HF rows including validation inventory | 886,317,585 |
| Full processed 6m rows | 2,265,053 |
| Nested training cohorts | 5M, 20M, and 50M |
| Natural-distribution validation sample | 5,000,000 rows |
| M1 50M Brier | 0.05491155 |
| M1 skill versus B0 | 29.42% |
| M2 50M Brier | 0.04473073 |
| M2 log loss | 0.176867 |
| M2 ECE | 0.002013 |
| M2 skill versus B0 | 42.5049% |
| M2 best XGBoost iteration | 394 |
| M2 peak resident memory | 68.707 GB |
| M2 versus calibrated P.533 on 10,000 paired circuits | 44.00% Brier skill |
| 20M to 50M relative Brier improvement | 1.83% |
| Rolling-origin folds | all four positive, 37.70%-39.58% skill |
| Source-outage packaged fallback | passed |
| 6m independent development skill | 76.04%; experimental, not an HF result |
| Automated verification | 19 V4 Python, 7 service, 27 frontend/collector tests, lint, build, and report QA passed |

The bounded 5M LightGBM comparison was better by `0.0004407` Brier, which was
inside the preregistered implementation-equivalence tolerance of `0.0004732`.
XGBoost therefore remains the selected engine. V4.1 does not reopen that choice.

### Frozen V4 failure and unfinished gates

V4 development is complete but its development gates did not all pass. The
failed gate is `short_path_calibration_non_regression`:

| Distance slice | Calibrated M2 minus raw M2 Brier | Result |
|---|---:|---|
| 0-500 km | +0.000153 | failed |
| 500-1,500 km | +0.000287 | failed |

M2 still beat M1 and climatology strongly in those slices. The failure says
that the selected calibrator made a good raw model slightly worse there; it
does not invalidate the core model. It does invalidate opening the locked test.

The following remain incomplete:

- frozen V3/B2 has not been scored under the V4 estimand;
- the four 2025 archive test months have not been read or scored;
- the 2026-08-01 through 2026-09-30 NowCast prospective window is in the future;
- FutureCast does not yet have 90 distinct valid forecast-issuance days;
- opt-in operator outcomes for learned StationCast personalization do not exist;
- internal alpha, beta evidence, and a release decision remain incomplete.

No result may be described as final generalization or production approval yet.

## Scope and exclusions

### Frozen in V4.1

- estimand, opportunity reconstruction, target, and sample weights;
- M2 feature names, order, missingness semantics, and availability rules;
- 50M training cohort and post-stratification weights;
- XGBoost engine, parameters, seed, and best iteration 394;
- raw M2 predictions produced by the frozen model checksum;
- M1, B0, P.533/B1, and frozen V3/B2 definitions;
- operational-versus-definitive source semantics;
- distance and band reporting slices;
- privacy, provenance, and locked-test rules; and
- the existing StationCast deterministic link-budget adapter.

### Allowed changes

- add a joblib-stable identity calibrator and a guarded hierarchical
  calibrator that can fall back to a parent calibrator or raw probability;
- add V4.1 configuration, manifests, acquisition scopes, tests, scoring, and
  reports;
- adapt frozen V3 inference inputs to V4 evaluation rows without fitting or
  recalibrating V3;
- process the four newly assigned 2024 months; and
- fix implementation defects while recording the defect, patch, and rerun.

### Prohibited changes

- retraining or tuning M2;
- changing features, labels, weights, opportunity reconstruction, bins, seeds,
  or XGBoost parameters;
- calibrator selection using October 2024, November 2024, or any 2025 outcome;
- repeatedly scoring November while debugging or choosing a candidate;
- fitting, recalibrating, or otherwise altering frozen V3/B2;
- adding callsign, receiver, transmitter, user, or exact-location identity;
- combining 6m with HF;
- training on 100M rows or testing another model class; and
- opening 2025 after any failed V4.1 development gate.

## Scientific questions and hypotheses

### Primary question

Can a calibration policy chosen entirely on assigned calibration-development
months improve or preserve opportunity-weighted Brier score relative to raw M2
for every short-distance slice while preserving M2's overall skill?

### Primary hypothesis

Hierarchical isotonic calibration is useful where it has enough stable support,
but sparse or distribution-shifted band-distance leaves should fall back to a
parent or identity mapping. Cross-month guarded selection should prevent the
short-path regressions seen in V4 without changing core ranking performance.

### Secondary questions

- Does the frozen M2 candidate beat frozen V3/B2 on the same new month and
  estimand?
- Are calibration gains stable by band, day, solar regime, and coarse region?
- Does the packaged identity fallback remain correct under source outages and
  missing history?

The primary endpoint remains opportunity-weighted Brier score. Log loss, ECE,
maximum calibration error, reliability diagrams, confidence coverage, and
decision curves are secondary. AUROC and feature importance are descriptive
only and cannot override a failed proper-scoring or calibration gate.

## Data plan

### Fixed role assignment

| Data | Role in V4.1 | Outcome access |
|---|---|---|
| 2018-01 through 2023-10 quarterly anchors | frozen core training | already observed; no change |
| 2024-01 and 2024-07 | frozen early stopping | already observed; no new use |
| 2024-04 | existing calibration-development month | reuse allowed |
| 2024-10 | published V4 gate and B2 engineering comparison | already observed; never a V4.1 selection gate |
| 2024-02, 2024-05, 2024-08 | new calibration-development months | may be inspected only after this plan is committed |
| 2024-11 | untouched V4.1 gate | keep mechanically inaccessible until candidates and scoring code are frozen |
| 2024-12 | reserved for a future version | do not acquire or inspect for V4.1 |
| 2025-01, 04, 07, 10 | locked archive test | do not transform, inspect, or score until all V4.1 gates pass |
| 2026-08-01 through 2026-09-30 | prospective NowCast test | immutable collection; no tuning |

The calibration-development months intentionally cover adjacent seasonal
regimes without consuming the locked year. November is a single untouched gate
for this repair. It is not permission to claim year-ahead generalization.

### Required sources

| Source | Use | Canonical location and rule |
|---|---|---|
| WSPRnet monthly archive | decode outcomes, power, and exposure evidence | [archive](https://www.wsprnet.org/archive/), `wsprspots-YYYY-MM.csv.gz`; keep raw bytes ignored and publish hashes/download code only |
| NASA SPDF OMNI | definitive historical solar-wind and geomagnetic context | [OMNI documentation](https://omniweb.gsfc.nasa.gov/html/ow_data.html); tag as reanalysis rather than live availability |
| GFZ Kp and Hp30/Hp60 | geomagnetic context with status | [Kp data/API](https://kp.gfz.de/en/data) and [Hp data/API](https://kp.gfz.de/en/hp30-hp60/data); preserve status, revision, and attribution |
| NOAA SWPC JSON | operational source-parity checks | [services](https://services.swpc.noaa.gov/json/); archive issuance and retrieval timestamps |
| ITU-R P.533 | frozen physical baseline | [P.533 recommendation](https://www.itu.int/rec/R-REC-P.533); preserve installed version and build checksum |

For each new object record URL, retrieval UTC time, byte length, SHA-256,
source terms URL, parser version, expected month, observed time range, schema,
row count, and quarantine status. Raw WSPR rows are not committed or
redistributed unless terms explicitly permit it.

### Acquisition and data-quality gates

- inventory remote objects without reading rows, then freeze expected sizes;
- download only February, May, August, and November 2024 WSPR files;
- acquire matching OMNI and GFZ windows with the existing boundary padding;
- verify gzip integrity, SHA-256, schema, month boundaries, timestamps, bands,
  grid parsing, power ranges, duplicate rate, and null rates;
- materialize development months before November;
- run opportunity reconstruction audits per month and band;
- require exposure-weight reconstruction error within 3% for every audit;
- require zero split overlap and zero `available_at > issue_time` features;
- keep a separate `gate-unlock` command that refuses November until the frozen
  candidate manifest and scoring-code checksum exist; and
- keep all 2025 transforms mechanically denied by scoped configuration.

## V3/B2 frozen comparison

B2 must be completed before November is unlocked.

1. Locate the frozen V3 physics and nowcast bundles, configuration, feature
   order, calibrators, and checksums.
2. Verify the artifacts against their frozen manifest. A checksum mismatch is
   a stop condition, not permission to recreate V3.
3. Implement a deterministic compatibility adapter from V4 evaluation rows to
   the frozen V3 inference contract. The adapter may compute only values that
   V3 expected and may not fit parameters.
4. Add fixtures comparing adapter output with original V3 inference on known
   rows and test missing-feature behavior.
5. Score B2 on October 2024 for engineering validation only. Label this result
   observed/non-gating because October is already public development evidence.
6. Freeze the B2 adapter, scorer, artifact checksums, and failure behavior before
   November is accessible.
7. Score B2 once on November as part of the common V4.1 gate run.

Rows unsupported by the V3 contract must be counted and reported. B2 is scored
unchanged, including its original calibration. No validation-only remapping is
allowed.

## Calibration design

### Fixed distance groups

Calibration selection uses the existing serving groups:

- `0-1000km`;
- `1000-3000km`;
- `3000-6000km`;
- `6000-10000km`; and
- `10000km+`.

Final reporting additionally uses the existing audit bins: 0-500, 500-1,500,
1,500-3,000, 3,000-6,000, 6,000-10,000, and 10,000-25,000 km. These definitions
must not change after data access.

### Frozen candidate families

| ID | Candidate | Behavior |
|---|---|---|
| C0 | Identity/raw | clipped raw M2 probability; no learned mapping |
| C1 | Global isotonic | one weighted isotonic model with identity fallback outside fitted bounds |
| C2 | Per-band isotonic | supported band model, otherwise C1 |
| C3 | Existing hierarchical isotonic | supported band-distance model, otherwise C2/C1 |
| C4 | Guarded hierarchical isotonic | C3 leaf or parent is retained only when cross-month evidence beats its fallback; otherwise fall back recursively to C0 |

No Platt, beta, spline, temperature, ensemble, neural, or newly invented
calibrator may be introduced in V4.1. C1-C3 reproduce existing behavior; C0 and
C4 test the preregistered repair.

### Development and selection protocol

1. Use 2024-02, 04, 05, and 08 only.
2. Produce one out-of-month prediction for each month by fitting a candidate on
   the other three months. Core M2 predictions remain frozen.
3. Calculate opportunity-weighted Brier and calibration metrics overall, by
   band, and by the fixed serving distance group.
4. Use UTC day-block bootstrap with 2,000 repetitions and the frozen V4 seed.
5. A leaf calibrator is eligible only with at least 10,000 rows, at least 1,000
   positive-equivalent and 1,000 negative-equivalent weighted opportunities,
   and representation in at least three development months.
6. Prefer the simpler fallback unless the leaf has lower pooled out-of-month
   Brier, non-negative calibration gain in every represented month, and a
   day-block bootstrap upper 95% bound for `Brier(leaf) - Brier(fallback)` at or
   below zero.
7. Apply the same rule recursively: band-distance to band, band to global, and
   global to identity.
8. Break exact ties toward the simpler mapping in this order: C0, C1, C2, C3.
9. Freeze the selected mapping table, support counts, fitted calibrators,
   checksums, code commit, environment, and candidate manifest before November.
10. Refit only the already selected mapping family on all four development
    months. Do not reconsider any selection after the refit.

Weighted positive-equivalent support is `sum(weight * target)` and negative
equivalent support is `sum(weight * (1 - target))`. All probabilities are
clipped only to the same numerical bounds used by frozen V4 scoring.

## Untouched November gate

November may be unlocked once, only after all of the following exist:

- this committed preregistration;
- validated V4.1 source and split manifests;
- frozen M2, M1, B0, B1, and B2 checksums;
- frozen calibrator candidate and selection manifests;
- passing unit/integration tests;
- a dry-run report generated from synthetic fixtures;
- scoring-code checksums; and
- an audit entry stating that no November rows or aggregates were read.

The single gate command must process and score November without exposing
intermediate metrics that could influence execution. It writes an atomic result
bundle and then marks `gate_opened: true` permanently in the run manifest.

### Required V4.1 development gates

Every gate must pass:

1. **Data integrity:** all source, schema, time, split, exposure, and leakage
   audits pass; no 2025 outcomes were read.
2. **Overall skill:** day-block bootstrap lower 95% bound for M2 Brier skill
   versus B0 is above zero.
3. **History value:** day-block bootstrap upper 95% bound for
   `Brier(M2) - Brier(M1)` is at or below zero.
4. **Frozen V3:** M2 Brier is lower than B2, and November short-path
   (`<3,000 km`) Brier improves at least 3% relative over B2.
5. **Calibration overall:** calibrated M2 Brier is no worse than raw M2.
6. **Short-path calibration:** calibrated-minus-raw Brier is at or below zero
   independently for 0-500, 500-1,500, and 1,500-3,000 km.
7. **Band safety:** no band regresses more than 2% relative Brier versus the
   best eligible simpler calibration candidate.
8. **Reliability:** ECE is no more than 0.002 worse than raw M2 and high-
   confidence reliability has no material regression under the existing V4
   definition.
9. **Operational fallback:** source-outage and stale-history profiles return
   bounded probabilities, reduced confidence, correct provenance, and no
   fabricated observations.
10. **Serving parity:** offline, packaged-service, and frontend-contract
    predictions match within the existing numerical tolerance.

The original exact non-regression rule is deliberately retained: a positive
calibrated-minus-raw Brier delta in any of the three short-path audit bins is a
failure, even if it is numerically small.

### Decision after November

If every gate passes:

- mark V4.1 development approved;
- freeze the entire 50M M2 plus V4.1 calibrator bundle;
- freeze the locked-test scorer and candidate list;
- generate the development report before touching 2025; and
- proceed to the locked 2025 archive protocol below.

If any gate fails:

- keep 2025 closed;
- do not inspect a subgroup to invent another V4.1 adjustment;
- publish the failure, metrics, plots, and exact gate result;
- retain the best previously approved production behavior; and
- require a V4.2 preregistration with a different untouched month before any
  further calibration change.

## Locked 2025 archive protocol

This section becomes executable only after V4.1 passes every November gate.
The locked set remains January, April, July, and October 2025.

1. Verify frozen candidate, environment, code, data-source, and scorer hashes.
2. Process all four locked months without emitting interim model comparisons.
3. Score B0, B1/P.533, frozen B2/V3, raw M2, and calibrated V4.1 in one atomic
   run on identical opportunities.
4. Use UTC day-block bootstrap and report natural opportunity-weighted metrics.
5. Write the complete locked result once; set `locked_archive_test_read: true`.
6. Do not tune, recalibrate, change thresholds, or replace a candidate after
   any 2025 result is visible.

The primary replacement gate remains the parent V4 rule: the 95% day-block
bootstrap interval for `Brier(V4.1) - Brier(B2)` must lie below zero and V4.1
must improve relative Brier by at least 1%. V4.1 must beat B0 and B1 with
intervals below zero, no band may regress more than 5% relative Brier, and ECE
must remain within 0.005 of the best frozen development calibrator.

A locked-test failure is a publishable result. It cannot be repaired against
2025. The next version must use later untouched archive or prospective data.

## Why 100M is not part of V4.1

The 1.83% improvement from 20M to 50M makes a later 100M experiment
scientifically plausible, but the present blocker is calibration evidence, not
training capacity. Adding a 100M core now would mix model scaling with the
calibration repair and consume the only fresh V4.1 gate for two questions.

Therefore:

- do not build or train the 100M cohort during V4.1;
- do not score a later 100M model on November after seeing V4.1 results;
- finish the 50M V4.1 and locked 2025 decision first; and
- preregister 100M as V5 with a new untouched archive/prospective gate, explicit
  compute/serving budgets, and the 50M model as its frozen baseline.

The existing pre-2024 natural pool is already large enough for a deterministic
100M sample, so no additional historical training source is required when that
experiment is approved.

## NowCast, FutureCast, StationCast, and 6m timelines

These products have different evidence and must not share release claims.

### NowCast Core

- immediate work is V4.1 calibration recovery;
- the frozen prospective window remains 2026-08-01 through 2026-09-30;
- archive every input with event time, ingest time, source status, and model
  version; and
- do not tune from prospective outcomes.

### FutureCast Core

FutureCast requires at least 90 distinct, valid forecast issuance days with
`issued_at`, `retrieved_at`, and `valid_at`, followed through the +24-hour
horizon. The current readiness artifact records insufficient history. Starting
or repairing collection on 2026-07-12 means the 90-day evidence cannot mature
until approximately 2026-10-10, plus final-horizon and audit time.

- keep the issuance collector running now;
- never substitute later observations for historical forecasts;
- assess readiness daily without training on incomplete horizons;
- preregister direct +3/+6/+12/+24-hour models after the archive qualifies; and
- release NowCast independently if it passes while FutureCast remains research.

### StationCast

The deterministic Stage A adapter can use the existing Propulse active
location, radio, amplifier, antenna, azimuth, height, feedline, connector,
accessory, ERP, receiver, band, and mode data without additional training data.
It must expose assumptions and never claim that WSPR learned private equipment.

A learned Stage B residual requires opt-in, timestamped operator attempts and
outcomes, explicit consent/retention controls, selection-bias reporting, and a
separate prospective comparison against core plus deterministic Stage A. It is
not a V4.1 prerequisite.

### 6m Cast

The existing 6m result stays an independent experimental model. Improving it
requires additional event/quiet-day coverage and mechanism-specific labels;
none of that data is needed to repair HF calibration. Do not combine its rows,
features, gates, or claims with V4.1.

## M5 execution environment

All commands below run from `$HOME/Projects/propulse` on the M5.
Before any ML command:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
df -h /Volumes/Projects
source ml/.venv/bin/activate
python -V
```

Set the existing external roots without committing machine-specific paths:

```bash
export PROPULSE_ML_DATA_ROOT=/Volumes/Projects/PropulseML/data
export PROPULSE_ML_MODEL_ROOT=/Volumes/Projects/PropulseML/models
export PROPULSE_ML_TEMP_ROOT=/Volumes/Projects/PropulseML/tmp
export PROPULSE_ARCHIVE_NAMESPACE=archive_v4_1
```

Keep at least 400 GB free before acquisition and at least 150 GB free before a
gate run. Record macOS, Python, compiler, XGBoost, DuckDB, Polars, PyArrow,
NumPy, scikit-learn, Node, and package-lock versions. Do not silently upgrade
the environment between candidate freeze and gate scoring.

V4.1 implementation must add explicit commands equivalent to:

```bash
npm run check:v4.1-preregistration
ml/.venv/bin/python ml/src/archive_v4_1/run_pipeline.py prepare-development --profile m5
ml/.venv/bin/python ml/src/archive_v4_1/run_pipeline.py freeze-b2 --profile m5
ml/.venv/bin/python ml/src/archive_v4_1/run_pipeline.py select-calibration --profile m5
ml/.venv/bin/python ml/src/archive_v4_1/run_pipeline.py freeze-candidate --profile m5
ml/.venv/bin/python ml/src/archive_v4_1/run_pipeline.py score-november-gate --profile m5
ml/.venv/bin/python ml/src/archive_v4_1/run_pipeline.py package-serving --profile m5
ml/.venv/bin/python ml/src/archive_v4_1/run_pipeline.py report --profile m5
```

These command names describe required orchestration; they do not exist at plan
freeze time. Implement them with scoped configuration and tests before use.
Every stage must be resumable, write atomically, reject the wrong machine
profile for heavy work, and avoid loading the full archive into memory.

## Streaming, memory, and efficiency requirements

- retain Parquet partitioning by year/month/band and predicate pushdown;
- use Polars lazy scans, PyArrow datasets, or DuckDB SQL for tabular work;
- do not introduce pandas into the large-data path;
- batch frozen-model prediction and additive metric accumulation;
- materialize only reusable features and predictions, not duplicate raw rows;
- use external temporary storage and bounded thread/memory configuration;
- checkpoint per month and verify hashes before resuming;
- calculate bootstrap inputs from daily aggregates rather than raw rows; and
- fail before swapping or exhausting unified memory.

The November and 2025 scorers must stream common batches through every frozen
candidate so comparisons use identical rows and weights.

## Testing and validation requirements

Before November unlock, all of the following must pass on the M5:

- V4.1 preregistration/config validation;
- source scope and locked-month denial tests;
- identity calibrator serialization and numerical tests;
- guarded fallback selection fixtures for global, band, and band-distance
  paths;
- support-threshold and tie-breaking tests;
- leave-one-month-out selection tests;
- V3/B2 checksum and compatibility-adapter fixtures;
- split, time-availability, opportunity, and weight audits;
- one-shot gate state-machine tests, including interrupted atomic writes;
- serving bundle checksum/schema/parity tests;
- source-outage and stale-history tests;
- privacy and report-content scans;
- all existing V4 and service tests;
- `npm run lint`;
- `npm run build`; and
- desktop/mobile report rendering and keyboard interaction checks.

Tests may use synthetic fixtures on the M3, but full data preparation, model
prediction, gate scoring, packaging, and final report generation remain M5-only.

## Artifacts and visual report

Use run ID `propagation_v4_1_calibration_recovery`. Commit small evidence and
manifests under:

```text
ml/results/propagation_v4_1/propagation_v4_1_calibration_recovery/
```

Required artifacts:

- `run_manifest.json` with permanent outcome-access flags;
- `source_manifest.json` and `split_manifest.json`;
- frozen core, B2, calibrator, scorer, and environment checksums;
- calibration selection table and out-of-month evidence;
- November gate metrics and bootstrap intervals;
- locked 2025 results only if legally unlocked;
- `model_card.md`, `data_card.md`, and `reproduction.md`;
- machine-readable JSON/Parquet aggregates used by figures;
- accessible `REPORT.html` plus a non-interactive Markdown summary; and
- serving bundle manifest and parity evidence if approved.

The report must include:

1. a plain-language explanation of raw prediction versus calibration;
2. an immutable V4 failure panel with both short-path deltas;
3. data timeline showing train, calibration development, November gate, locked
   2025, and prospective 2026 roles;
4. candidate/fallback flow diagram;
5. reliability diagrams overall, by band, and by distance;
6. raw-versus-calibrated Brier deltas with zero clearly marked;
7. daily paired Brier differences and bootstrap intervals;
8. M2 versus B0, P.533/B1, and frozen V3/B2;
9. calibration support and fallback coverage;
10. source freshness/outage behavior;
11. learning-curve context without claiming that V4.1 tested 100M;
12. privacy-safe coarse geographic error and opportunity coverage;
13. exact pass/fail gates with no selectively hidden failures;
14. compute time, peak memory, storage, and reproducibility metadata;
15. limitations for WSPR-to-QSO interpretation and station selection bias; and
16. separate status panels for NowCast, FutureCast, StationCast, and 6m.

Animation is allowed only when it clarifies time evolution, such as a scrubbed
day/night reliability sequence or horizon preview. Every animation needs pause,
reduced-motion support, a static equivalent, and must not obscure exact values.

## Publication, privacy, and licensing

The core model, calibrators, feature definitions, inference code, evaluation
code, manifests, model/data cards, and research result are intended for open
publication. Hosted subscriptions or donations do not change the evidence or
model claims.

- publish failures and limitations alongside successful metrics;
- do not publish raw WSPR archives without explicit redistribution permission;
- publish download code, checksums, schemas, and permitted aggregates;
- preserve GFZ and other required attribution;
- never include private shack records in the open core or research artifacts;
- keep StationCast personalization private at inference unless an operator
  explicitly opts into a separately governed study; and
- label development, locked archive, prospective, and beta evidence distinctly.

## Execution checklist

### Phase 0: freeze and implementation (complete)

- [x] Confirm M5 repo, branch, commit, storage, and Python/Node environments.
- [x] Create `propagation_v4_1` config and source/split schemas.
- [x] Add mechanical denial for November before freeze and all 2025 outcomes.
- [x] Freeze and verify V4 evidence and M2/M1/B0/B1 checksums.
- [x] Implement and freeze the V3/B2 compatibility adapter and October
  engineering comparison.
- [x] Implement C0-C4 calibrators, guarded selection, manifests, and tests.
- [x] Implement one-shot gate orchestration and atomic result writing.
- [x] Run all pre-data tests.

**Gate:** the experiment is executable without unresolved scientific choices,
B2 is frozen, and locked scopes are mechanically enforced.

### Phase 1: calibration-development data (complete)

- [x] Inventory, download, hash, and validate 2024-02, 05, and 08.
- [x] Acquire matching OMNI/GFZ inputs and record availability semantics.
- [x] Build streaming bronze/features/opportunities in the V4.1 namespace.
- [x] Pass per-month and per-band exposure and leakage audits.
- [x] Generate frozen raw M2 predictions for calibration development.
- [x] Run leave-one-month-out C0-C4 selection.
- [x] Freeze selected mappings, refitted calibrators, support, and checksums.
- [x] Generate a synthetic dry-run report and run the full pre-gate test suite.

**Gate:** candidate and scoring code are frozen before any November outcome is
read.

### Phase 2: untouched November gate (complete; failed decision)

- [x] Record pre-unlock audit and verify no prior November outcome access.
- [x] Download/hash November WSPR and matching inputs without interim scoring.
- [x] Run source, schema, exposure, split, and leakage audits.
- [x] Score all frozen candidates in one atomic streaming run.
- [x] Calculate fixed metrics, slices, and 2,000-repetition day bootstrap.
- [x] Permanently mark the gate opened and publish every gate result.
- [x] Stop V4.1 on failure; retain the result unchanged for successor diagnosis.

**Gate:** all ten required V4.1 development gates pass. Partial success is a
failed V4.1 development decision.

### Phase 3: package and development report (publication generated)

- [x] Package the frozen V4.1 bundle and validate offline/service parity.
- [x] Run source-outage, stale-history, schema, checksum, and privacy tests.
- [x] Generate Markdown and interactive visual reports.
- [x] Verify desktop/mobile layout, chart labels, keyboard use, reduced motion,
  and static fallbacks.
- [ ] Commit and push the complete development evidence.

**Gate:** report and artifacts reproduce the decision and reveal all failures.

### Phase 4: locked archive (permanently closed for V4.1)

- [ ] Verify development approval and locked scorer/candidate hashes.
- [ ] Unlock and score the four 2025 months exactly once.
- [ ] Write the atomic locked result and all fixed comparisons.
- [ ] Publish pass/fail without post-test tuning.

**Gate:** V4.1 satisfies every locked replacement criterion. Otherwise retain
the prior approved behavior and publish the failed replacement.

### Phase 5: prospective and product evidence

- [ ] Maintain immutable NowCast and FutureCast input issuance archives.
- [ ] Complete the 2026-08-01 through 2026-09-30 frozen NowCast evaluation.
- [ ] Reach at least 90 qualified FutureCast issuance days before training.
- [ ] Run internal alpha and opt-in beta with consented outcomes.
- [ ] Compare core versus deterministic StationCast and document selection bias.
- [ ] Release only the models, horizons, modes, and claims that pass.

**Gate:** archive, prospective, operational, privacy, and product evidence agree.

## Stop rules

Stop the active phase and preserve evidence if:

- a new outcome month was accessed before its unlock conditions;
- any 2025 row or outcome aggregate was exposed early;
- a source checksum, license, schema, or time range is wrong;
- exposure reconstruction exceeds 3% error in any audited month/band;
- a feature has `available_at > issue_time`;
- the frozen model, B2, scorer, or calibrator checksum changes;
- November has been scored and someone proposes a V4.1 adjustment;
- any required development or locked gate fails;
- memory/storage bounds are exceeded or the job begins swapping materially;
- serving predictions do not match offline predictions; or
- a public artifact contains secrets or private operator information.

Do not silently repair and continue after a scientific stop. Record the event,
classify whether it is an implementation defect or protocol breach, and either
rerun under unchanged preregistered logic or create the next experiment version.

## Definition of done

V4.1 is complete when:

- the published V4 failure remains unchanged and linked;
- the B2 comparison is frozen and reproducible;
- new data roles and provenance are auditable;
- calibrator selection uses only assigned development months;
- November is evaluated once with all fixed gates reported;
- 2025 remains closed after failure or is scored exactly once after success;
- reports include exact metrics, explainers, charts, limitations, and compute;
- serving artifacts, schemas, checksums, and parity evidence are reproducible;
- all required tests, lint, build, and visual QA pass on the M5;
- no raw restricted data, credentials, or private station information enter Git;
- NowCast, FutureCast, StationCast, and 6m claims remain separate; and
- the release decision explicitly says what is approved, experimental,
  deferred, or rejected.
