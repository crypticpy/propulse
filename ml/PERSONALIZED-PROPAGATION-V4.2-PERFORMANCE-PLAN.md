# Personalized Propagation V4.2: Performance Recovery and Product Plan

> Status, 2026-07-15: Phases 0-5 are complete on the M5. The frozen 50M A6
> blend passed untouched December 2024 and the four-month locked 2025 archive.
> Phase 6 shadow, opt-in, and prospective evidence remains open; the frozen
> 2026-08-01 through 2026-09-30 window is still in the future and unread.
> North star: [`PERSONALIZED-PROPAGATION-V4-PLAN.md`](PERSONALIZED-PROPAGATION-V4-PLAN.md).
> M5 execution: [`PERSONALIZED-PROPAGATION-V4.2-M5-RUNBOOK.md`](PERSONALIZED-PROPAGATION-V4.2-M5-RUNBOOK.md).
> Live feature contract: [`NOWCAST-LIVE-FEATURE-PIPELINE.md`](NOWCAST-LIVE-FEATURE-PIPELINE.md).
> Predecessor evidence: [`V4.1 calibration recovery plan`](PERSONALIZED-PROPAGATION-V4.1-CALIBRATION-PLAN.md)
> and [`V4.1 visual report`](results/propagation_v4_1/propagation_v4_1_calibration_recovery/REPORT.html).
> Compute: Apple M5 Max with 128 GB unified memory. Large artifacts remain on
> `/Volumes/Projects/PropulseML`; the M3 is limited to source and Git transport.

> Final retrospective evidence: A6 is a frozen 70% A4 recent-cycle and 30% A5
> recency-weighted probability blend. It improved weighted Brier versus frozen
> V3/B2 by 2.354% on October-November development, 2.038% on untouched
> December, and 2.134% across 208,372,533 locked 2025 rows. All four archive
> months and every supported HF band improved. See the
> [combined visual report](results/propagation_v4_2/propagation_v4_2_phase2_scale/final_report/REPORT.html).

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

After 50M scoring, the final development candidate is selected by a frozen
rule. First choose the lowest October/November Brier among candidates that beat
B2 in aggregate and in both months with a paired-day upper 95% bound below
zero. If that set is empty, choose the lowest Brier among candidates that
improve their own 20M version by the same aggregate, both-month, and paired-day
rule while remaining within 0.25% relative Brier of B2. Candidate identifier is
the deterministic tie-break. A6 participates only when both A4 and A5 were
trained at 50M. If no candidate is eligible, Phase 3 stops before December.

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

The Phase 3 operational thresholds are frozen before packaging: native arm64
execution with at least 18 visible cores and OpenMP-enabled XGBoost; exact
offline/service probability parity within `1e-12` on 256 deterministic rows
from each open evaluation month; path-history fallback only when age exceeds
`7,200` seconds; end-to-end API p95 below 50 ms for a single path and 3,000 ms
for a 4,096-cell surface; validation peak RSS at or below 32 GB; and a serving
bundle no larger than 256 MiB. The validator also checks missing-input flags,
fallback provenance and reduced confidence, bounded probabilities, response
schemas, model checksums, locked-scope flags, and recursively scans the public
manifest for private identity fields or values.

The serving bundle separately defaults to one XGBoost prediction thread per API
request so a small container never inherits the M5's nine-thread training
worker setting. A deployment may override it only through
`PROPULSE_XGBOOST_THREADS`; health and model metadata expose the effective
value, and Phase 3 latency is measured using the manifest default.
Missing path-history freshness selects the physics fallback, and negative ages
are rejected; unknown freshness never selects the NowCast profile.

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

The numeric interpretation is now frozen in
`propagation_v4_2_phase2_scale.json`. A qualified day carries at least one
million opportunities. A supported week, band, or distance bin has at least
10,000 rows and one million opportunities. "No material weekly collapse"
means no supported week regresses more than 2% relative Brier. The three short
bins are 0-500, 500-1,500, and 1,500-3,000 km; each may regress by no more than
the larger of `0.0002` absolute Brier or 1% of B2 Brier. High-confidence
reliability uses bins beginning at probability 0.5 and may worsen by no more
than `0.002` absolute maximum gap. The paired UTC-day interval uses 2,000
resamples. These definitions are code-tested in `gate_scoring.py` and must not
change after December acquisition begins.

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

The locked archive also requires the aggregate paired UTC-day upper 95% bound
to remain below zero. Supported-band minimums remain 10,000 rows and one
million opportunities; ECE and high-confidence maximum-gap deltas versus B2
may each worsen by at most `0.002`. These thresholds are frozen before any 2025
outcome is transformed or scored.

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

The two-worker path passed its real macOS spawn-process test and all 41 V4.2
unit tests. A rented NVIDIA GPU remains an option only after
the 20M evidence identifies the advancing candidates and a fixed CPU-versus-GPU
reproducibility benchmark shows material wall-time value. It is not needed to
change model quality by itself.

XGBoost's CPU external-memory path is intentionally I/O bounded. Before the
50M backend is frozen, Phase 2 therefore runs a training-only backend benchmark
on the A4 July fold: the exact same 20M cohort, 5M early-stopping sample,
features, weights, parameters, seed, and first 50 trees are fit in separate
processes with `ExtMemQuantileDMatrix` and iterator-fed `QuantileDMatrix`.
October and November are not read. The streamed in-memory quantile backend may
advance for 50M only if it is at least 1.5 times faster, validation log loss is
within `0.000001`, and the two-worker 50M peak projected linearly from the
measured 20M RSS is at most 80 GB. This does
not materialize the raw multi-month table in RAM: Parquet remains streamed in
batches and only XGBoost's compressed quantile representation is retained. If
any gate fails, 50M remains on external memory.

The benchmark passed every gate. External memory required `208.9943` seconds
for construction plus 50 trees; streamed in-memory quantile storage required
`80.2813` seconds, a `2.6033x` end-to-end speedup. Boosting alone improved from
`167.6585` to `22.8470` seconds (`7.3383x`). Both arms produced exactly
`0.17702686851738286` validation log loss, with zero difference at recorded
precision. In-memory peak RSS was `14.5621` GB at 20M; the deliberately
conservative linear two-worker 50M projection is `72.8105` GB, below the 80 GB
benchmark limit and 96 GB hard ceiling. The frozen 50M backend is therefore
iterator-fed `QuantileDMatrix`; 20M remains external-memory for experiment
continuity. The decision used no October, November, December, or 2025 outcome.

The execution contract was hardened again on 2026-07-15 without changing any
data, statistical, or selection decision. Every remaining cohort build,
training run, open-month score, locked-gate score, and Phase 3 validation now
refuses to run unless macOS reports native arm64, all 18 physical cores, the
expected 12-core/6-core cluster topology, and at least the configured 96 GiB
RSS ceiling in unified memory. Model workflows additionally require XGBoost
with OpenMP. The host must be on AC power in High Power mode (`powermode 2`),
and any explicit macOS CPU-speed, scheduler, or availability limit below 100%
aborts the run. Single-process Arrow scans use
all 18 CPU threads with six I/O threads; each two-fit training worker receives
nine CPU threads and four I/O threads. Runtime evidence records the topology,
power source/mode, memory, Arrow pools, XGBoost version, OpenMP, and CUDA flags.
The live M5 audit passed with 128 GiB unified memory, High Power mode, and 1.4
TiB free on the Projects volume. The 20M external-memory folds remain I/O-bound
by design; the already-frozen iterator-fed `QuantileDMatrix` 50M backend is the
path that converts the larger memory budget into materially higher CPU use.
Before October/November scoring, the single-process scorer was also amended to
reuse one `float32` feature matrix for candidates with identical feature order
and keep band/day label conversion in vectorized Arrow/NumPy code. A no-outcome
benchmark compares 1, 6, 9, 12, and 18 XGBoost prediction threads on 100,000
rows from the allowed final early-stopping sample, requires bit-identical
predictions, and pins the fastest count before scoring. The locked-gate scorer
uses the same selected path. These are execution-only changes: stream order,
predictions, metric arithmetic, calibration, and selection gates are unchanged.
The selected benchmark artifact, scorer helpers, runtime checks, outcome
protocol, B2 adapter, and calibration dependency are all required frozen
artifacts before the one-shot December scope can open. The V3/B2 results file,
model, and isotonic calibrator used as the gate baseline are frozen separately
as well, so neither side of the comparison can change after approval.

This is also the default execution policy for later retraining and the separate
6m experiment: use native `arm64` packages, stream Parquet with DuckDB,
PyArrow datasets, or Polars lazy scans, and allocate physical cores explicitly
at the process boundary. Never combine an 18-thread fit with an 18-thread outer
worker pool. Independent fits use two spawned processes with nine
XGBoost/Arrow CPU threads each; a single DuckDB transform or batch scorer may
use all 18 cores. Inner numeric libraries remain bounded by the owning process
so nested parallelism cannot silently oversubscribe the machine. The measured
50M memory and throughput, not nominal unified-memory capacity, remain the
sizing evidence. Rent an NVIDIA GPU only if a frozen CPU-versus-GPU benchmark
shows equivalent predictions/metrics and material end-to-end speedup; Apple GPU
or Neural Engine availability alone is not a reason to change the validated
tree model.
DuckDB timezone is also pinned to UTC in every remaining V4.2 connection and
the locked-month audit converts timestamps to UTC inside its SQL. A synthetic
boundary-row test exposed this requirement before December access: an unpinned
connection on the Chicago-configured M5 would otherwise label midnight UTC as
the prior local calendar month. This is an execution/audit correction only;
the 20M/50M builders select complete month files by their UTC Parquet metadata,
not with the affected SQL month predicate.
The completed Phase 1 5M builder did predate this correction and used a SQL
month predicate, so its frozen cohorts may omit UTC-month boundary hours when
built on a non-UTC host. That limitation is now disclosed rather than repaired
after October/November were observed. It does not change the Phase 2 inventory:
A2, A4, and A5 all advanced, and their 20M/50M cohorts use complete UTC month
files. Phase 1 absolute metrics remain screening evidence, while final claims
must rest on the corrected Phase 2 models and untouched gates.

### Completed M5 execution and locked evidence

Phase 2 selected A6 at 50M after scoring `110,407,406` identical October and
November rows. A6 reached `0.04355603` Brier versus `0.04460622` for frozen
V3/B2, a `2.354%` relative improvement. The 50M policy-selection slice fixed
the blend at 70% A4 recent-cycle and 30% A5 recency-weighted probability. A4
and A5 were the only tree models trained at 50M; A2 stopped at 20M. The 100M
gate rejected both components because the required residual variance or
rare-regime support was absent. More rows alone are not an approved reason.

The two concurrent 50M fits ran as two nine-thread OpenMP workers and completed
in about 53 minutes. Their conservative combined peak was `49.6810` GiB,
well below the 96 GiB ceiling. The selected iterator-fed QuantileDMatrix backend
was `2.6033x` faster end to end than external memory on the frozen benchmark.
The single-process prediction benchmark selected all 18 cores and measured a
`9.5080x` speedup versus one thread with bit-identical predictions. No CUDA,
Metal tree backend, swap pressure, thermal warning, or performance warning was
observed. A rented GPU is not justified for this model generation.

After the Phase 3 bundle passed all 16 operational checks, December was opened
once under attempt `december-20260715T231616Z`. A6 improved Brier by `2.038%`,
won all 31 qualified UTC days, improved every supported band, and passed all ten
gates. Only then was the archive opened once under attempt
`archive-20260715T233440Z`. Across January, April, July, and October 2025, A6
scored `0.04096767` versus `0.04186090` for B2, a `2.134%` improvement. The
paired-day upper 95% Brier delta was `-0.00079758`; all four months and every
supported band improved; all six archive gates passed. The protocol state is
now `archive_passed`. Neither locked scope was used for fitting, calibration,
threshold selection, or policy changes.

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

- [x] Train selected candidates at 20M.
- [x] Train at most two candidates at 50M.
- [x] Decide whether 100M is evidence-justified (no: required residual support
  is absent, despite A5 crossing the learning-curve threshold).

### Phase 3: package

- [x] Freeze candidate, scorer, thresholds, service bundle, and environment.
- [x] Pass parity, fallback, privacy, latency, and memory checks.
- [x] Produce synthetic dry-run report and browser QA.

The synthetic gate report dry run passed the canonical portable builder and
browser verifier on the M5 at 1,440 px and 390 px. It rendered 22 ordered
evidence blocks, five charts, six metrics, and the exact gate table; source
dialog keyboard interaction, responsive overflow checks, and the no-network
contract passed. The fixture is labeled synthetic, and its protocol record
confirms that December 2024 and all 2025 outcomes remained closed.

### Phase 4: December gate

- [x] Verify December was never previously acquired or inspected.
- [x] Open, process, and score December exactly once.
- [x] Publish all gates and approve archive access.

### Phase 5: 2025 archive

- [x] Keep all 2025 outcomes closed until December approval.
- [x] Score the four locked months exactly once after legal unlock.
- [x] Publish the final archive decision without tuning.

### Phase 6: product evidence

- [x] Implement and locally deploy the approved core shadow path in ReachMap
  and StationCast, with hidden UI and aggregate-only service telemetry.
- [x] Reproduce the historical WSPR transform across October and November open
  months and validate late/duplicate/versioned receipt behavior synthetically.
- [x] Rollback-validate the private WSPR schema and lookup RPC against the real
  target PostgreSQL instance without leaving persistent objects.
- [x] Deploy the exact reviewed six-migration chain and pass post-deployment
  ledger, RLS, grant, policy, search-path, provenance, and four-lag RPC gates.
- [x] Make operational weather server-authoritative, validate a real hardened
  NOAA capture against A6, and reject browser weather/freshness forgery.
- [x] Add an HMAC completion-manifest runner that finalizes all ten HF bands
  with bounded multicore concurrency and prunes only after total success.
- [x] Implement a disabled-by-default, disk-streaming WSPR.live research
  connector and validate one real settled hour without target writes.
- [ ] Accumulate permitted beta shadow traffic with authorized recent-path
  features and receipt-time outcomes.
- [ ] Complete opt-in alpha/beta and prospective evidence.
- [ ] Release only claims and modes supported by the evidence.

The service bundle, feature builders, station adapter, Band Planner path, and
ReachMap surface path are implemented and validated. Explicit frontend and
service shadow execution plus privacy-bounded aggregate telemetry are now
implemented. The current shadow path correctly selects the physics fallback
because authorized, replay-equivalent live WSPR lag features do not yet exist.
The real A6 bundle also passed a local M5 HTTP smoke deployment with six
one-thread workers, allowlisted CORS, explicit fallback, and a persisted
`propagation-shadow-v1` event. Phase 6 remains open until a durable beta
deployment exists, a permitted source passes the live pipeline gates, and real
opt-in shadow receipts are collected. Consented outcomes and the future
prospective window also cannot be marked complete from retrospective archive
evidence.

The live-feature foundation now has a server-authoritative safety boundary:
client lag values and freshness cannot select NowCast. The shared frozen
DuckDB transform reproduced 88,466 open October opportunity cells and 78,478
lag cells exactly from 302,903 bronze spots. The private rolling schema,
idempotent source-agnostic ingest boundary, bounded watermark-last finalizer,
and batched causal lookup contract are implemented. The M5 replay then sampled
every UTC hour twice across October and November: 12,245,675 spots produced
3,628,293 exact opportunity cells and 3,218,610 exact path-hour cells across all
ten HF bands, with zero directional or lag-value differences. H-1/H-2/H-3/H-24
lookups were causal and batch/single identical. Synthetic 10% late-arrival and
duplicate cases proved immutable first versions plus exact corrected versions;
the archive does not contain trustworthy receipt timestamps, so this is not a
substitute for the required live window. The WSPR migration separately passed
all 14 gates in a rollback-only transaction on target PostgreSQL 17.6, leaving
no persistent change. The exact chain was then applied through the normal
migration ledger and passed all 15 post-deployment gates; transactional RPC
smoke rows were removed. Trusted operational weather then passed all 14 target
gates against the real A6 bundle with 14 causal fields and 2.91 ms cached path
p95. The signed hourly runner is implemented and refuses CPU oversubscription,
partial-band manifests, timestamp gaps, tampering, and prune-before-success. An
authorized provider connector, runner activation/monitoring, real receipt-time
capture, and live coverage evidence remain open.

The research connector subsequently passed all 8 real-source dry-run gates on
the M5. One exact-hour request returned `287,694` archive-compatible rows across
all ten HF bands in `23.1142` seconds at `57.625` MiB peak RSS. The canonical
spool was written to the fast Projects volume, checksum-linked, and removed;
the target feature store was not written. This establishes source-schema and
streaming compatibility only. Continuous internal collection is still disabled,
and [the prepared request](WSPR-LIVE-PERMISSION-REQUEST.md) must receive written
confirmation before subscriber-facing use unless an independently permitted
source replaces WSPR.live.

The real A6 bundle subsequently passed all 14 pre-provider foundation gates on
the M5. Malicious browser lag/freshness values remained on physics fallback,
telemetry contained no grid or station-envelope fields, path p95 was 3.39 ms,
and 288-cell surface p95 was 10.59 ms. The interactive foundation report passed
the canonical portable builder and browser verification at 1,440 px and 390 px.
Its evidence is isolated under
`results/propagation_v4_2/propagation_v4_2_phase2_scale/live_feature_pipeline/`;
it does not alter the frozen retrospective report or approve a live source.
The report now includes the two-month replay, correction/versioning evidence,
four-lag lookup checks, target migration rollback result, and current release
blockers.

## Immediate resume instruction

On the M5:

> Read this file, `PERSONALIZED-PROPAGATION-V4-PLAN.md`, the final retrospective
> report, and `NOWCAST-LIVE-FEATURE-PIPELINE.md`. The protocol state is
> `archive_passed`; do not refit or tune A6 from December or 2025. Continue
> Phase 6 by deploying the frozen bundle in shadow mode, recording event time,
> receipt time, model/feature versions, freshness, fallbacks, core and
> deterministic StationCast probabilities, and consented outcomes. Preserve the
> 2026-08-01 through 2026-09-30 prospective window without inspection or tuning
> until its preregistered evaluation. Keep FutureCast, learned StationCast, and
> 6m as separate evidence tracks.
