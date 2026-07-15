# Personalized Propagation V4.2: Performance Recovery and Product Plan

> Status: Phase 0 and Phase 1 completed and validated on the M5. A4, A5, and
> A2 advance as the three 20M component models; A6 advances as the conditional
> blend policy. December 2024 and all 2025 outcomes remain inaccessible
> until the freezes specified below.
> North star: [`PERSONALIZED-PROPAGATION-V4-PLAN.md`](PERSONALIZED-PROPAGATION-V4-PLAN.md).
> Predecessor evidence: [`V4.1 calibration recovery plan`](PERSONALIZED-PROPAGATION-V4.1-CALIBRATION-PLAN.md)
> and [`V4.1 visual report`](results/propagation_v4_1/propagation_v4_1_calibration_recovery/REPORT.html).
> Compute: Apple M5 Max with 128 GB unified memory. Large artifacts remain on
> `/Volumes/Projects/PropulseML`; the M3 is limited to source and Git transport.

> Phase 2 status, 2026-07-15: all seven deterministic 20M cohort artifacts are
> complete and checksum-manifested. A2 has completed all three rolling folds;
> A4 training is in progress; A5, October/November scoring, and the 50M
> selection remain pending. December 2024 and all 2025 outcomes remain closed.

## Executive decision

V4.2 is not another calibration-only repair. Its purpose is to build the best
operational NowCast core supported by the available evidence and integrate that
core with Propulse's existing location and virtual-shack personalization flow.

V4.1 established four important facts on untouched November 2024 data:

1. frozen V3/B2 beat raw M2 by `0.00125817` Brier and guarded C4 by
   `0.00121215`;
2. every M2 calibrator improved raw M2 overall, but none closed the V3 gap;
3. V3 beat C4 on nine of ten HF bands, while M2 won strongly on 60m; and
4. V3 and V4 share the same 64 core features, while V4 adds 27 availability or
   missingness indicators.

The leading explanation is training-distribution recency, not a missing input.
V3 trained on 2019 plus January and April 2024 and ran to iteration 996. V4 M2
trained on quarterly 2018-2023 data, used 2024 only for validation/calibration,
and stopped at iteration 394. V4 may therefore be more historically broad but
less adapted to the current solar cycle and receiver network.

This is a hypothesis to test, not a conclusion. V4.2 will separate recency,
sampling, capacity, missingness features, and model-combination effects before
spending another 50M-row training run.

## Product objective

The shipped system should answer:

> Given the operator's current location, radio chain, antenna pattern, power,
> losses, mode, current space weather, and recent path evidence, where and on
> which bands are useful contacts likely during the selected horizon?

The open core predicts an identity-free path probability. StationCast applies
the user's existing virtual-shack and saved-location information at inference.
ReachMap renders the personalized probability field on the globe. FutureCast
remains separate until genuine issued-forecast history is sufficient.

Performance means more than one aggregate score. The selected model must:

- beat the strongest frozen statistical baseline out of time;
- remain useful across bands, distances, geography, solar regimes, and source
  availability states;
- use only inputs available at the prediction issue time;
- fit and score with bounded memory;
- preserve service/offline parity and explicit fallbacks;
- avoid station identity or exact private-location features in the open core;
- meet interactive product latency; and
- improve operator decisions once opt-in prospective outcomes exist.

## Current evidence

### November model comparison

| Candidate | Brier | Delta versus V3/B2 | Delta versus raw M2 |
|---|---:|---:|---:|
| V3/B2 | 0.04568175 | 0 | -0.00125817 |
| Raw M2 | 0.04693992 | +0.00125817 | 0 |
| C1 global isotonic | 0.04682430 | +0.00114254 | -0.00011563 |
| C2 per-band isotonic | 0.04682860 | +0.00114684 | -0.00011133 |
| C3 hierarchical isotonic | 0.04682108 | +0.00113933 | -0.00011885 |
| C4 guarded hierarchical | 0.04689390 | +0.00121215 | -0.00004602 |

### Where V4 currently loses

| Slice | C4 minus V3/B2 Brier | Interpretation |
|---|---:|---|
| 80m | +0.00306192 | largest band deficit |
| 160m | +0.00266631 | large deficit |
| 40m | +0.00173133 | large, high-volume deficit |
| 17m | +0.00126450 | material deficit |
| 15m | +0.00106189 | material deficit |
| 30m | +0.00105117 | material deficit |
| 20m | +0.00097049 | material, high-volume deficit |
| 10m | +0.00051115 | smaller deficit |
| 12m | +0.00013120 | near parity |
| 60m | -0.00323746 | M2 strength worth preserving |
| 500-1,500 km | +0.00315377 | V3 substantially better |
| 1,500-3,000 km | +0.00420778 | V3 substantially better |

This pattern argues for temporal adaptation or a mixture of experts rather than
a single global calibration adjustment.

### Phase 0 result: frozen V3 dominates raw V4 across six months

The checksum-verified streaming diagnosis scored `317,250,669` common rows and
`9,993,608,985.75` weighted opportunities. It completed on the M5 in 21.2
minutes with 9.93 GB peak RSS and zero swaps. All 17 result-validation checks
passed.

| Scope | V3/B2 Brier | Raw M2 Brier | M2 minus B2 | Relative M2 improvement |
|---|---:|---:|---:|---:|
| Feb/Apr/May/Aug selection | 0.04117401 | 0.04398309 | +0.00280907 | -6.82% |
| Oct/Nov evaluation | 0.04460622 | 0.04585356 | +0.00124734 | -2.80% |
| All six observed months | 0.04241019 | 0.04465677 | +0.00224659 | -5.30% |

The paired-day 95% interval for raw M2 minus B2 on October and November was
`[+0.00113595, +0.00135785]`. The development-optimal convex blend was exactly
100% B2. Raw M2 won no complete band on the four selection months, and no
band-distance cell beat B2 in every selection month with the required support.

This corrects an over-interpretation of the V4.1 November result. C4's strong
60m result was a calibrated, single-month effect; it does not establish raw M2
as a stable 60m specialist. The current frozen M2 should not be shipped through
a blend or router. Phase 1 must create a genuinely stronger recent/adaptive
candidate first.

Evidence: [`Phase 0 Markdown report`](results/propagation_v4_2/propagation_v4_2_performance_recovery/REPORT.md)
and [`interactive visual report`](results/propagation_v4_2/propagation_v4_2_performance_recovery/REPORT.html).

### Phase 1 result: recency recovers the V3 gap at 5M

The controlled run trained six exact 5M candidates with common XGBoost
parameters, 5M July early-stopping rows, and 5M August calibration rows. The
checksum-verified scorer evaluated `110,407,406` full October/November rows and
`3,599,391,845.75` weighted opportunities in 21.4 minutes with 9.84 GiB peak
RSS and zero swaps. All 24 primary checks passed.

| Candidate | Brier | Delta versus A0 | Delta versus B2 | October delta versus A0 | November delta versus A0 | Decision |
|---|---:|---:|---:|---:|---:|---|
| A0 V3 control | 0.04588640 | 0 | +0.00128018 | 0 | 0 | hold |
| A1 + availability flags | 0.04553578 | -0.00035062 | +0.00092956 | -0.00034933 | -0.00035203 | hold |
| A2 long natural | 0.04552943 | -0.00035697 | +0.00092321 | -0.00043791 | -0.00026878 | advance |
| A3 long balanced | 0.04853705 | +0.00265065 | +0.00393083 | +0.00260977 | +0.00269519 | reject |
| A4 recent cycle | 0.04464395 | -0.00124245 | +0.00003773 | -0.00133525 | -0.00114133 | advance |
| A5 recency weighted | 0.04498763 | -0.00089877 | +0.00038142 | -0.00093029 | -0.00086441 | advance |

A4 is the substantive result: recent-cycle sampling nearly closes the frozen
B2 gap at only 5M rows. A5 shows that long history remains useful when old eras
are downweighted. A2 shows natural historical sampling is modestly useful. A3
shows the previous balanced distribution is actively harmful under this target
and natural evaluation distribution. Availability flags help A1, but not enough
to earn one of three standalone scale slots.

A0 is a controlled reproduction, not byte-identical replay. Its October Brier
is `0.00072084` worse than the original V3 5M curve because Phase 1 uses a
stable natural top-hash cohort, a 1,200-round ceiling, and August calibration;
the original used a random subset of the V3 50M sample, 600 rounds, and July
calibration. Candidate decisions therefore compare against Phase 1 A0 and also
retain frozen B2 as the production benchmark.

### Conditional A6/A7 result

October/November residual diagnostics justified testing A6 and a possible 60m
A7 boundary. Policy parameters were selected only on August: temporary
calibrators fit days 1-20 and days 21-end selected a 0.05-grid blend or checked
the one-million-opportunity router support gate. A second checksum-verified
stream completed in 9.8 minutes with 9.95 GiB peak RSS and zero swaps. All 22
conditional checks passed.

| Policy | Frozen August rule | Brier | Delta versus A4 | Delta versus B2 | October delta versus A4 | November delta versus A4 | Decision |
|---|---|---:|---:|---:|---:|---:|---|
| A6 | 75% A4 + 25% A5 | 0.04460490 | -0.00003906 | -0.00000132 | -0.00002334 | -0.00005618 | advance policy |
| A7 | no routed band; A4 everywhere | 0.04464395 | 0 | +0.00003773 | 0 | 0 | reject |

A6 beats A4 in both months with paired-day upper 95% `-0.00002289`. It is
effectively tied with B2 overall, loses to B2 in November, and its B2 interval
crosses zero. It is not a production win. A7 stops correctly: the August 60m
selection slice contained only `137,956.75` weighted opportunities, below the
one-million support gate, and A1 was worse than A4 there. The component models
to scale remain A4, A5, and A2; A6 is rebuilt from A4/A5 at each scale.

Evidence: [`Phase 1 Markdown report`](results/propagation_v4_2/propagation_v4_2_phase1_5m/REPORT.md)
and [`interactive visual report`](results/propagation_v4_2/propagation_v4_2_phase1_5m/REPORT.html).

## Data roles

| Data | V4.2 role | Access rule |
|---|---|---|
| 2018-2023 quarterly anchors | long-history training pool | already observed |
| 2019 quarterly anchors | V3 reproduction and sampling bridge | already observed |
| 2024-01, 02, 04, 05, 07, 08, 10, 11 | diagnosis, rolling development, recency training | already observed |
| 2024-12 | untouched V4.2 development gate | do not acquire or inspect before candidate/scorer freeze |
| 2025-01, 04, 07, 10 | final locked archive | do not transform or score before V4.2 passes December |
| 2026-08-01 through 2026-09-30 | prospective NowCast evaluation | immutable future evidence |

November is no longer an untouched outcome after V4.1. It may be used for V4.2
diagnosis and training, but V4.2 claims must never present it as new validation.

## Required sources

| Source | Use | Canonical link |
|---|---|---|
| WSPRnet monthly archive | decode outcomes and exposure reconstruction | [archive](https://www.wsprnet.org/archive/) |
| NASA SPDF OMNI | definitive historical solar-wind and geomagnetic context | [OMNI documentation](https://omniweb.gsfc.nasa.gov/html/ow_data.html) |
| GFZ Kp and Hp30/Hp60 | geomagnetic context and status | [Kp](https://kp.gfz.de/en/data), [Hp](https://kp.gfz.de/en/hp30-hp60/data) |
| NOAA SWPC JSON | operational live-source parity | [services](https://services.swpc.noaa.gov/json/) |
| ITU-R P.533 | physics baseline and optional hybrid feature | [recommendation](https://www.itu.int/rec/R-REC-P.533) |

Raw third-party archives remain ignored. Public artifacts contain acquisition
code, URLs, retrieval times, terms, checksums, schemas, and aggregate metrics.

## Phase 0: paired V3-versus-V4 diagnosis

Before new training, score frozen V3/B2 and raw V4 M2 on the same February,
April, May, August, October, and November 2024 rows.

Required cuts:

- month and UTC day;
- band;
- distance and band-distance;
- recent-history availability state;
- F10.7 and geomagnetic regime;
- operational source-missingness regime;
- coarse receiver-latitude region;
- prediction disagreement; and
- opportunity mass and effective positive mass.

The diagnosis must also evaluate, without fitting a new tree model:

- fixed convex blends of V3 and raw M2;
- an analytically optimal blend selected on February/April/May/August and
  evaluated on October/November;
- a per-band router selected only on the four calibration-development months;
- a conservative band-distance router with cross-month stability and support;
- B2-versus-M2 daily bootstrap intervals; and
- whether V4's availability flags identify the deficit or merely encode
  network-era artifacts.

Output: aggregate JSON, Markdown diagnosis, visual report, checksums, peak RSS,
wall time, and a candidate recommendation. No new outcome month is opened.

## Phase 1: low-cost causal ablations

Use exact nested 5M cohorts to isolate one decision at a time. Every candidate
uses the same target, opportunity weights, feature semantics, and evaluation
rows.

| ID | Candidate | Question |
|---|---|---|
| A0 | frozen V3 reproduction | Can the current pipeline reproduce V3 when training months and feature set match? |
| A1 | V3 months + V4 missingness flags | Do the added flags help or hurt independently of time coverage? |
| A2 | V4 2018-2023 natural sample | Did regime balancing, rather than history length, cause the gap? |
| A3 | V4 2018-2023 balanced sample | Reproduce the existing M2 sampling decision at 5M. |
| A4 | recent 2022-May 2024 window | Does a current-cycle window recover transfer without using evaluation outcomes? |
| A5 | multi-year with exponential recency weights | Can long history be retained without treating every era equally? |
| A6 | long-history and recent-model convex ensemble, conditional | Do newly trained candidates have complementary cross-month residuals? Do not ensemble the current frozen M2. |
| A7 | band-aware mixture of experts, conditional | Do new candidates produce stable, supported band or band-distance specialties? Do not assume a 60m specialty from one calibrated month. |

The first pass keeps XGBoost so data choices are not confounded with a new
engine. LightGBM may be repeated as an implementation check. CatBoost or a
neural architecture advances only if tree-based candidates expose a specific
capacity limitation that the alternative addresses.

### Training controls

- Phase 1 held a common 5M July early-stopping fold fixed so data-window and
  sampling effects were not confounded; Phase 2 must add rolling-month
  sensitivity before the 50M decision;
- compare current maximum depth, learning rate, regularization, and 394 versus
  996 effective iterations on nested cohorts;
- retain raw predictions before any calibration;
- use time-aware cross-fitting for blend/router weights;
- never select a candidate from November alone;
- record training opportunity mass by year, band, distance, and solar regime;
- measure calibration separately from ranking and representation quality; and
- run all jobs with streaming Parquet batches and explicit memory telemetry.

## Phase 2: scale the winners

Advance at most three candidates from 5M to 20M. Advance at most two from 20M
to 50M. A 100M run is optional, not assumed.

Scale to 100M only when all are true:

1. the 20M-to-50M curve improves development Brier by at least 1% relative;
2. residual analysis indicates variance or rare-regime support rather than
   feature/label bias;
3. the 50M candidate already beats V3/B2 consistently across rolling months;
4. estimated memory and wall time fit the M5 or a documented rented GPU plan;
5. inference complexity remains compatible with product latency; and
6. December remains unopened.

Candidate families expected to be most useful are:

- a recency-weighted multi-year XGBoost model;
- a recent-cycle specialist;
- a two-expert ensemble or band-aware router;
- a simple global or per-band calibrator chosen by temporal cross-validation;
  and
- a physics hybrid only when its inputs are available at inference.

## Phase 3: candidate packaging and product contract

Before December access, freeze:

- model binaries, feature order, preprocessing, blend/router weights, and
  calibration objects;
- data and code checksums;
- exact December scorer and all thresholds;
- source freshness and fallback rules;
- M5 environment and package versions;
- offline/service parity fixtures;
- latency and bounded-memory evidence;
- privacy scan rejecting identity and raw shack records; and
- the ReachMap/StationCast API contract.

### Real-time NowCast inputs

The operational service must be able to construct every core feature from:

- issue UTC time and band;
- transmitter/receiver path geometry;
- NOAA SWPC operational solar and geomagnetic feeds with issuance timestamps;
- recent public decode/path evidence with freshness and availability flags;
- source age, missingness, and fallback state; and
- optional P.533 output only when its pinned implementation and inputs are
  available within the latency budget.

StationCast then applies private, local inference context derived from the
registered radio, amplifier, feed line, antenna, azimuth/elevation pattern,
realizable power, receiver characteristics, operating mode, and saved location.
Raw equipment identifiers and exact private locations do not enter the open
core or published research artifacts.

## Phase 4: untouched December gate

December 2024 is acquired and scored once after the complete candidate and
scorer freeze. All candidates receive identical rows and opportunity weights.

### Primary December gates

1. **Overall performance:** selected V4.2 Brier is at least 1% lower than
   frozen V3/B2, and the paired-day bootstrap upper bound for V4.2 minus B2 is
   below zero.
2. **Temporal value:** V4.2 beats B2 on at least 75% of qualified December UTC
   days by paired loss, with no week showing a material collapse.
3. **Band safety:** no supported band regresses more than 2% relative Brier
   versus B2.
4. **Short-path materiality:** no supported short-distance slice regresses by
   more than the larger of `0.0002` absolute Brier or 1% relative Brier. This
   replaces V4.1's overly brittle exact-zero rule with a preregistered practical
   tolerance.
5. **Calibration:** ECE is no worse than B2 by more than `0.002`, and high-
   confidence reliability has no material regression.
6. **Operational behavior:** missing/stale sources select the intended fallback
   and reduce confidence without fabricating inputs.
7. **Serving parity:** offline and API probabilities match within `1e-7`.
8. **Privacy and provenance:** no identity leakage, future availability, early
   2025 access, or checksum mismatch.
9. **Efficiency:** batch scoring remains bounded on the M5 and interactive
   single/batch API latency meets the frozen product budget.

Thresholds may be revised before December is acquired if Phase 0-3 evidence
shows they do not measure product utility. Once December opens, they are fixed.

## Phase 5: locked 2025 archive

The four 2025 months open only if every December gate passes. They are scored
once without tuning.

The final archive claim requires:

- at least 1% aggregate relative Brier improvement over V3/B2;
- positive point improvement in at least three of four months;
- no supported band regression above 3% relative Brier;
- no material calibration or fallback regression;
- all service, privacy, provenance, and efficiency contracts passing; and
- publication of every month and failure, not only the aggregate.

Failure retains the best previously approved behavior and informs another
version. It does not prohibit continued model development.

## Phase 6: personalized and prospective evidence

After the open core passes archive validation:

1. deploy it in shadow mode in Propulse;
2. compare core and deterministic StationCast predictions;
3. collect opt-in, consented outcomes and decision feedback;
4. estimate calibration by equipment capability and broad geography without
   publishing identities;
5. train learned StationCast residuals only after sample-size and selection-bias
   gates pass;
6. complete the 2026 prospective NowCast window; and
7. train FutureCast only after at least 90 genuine issued-forecast days exist.

## Compute and storage

- run all data, model, and report jobs on the M5;
- use Polars lazy scans, PyArrow datasets, DuckDB aggregates, and XGBoost
  external memory where appropriate;
- never load a complete multi-month table into RAM;
- target peak RSS below 96 GB and zero swap;
- checkpoint prediction statistics by month and candidate;
- keep raw/processed/model/temp files on `/Volumes/Projects/PropulseML`;
- commit only source, small manifests, aggregate evidence, and reports; and
- record whether a rented GPU would reduce time enough to justify reproducibility
  and environment complexity.

### Apple Silicon execution amendment

An execution-only amendment was registered before any Phase 2 October/November
scoring. The M5 audit found 18 native arm64 CPU cores (12 performance and six
efficiency), 128 GB unified memory, a native arm64 Python/XGBoost environment,
and XGBoost 3.3 linked to LLVM `libomp`. The installed build has no CUDA support,
and upstream XGBoost does not provide a Metal/MPS tree-training backend. The M5
GPU and Neural Engine therefore cannot accelerate this XGBoost experiment
without changing model engines; CPU `hist` with OpenMP is the reproducible
Apple Silicon path.

Every completed 20M fold remains on its original single-fit, 14-thread contract
and is never recomputed. The active A4 F2 fold will also finish under that
contract; only after its model and result metadata are atomically checkpointed
will the sequential launcher stop. The remaining independent 20M folds and
subsequent multi-fit launches then use a bounded spawn-process scheduler: two
folds at a time, nine
XGBoost/PyArrow CPU threads per fold, four Arrow I/O threads per fold, unique
external-memory caches, parent-only atomic checkpoints, and a conservative
sum-of-worker-peaks RSS guard below 96 GB. This uses all 18 cores across the
independent work while preserving the same data, features, weights, boosting
parameters, temporal roles, and model-selection rules. DuckDB cohort builds use
18 threads. The thread-count transition is an execution parameter and is
recorded per fold together with the XGBoost OpenMP/CUDA build flags; it was
registered before October/November scoring and does not alter any selection
outcome.

The two-worker path must pass unit tests and a bounded M5 execution check before
the selected 50M folds launch. A rented NVIDIA GPU remains an option only after
the 20M evidence identifies the advancing candidates and a fixed CPU-versus-GPU
reproducibility benchmark shows material wall-time value. It is not needed to
change model quality by itself.

## Execution checklist

### Phase 0: diagnosis

- [x] Publish V4.1 and preserve its failed result.
- [x] Confirm V3/V4 feature-set relationship and training-window difference.
- [x] Implement common streaming V3-versus-M2 diagnostic scorer.
- [x] Score February, April, May, August, October, and November 2024.
- [x] Evaluate stable blend and router policies without new tree fitting.
- [x] Generate paired diagnostic JSON, Markdown, and visual report.
- [x] Freeze Phase 0 findings and candidate recommendations.

### Phase 1: 5M ablations

- [x] Materialize exact deterministic cohorts and temporal folds.
- [x] Run A0-A5 controlled 5M experiments.
- [x] Run conditional ensemble/router candidates A6-A7.
- [x] Select A4, A5, and A2 using both-month and paired-day evidence.

### Phase 2: scale

- [ ] Train selected candidates at 20M.
- [ ] Train at most two candidates at 50M.
- [ ] Decide whether 100M is evidence-justified.

### Phase 3: package

- [ ] Freeze candidate, scorer, thresholds, service bundle, and environment.
- [ ] Pass parity, fallback, privacy, latency, and memory checks.
- [ ] Produce synthetic dry-run report and browser QA.

### Phase 4: December gate

- [ ] Verify December was never previously acquired or inspected.
- [ ] Open, process, and score December exactly once.
- [ ] Publish all gates and stop or approve archive access.

### Phase 5: 2025 archive

- [ ] Keep all 2025 outcomes closed until December approval.
- [ ] Score the four locked months exactly once if legally unlocked.
- [ ] Publish the final archive decision without tuning.

### Phase 6: product evidence

- [ ] Shadow the approved core in ReachMap and StationCast.
- [ ] Complete opt-in alpha/beta and prospective evidence.
- [ ] Release only claims and modes supported by the evidence.

## Immediate resume instruction

On the M5:

> Read this file, `PERSONALIZED-PROPAGATION-V4-PLAN.md`, and the Phase 1 report.
> Continue Phase 2 using only already-open data. Do not acquire December 2024
> or transform any 2025 outcome. Materialize deterministic nested 20M cohorts
> for A4 recent-cycle, A5 recency-weighted, and A2 long-natural. Use external-
> memory QuantileDMatrix or an equivalent bounded streaming path, preserve the
> exact Phase 1 feature and weight contracts, add rolling-month early-stopping
> sensitivity, and refit A6 only from A4/A5 using the earlier policy-selection
> fold. Compare full October and November with paired-day uncertainty. Advance
> at most two component models to 50M; keep A7 rejected unless new pre-evaluation
> evidence independently satisfies its support and performance gates.
