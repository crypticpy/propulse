# Propagation Forward Execution Plan

> Status: active execution plan, audited 2026-07-18.
>
> North star: [`PERSONALIZED-PROPAGATION-V4-PLAN.md`](PERSONALIZED-PROPAGATION-V4-PLAN.md).
> Frozen model protocol and evidence: [`PERSONALIZED-PROPAGATION-V4.2-PERFORMANCE-PLAN.md`](PERSONALIZED-PROPAGATION-V4.2-PERFORMANCE-PLAN.md).
> Product and cloud implementation record: [`PROPAGATION-PRODUCT-CLOUD-INTEGRATION-PLAN.md`](PROPAGATION-PRODUCT-CLOUD-INTEGRATION-PLAN.md).
> Alpha/beta protocol: [`PERSONALIZED-PROPAGATION-V4.2-BETA-PROTOCOL.md`](PERSONALIZED-PROPAGATION-V4.2-BETA-PROTOCOL.md).
> FutureCast protocol: [`FUTURECAST-V1-PROTOCOL.md`](FUTURECAST-V1-PROTOCOL.md).
>
> This file is the current sequencing and handoff authority. It supersedes stale
> unchecked execution boxes in historical plans, but it does not weaken or
> replace any frozen scientific, privacy, authorization, or release gate.

## Executive decision

Do not retrain A6 now. The 50M-row A6 NowCast core is frozen, integrated, and
performing well enough to enter private operator acceptance. The next gains must
come from operational reliability, genuine prospective evidence, honest station
personalization validation, and horizon-specific FutureCast data rather than
another retrospective model search.

The immediate critical path is:

1. repair the failed WSPR research collector and determine whether its 45-hour
   continuity clock can be recovered honestly;
2. rebuild the first-party prospective collector's 24-hour clean preflight;
3. establish a real owner login and conduct private product acceptance;
4. obtain written permission for the proposed WSPR.live uses or replace that
   source with an authorized first-party source;
5. complete the controlled M5 outage proof;
6. freeze the prospective evaluation artifacts before 2026-08-01;
7. capture 2026-08-01 through 2026-09-30 without reading outcomes, then score
   once after the window closes;
8. allow FutureCast to mature without synthetic or leaked substitutes; and
9. keep 6 meters as an independent mechanism-specific research program.

## Current truth

### Completed and frozen

- A6 is the frozen 70% A4 recent-cycle plus 30% A5 recency-weighted blend.
- A6 improved weighted Brier score versus V3/B2 by 2.354% on development,
  2.038% on untouched December 2024, and 2.134% across the locked 2025 archive.
- The exact model bundle, calibrators, manifest, and physics fallback are
  deployed privately to Railway in `shadow` mode.
- The authenticated Vercel-to-Railway inference path is live at
  [propulse.cloud](https://propulse.cloud).
- Band Planner, deterministic StationCast, the 324-cell ReachMap, confidence,
  freshness, profile, fallback, and exact model identity are integrated.
- Desktop and mobile authenticated end-to-end QA passed with exact A6 and
  fallback behavior both labeled correctly.
- The off-device propagation uptime workflow is active. Its latest ten
  scheduled runs on 2026-07-18 succeeded.
- FutureCast code, streaming export, Polars materialization, bounded multicore
  training, one-shot scoring, lineage checks, and synthetic end-to-end proof
  are implemented. No real future horizon has been trained or released.
- The August 1 through September 30, 2026 prospective NowCast window is frozen
  and its outcomes remain unread.

### Open incidents and clocks

- **WSPR collector incident:** the M5 WSPR research scheduler has 16 consecutive
  failures. The current failure originates in the Supabase
  `prune_wspr_observations` RPC returning HTTP 500. The last completed hour is
  2026-07-17T23:00Z and the failed target begins at 2026-07-18T00:00Z.
- **WSPR evidence:** 45 continuous hours were completed before the incident,
  against the 720-hour gate. The continuity receipt is invalid while the
  scheduler and coverage audit are failing.
- **First-party inputs:** PSK Reporter, RBN, DX Cluster, and required
  solar/geomagnetic inputs are currently present, but continuity reset to
  0.417/24 hours after an outage. `prospective_capture_ready` is false.
- **FutureCast archive:** both required NOAA products are being captured, with
  three qualifying common days out of 90 and no invalid captures. Every real
  +3/+6/+12/+24 horizon remains withheld for insufficient history.
- **WSPR authorization:** the permission request is prepared but not sent.
  Subscriber-facing use is not authorized.
- **Physical outage proof:** non-destructive preflight passed, but a literal
  controlled M5 shutdown has not been performed.
- **Cloud cost:** real Railway, Supabase, and Vercel meter values after a
  representative week have not yet been recorded.
- **Owner acceptance:** no persistent owner test session has yet covered all
  saved locations, shack presets, bands, profiles, fallbacks, and viewports.

If FutureCast capture remains uninterrupted, 2026-07-16 is day one, the 90th
issuance day is 2026-10-13, and the +24-hour outcome matures on approximately
2026-10-14. This is an earliest possible evidence date, not a release promise.

## Historical plan disposition

| Plan | Disposition | Remaining authority |
|---|---|---|
| `ARCHIVE-MULTIMONTH-V3-PLAN.md` | Executed with documented deviations | Historical reproducibility only; unchecked boxes are not new work |
| `PERSONALIZED-PROPAGATION-V4-PLAN.md` | Active north star | Product objective, scientific posture, privacy, open release, independent 6m track |
| `PERSONALIZED-PROPAGATION-V4.1-CALIBRATION-PLAN.md` | Closed after the November decision | Historical negative/diagnostic evidence; locked archive stays closed |
| `PERSONALIZED-PROPAGATION-V4.2-PERFORMANCE-PLAN.md` | Phases 0-5 complete; Phase 6 evidence open | A6 freeze, prospective protocol, release gates |
| `PROPAGATION-PRODUCT-CLOUD-INTEGRATION-PLAN.md` | Phases A-E complete | Operational continuity, cost, product polish, acceptance, staged evidence |
| `PERSONALIZED-PROPAGATION-V4.2-BETA-PROTOCOL.md` | Preregistered; collection disabled | All alpha/beta gates and StationCast claim tests |
| `FUTURECAST-V1-PROTOCOL.md` | Preregistered; acquisition active | Horizon construction, one-shot gates, independent horizon release |

## Workstream 0: restore trustworthy operations

**Priority:** blocking, begin immediately.

### 0A. Establish owner access

- Confirm the intended owner email exists in Supabase Auth.
- If absent, use the normal Supabase invitation or product registration flow;
  do not silently create a confirmed account with an administrator password.
- Confirm the invite/recovery redirect returns to `https://propulse.cloud` and
  opens the existing password recovery UI.
- Verify login, session refresh, logout, and protected propagation requests.
- Keep email addresses, tokens, and Auth responses out of Git and reports.

**Pass:** the owner can authenticate in production and load protected product
surfaces without an administrator bypass.

### 0B. Repair the WSPR prune failure

- Reproduce the `prune_wspr_observations` HTTP 500 using database logs and a
  least-privilege SQL call.
- Inspect function definition, schema qualification, ownership, grants,
  statement timeout, row volume, indexes, locks, and return type.
- Add a reversible migration and an explicit rollback test. Bound deletes by
  time and batch size so maintenance cannot hold an unbounded transaction.
- Apply the migration, run the prune RPC directly, then run one scheduler hour
  and one coverage audit.
- Catch up missing hours in chronological order only where the upstream source
  still exposes receipt-time-correct data. Never synthesize a completed hour.
- Recompute signed progress and coverage receipts from persisted evidence.
- Decide from the actual source timestamps whether the original 45-hour clock
  remains continuous. If any hour cannot be recovered exactly, restart the
  720-hour clock and preserve the incident in the report.

**Pass:** zero consecutive failures, at least three newly completed exact hours,
valid signed progress and coverage receipts, all ten HF bands in every completed
hour, and a defensible continuity start.

### 0C. Rewarm first-party prospective capture

- Let the existing PSK Reporter, RBN, DX Cluster, and space-weather collector
  run without rewriting or deleting the outage history.
- Diagnose any repeated source lag and prove the existing fallback labels.
- Require 24 consecutive gap-free hours, at least 95% fresh-weather
  availability, no stale run longer than two quarter-hour samples, and current
  final source samples.
- Validate the health receipt and database watermarks against raw source
  availability without exposing identity-bearing records.

**Pass:** `prospective_capture_ready: true` under the frozen rules.

### 0D. Close operational bookkeeping

- Verify the scheduled off-device uptime workflow continues to pass.
- Capture representative Railway compute/RAM, Supabase storage/egress, and
  Vercel request/egress meter values after at least seven days of private use.
- Record measured values and scaling triggers in the cloud report; do not
  replace measurements with provider-list-price estimates.

## Workstream 1: private product acceptance and polish

**Dependency:** owner login. Model retraining is not required.

### 1A. Owner acceptance matrix

Exercise production with the owner's real saved data, without copying that data
into fixtures, screenshots, logs, or Git:

- multiple saved locations and the active-location switch;
- multiple shack presets, radio/power/antenna/feedline combinations;
- all ten supported HF bands;
- Core and My Station views;
- exact A6, physics fallback, stale-input, OOD, and service-unavailable states;
- Band Planner, globe, flat map, azimuthal view, and mobile layouts;
- authentication refresh, cancellation, cache reuse, and degraded networking.

Record only aggregate pass/fail and sanitized defect evidence. Private owner
testing must not tune A6 or become prospective model evidence.

### 1B. ReachMap selected-region inspector

Add hover, keyboard focus, and tap inspection showing:

- target region and center locator;
- bearing and great-circle distance;
- predicted probability and confidence;
- Core or My Station profile;
- valid time, feature freshness, fallback/OOD state, and exact model identity.

Use existing map/projection patterns, preserve 324 stable cells, and keep text
and controls usable on 390-pixel mobile width. Run desktop/mobile Playwright,
canvas-pixel, reduced-motion, cancellation, and projection-switch checks.

### 1C. Honest timeline states

- Show `now` plus explicit archive-readiness state for +3/+6/+12/+24.
- Do not render synthetic data as propagation forecasts.
- Add time animation only after at least one real horizon independently passes.
- When added, animate discrete issued snapshots; label any visual interpolation
  as presentation, never model output.

**Pass:** the owner acceptance matrix is complete, unresolved severity-one or
severity-two propagation defects are zero, and the inspector passes desktop and
mobile QA.

## Workstream 2: satisfy evidence preflight

### 2A. Resolve WSPR authorization

- Send `WSPR-LIVE-PERMISSION-EMAIL.txt` unchanged to the documented contact.
- Retain the response and headers privately, verify the sender, hash the reply,
  and run `validate_wspr_source_authorization.py` for both
  `internal_research` and `subscriber_recent_path_features`.
- Do not treat silence, public query access, or research permission as
  subscriber-facing permission.
- If permission is denied or ambiguous, keep research results private and build
  or contract an authorized first-party WSPR observation source.

This matters because [WSPR.live](https://wspr.live/) publishes non-commercial
and free-result conditions and does not promise uptime. Propulse's nonprofit
and donation-supported structure does not remove the need for a written answer
for the exact subscriber-facing use.

### 2B. Complete the 720-hour research shadow

Use one fixed span of 720 consecutive expected wall-clock hours. At least 713
hours must be exact completed hours, which is the preregistered 99% threshold;
at most seven expected hours may remain explicitly missing. Never synthesize a
completed hour, hide a gap, or extend the window after seeing outcomes. Require
all ten HF bands per completed hour, no unresolved integrity errors, valid
signed schedule and coverage receipts, and sufficiently separated early/late
drift slices. The operational target remains all 720 hours complete.

### 2C. Perform the literal outage proof

- Schedule a controlled window with the owner.
- Arm the immutable off-M5 challenge, physically stop or shut down the M5, and
  verify one incident opens from off-device evidence.
- Restore the M5 and verify the incident closes only after the real publisher,
  collectors, health receipts, and freshness recover.
- Preserve timestamps and sanitized receipts. A process restart or synthetic
  heartbeat is not a full-machine outage proof.

### 2D. Validate beta infrastructure

Complete the migrations and rollback checks for consent, attempt, outcome,
retention, aggregate export, RLS, service-role access, telemetry, and every stop
counter producer. Keep one versioned signed-receipt schema, but do not share a
symmetric signing secret across the model service and product API. Make the
model service the issuer: its private key signs receipts, while the product API
receives only pinned public verification keys. Include algorithm, key ID,
schema version, issued time, expiry, overlap, rotation, and revocation rules;
reject the legacy shared-HMAC model outcome receipt when beta collection is
active. Separately keyed owner-only HMAC telemetry and stop-monitor receipts may
remain inside the M5/owner audit boundary; their keys never enter the product
API or model outcome service and require distinct purposes, key IDs, rotation,
and verification tests. Private-key provisioning never enables model-outcome
receipt issuance. Keep that issuance fail-closed, and keep both outcome flags
false, until all eight preflight gates pass and an explicit beta release is
recorded.

**Pass:** all eight preflight gates in
`PERSONALIZED-PROPAGATION-V4.2-BETA-PROTOCOL.md` pass literally.

## Workstream 3: locked prospective NowCast evaluation

### Before 2026-08-01

- Re-hash A6, calibrators, manifest, station adapter, scorer, feature contract,
  source versions, sampling config, and the locked analysis script.
- Verify the outcome-reading path remains mechanically denied.
- Verify first-party and WSPR continuity receipts and alerting.
- Record predictions, source availability, feature freshness, fallback state,
  and exact model identity prospectively.
- Produce a go/no-go receipt. A no-go preserves the protocol and documents the
  interruption; it does not justify moving the window after seeing outcomes.

### 2026-08-01 through 2026-09-30

- Run capture and monitoring only.
- Do not inspect outcome summaries, tune thresholds, change strata, refit A6,
  or select a cleaner subwindow.
- Repair operational failures from source timestamps and immutable records; log
  every intervention.

### After 2026-09-30

- Close and hash the outcome window once.
- Score frozen A6, frozen baselines, deterministic StationCast where applicable,
  calibration, bands, regions, solar regimes, source availability, and drift.
- Generate a public-safe visual report with confidence intervals, data lineage,
  missingness, failures, and limitations.
- Promote claims only if preregistered gates pass. If A6 does not pass, retain
  the operational fallback and start a new prospectively defined successor;
  never repair the failed test by tuning on it.

**Decision:** only this result can justify a new HF core training program. A
success keeps A6; a diagnosed failure defines A7 hypotheses and a fresh lock.

## Workstream 4: alpha, beta, and learned StationCast

### Alpha

- 10 consented participants;
- at least 200 binary attempt outcomes, including 50 Tier-A outcomes;
- at least seven days, three HF bands, and three preregistered strata;
- zero active stop events.

### Beta

- 50 consented participants over at least 30 days;
- 2,000 primary capped WSPR reception outcomes and 1,000 Tier-A outcomes;
- at least five bands with 100 outcomes each;
- four reportable geographic and three reportable capability cells;
- no active stop event and no participant above the frozen sample cap.

The deterministic StationCast claim requires at least 1% relative Brier gain,
operator-cluster confidence interval upper bound below zero, calibration
degradation no worse than 0.002, no slice regression above 3%, and matching
direction on Tier-A outcomes.

Do not fit a learned StationCast residual during this beta. Consider a learned
residual only after the deterministic adapter has completed its preregistered
test and a new protocol defines an adequate, consented, leakage-safe cohort.

## Workstream 5: FutureCast

- Continue the six-hour NOAA acquisition LaunchAgent and daily health checks.
- Preserve every payload, `issued_at`, `available_at`, `valid_at`, hash, parser
  version, and quality flag.
- Require the first 90 consecutive common legal issuance days plus mature WSPR
  outcomes. Never backfill with observed OMNI/GFZ values or a newer forecast.
- Materialize with the existing streaming PostgreSQL-to-Parquet and Polars
  pipeline. Train with the existing bounded `2 x 9` external-memory profile.
- Compare every horizon against issued-input baselines and the paired P.533
  diagnostic using the frozen one-shot scorer.
- Release +3, +6, +12, and +24 independently. A failed or immature horizon
  remains visibly unavailable and cannot borrow another horizon's result.
- Produce a source-backed visual report for the canonical decision.

## Workstream 6: independent 6-meter program

The existing 6m development result is encouraging but event-selected and not
release evidence: 386,832 training rows, 115,246 validation rows, 111,310 locked
rows, 0.012749 Brier, 0.9161 PR-AUC, and 0.8434 skill in that experiment.

Do not merge 6m into the HF core. Build a mechanism-aware program with separate
labels and gates for:

- sporadic E, including ionosonde foEs where licensing permits;
- auroral propagation;
- tropospheric enhancement from forecast/reanalysis weather fields;
- meteor scatter; and
- F2/trans-equatorial propagation.

Use a mechanism classifier or mixture of experts only after mechanism labels
and quiet-day controls exist. Require event-held-out and quiet-day evaluation,
geographic separation, calibration, and a future prospective window.

[GIRO/DIDBase](https://giro.uml.edu/didbase/RulesOfTheRoad.html) publishes CC
BY-NC-SA restrictions, account requirements, attribution expectations, and
data-provider responsibilities. Complete a documented compatibility and
permission review before using GIRO data in product training or redistribution.

## Workstream 7: open research release

After the applicable prospective, authorization, privacy, and beta gates pass:

- publish reproducible code, configs, manifests, model/data cards, checksums,
  training and evaluation reports, and stated hardware requirements;
- publish derived or redistributable data only under verified source terms;
- exclude user records, callsigns, exact home locations, private equipment,
  tokens, private Supabase objects, and non-redistributable source payloads;
- document negative results, incidents, selection effects, known slices, energy
  and infrastructure measurements, and nonprofit/donation context;
- tag the exact released model and research commit; and
- keep hosted product access, operations, and donations distinct from the
  scientific validity of the open model.

## Data source register

| Source | Role | Access and release posture |
|---|---|---|
| [WSPRnet archive](https://www.wsprnet.org/archive/) | Historical reception evidence | Preserve source terms and attribution; do not assume live-service rights |
| [WSPR.live](https://wspr.live/) | Current research shadow and possible outcomes | Written permission required for exact uses; no subscriber-facing claim yet |
| [NOAA SWPC JSON](https://services.swpc.noaa.gov/json/) | Current solar/geomagnetic observations | Archive availability, payload hash, parser version, and fallback state |
| [NOAA 45-day forecast](https://services.swpc.noaa.gov/json/45-day-forecast.json) | FutureCast issued input | Immutable issued payload; never substitute later observations |
| [NOAA three-day forecast](https://services.swpc.noaa.gov/text/3-day-solar-geomag-predictions.txt) | FutureCast issued input | Immutable issued payload; common legal issuance required |
| [PSK Reporter developer interface](https://www.pskreporter.info/pskdev.html) | First-party near-real-time reception evidence | Respect query limits and retention; record source freshness |
| [Reverse Beacon Network](https://reversebeacon.net/) | First-party CW/digital reception evidence | Validate terms, availability, and source bias before broader claims |
| [GFZ Kp](https://kp.gfz.de/en/data) and [Hp30/Hp60](https://kp.gfz.de/en/hp30-hp60/data) | Geomagnetic observations | Preserve provenance and revision status |
| [NASA OMNI](https://omniweb.gsfc.nasa.gov/html/ow_data.html) | Retrospective space-weather analysis | Diagnostic/ablation only unless availability-time contract is proven |
| [IGS products](https://www.igs.org/products/) | Optional TEC/ionosphere ablation | Separate bounded ablation; inspect latency and terms before operational use |
| [GIRO/DIDBase](https://giro.uml.edu/didbase/RulesOfTheRoad.html) | Optional foF2/foEs and 6m mechanisms | Account, attribution, share-alike, and non-commercial review required |
| [NOAA NOMADS](https://nomads.ncep.noaa.gov/) | 6m tropospheric weather fields | Preserve forecast cycle and availability time; use event/quiet controls |
| [ITU-R P.533](https://www.itu.int/rec/R-REC-P.533/en) and [official implementation](https://github.com/ITU-R-Study-Group-3/ITU-R-HF) | Trusted HF physics baseline/diagnostic | Version and checksum every implementation/configuration |
| [HamSCI Personal Space Weather Station](https://hamsci.org/projects/personal-space-weather-station) | Possible future first-party observations | Research before adoption; define ownership, privacy, and calibration |
| [NTIA HF models](https://its.ntia.gov/software/high-frequency/high-frequency-propagation-models/) | Additional physics benchmarks | Benchmark only under declared version and inputs |
| [Sherwood receiver table](http://www.sherweng.com/table.html) | Equipment catalog evidence | Catalog metadata only; preserve attribution and measurement limitations |

No new source enters frozen A6. IGS, GIRO, NWP, or other additions require a
separate preregistered ablation with availability-time, licensing, missingness,
and untouched evaluation controls.

## M5 compute and storage policy

- Run collectors, database work, training, scoring, and product QA on the M5
  Max. The M3 is source/Git transport only.
- Keep large ignored data, model, cache, and report artifacts on the external
  `Projects` SSD under `/Volumes/Projects/PropulseML` when mounted.
- Verify native ARM64 Python and libraries; do not train through Rosetta.
- Use Polars and DuckDB/Arrow/Parquet for streaming and analytical joins. Avoid
  pandas materialization of full corpora.
- Retain the proven bounded FutureCast profile: two concurrent fits with nine
  native threads each and 18 bounded scoring workers where the task is
  embarrassingly parallel.
- Use XGBoost external memory and Parquet row groups; do not load a multi-year
  corpus into unified memory at once.
- Keep database work time-bounded and partitioned; recombine aggregates rather
  than running one unbounded query.
- Benchmark changes with wall time, peak RSS, disk throughput, model load time,
  inference p50/p95, and energy where measurable.
- Current cloud inference starts at one worker, one XGBoost thread, 2 GiB RAM,
  and 1 vCPU. Scale replicas after observed queue/latency pressure; increasing
  model threads inside one request is not the first scaling move.
- A rented GPU is not justified for the current tree models. Reconsider only
  after a preregistered experiment shows the bottleneck is model class or data
  scale and a GPU-native candidate has a credible CPU-serving path.

## Ownership

### Agent can execute

- WSPR incident diagnosis, migrations, tests, receipts, and catch-up;
- collector validation and preflight receipts;
- product inspector and acceptance tooling;
- prospective freezes, scoring, reports, and open-source packaging;
- FutureCast acquisition supervision and later training; and
- 6m source/method research after its protocol is approved.

### Owner action required

- approve account invitation if no owner Auth user exists;
- send the immutable WSPR permission email and privately retain the response;
- schedule and approve the physical M5 outage window;
- conduct the private owner acceptance session; and
- recruit and consent alpha/beta operators when preflight passes.

## Milestones and dependencies

| Milestone | Earliest target | Blocking dependencies |
|---|---:|---|
| WSPR scheduler healthy | Immediate | RPC repair, exact-hour validation |
| First-party 24-hour gate | 24+ hours after last continuity reset | No further gaps; weather freshness gates |
| Owner production acceptance | After account access | Login plus Workstream 1 QA |
| WSPR 720-hour gate | 30 calendar days from defensible start | Fixed expected-hour window, at least 713 exact hours, source availability, authorization for intended use |
| Prospective freeze receipt | Before 2026-08-01 | Healthy collectors, immutable artifacts |
| NowCast outcome scoring | After 2026-09-30 | Unread locked window closed and hashed |
| Earliest FutureCast evidence | Approximately 2026-10-14 | Uninterrupted common issuances plus mature +24 outcome |
| Alpha/beta start | No calendar promise | Every preregistered preflight gate |
| Public research/model release | No calendar promise | Applicable prospective, legal, privacy, and claim gates |

## Risk register

| Risk | Control |
|---|---|
| WSPR source rights do not cover hosted use | Written scope-specific permission or authorized first-party source |
| Collector gaps invalidate time-based evidence | Immutable receipts, off-device monitoring, honest clock restart |
| Retention prune blocks ingestion | Bounded indexed batches, rollback-tested migration, alerts before capacity limit |
| Receiver-network and event-selection bias | exposure-aware labels, quiet controls, time/region/operator holdouts |
| Private equipment/location leakage | server-side derivation, coarse classes, RLS, aggregate-only reports |
| Prospective leakage | denied outcome reads, immutable hashes, single post-window score |
| Third-party revision/latency leakage | `issued_at`/`available_at`, payload hashes, source-specific fallbacks |
| Model drift | prospective slices, freshness/OOD states, baselines, no silent refit |
| Cloud cost or latency growth | provider meters, p95/SLO alerts, replica scaling from measured load |
| M5/external SSD outage | off-device monitor, controlled proof, storage health and recovery procedure |
| Attractive but invalid FutureCast output | horizon-by-horizon fail-closed release; synthetic output never shown as forecast |

## Definition of done

The propagation program is not complete merely because A6 is deployed. It is
complete for the current V4 objective only when:

1. A6 and deterministic StationCast have completed their locked prospective
   and consented evidence decisions;
2. every displayed forecast state has valid freshness, confidence, fallback,
   and provenance semantics;
3. at least one FutureCast horizon has independently passed, or the research
   honestly concludes that none should ship;
4. 6m has a separate defensible mechanism-aware decision, even if that decision
   is to withhold it;
5. authorization, privacy, continuity, outage, and operational cost evidence is
   complete;
6. the private product passes owner and beta acceptance; and
7. the open model/research package is reproducible, source-compliant, and free
   of private user or infrastructure data.

## Do not do

- Do not retrain or tune A6 from December 2024, the locked 2025 archive, owner
  acceptance, or unread 2026 outcomes.
- Do not move the prospective window after inspecting its outcomes.
- Do not treat UI integration, synthetic FutureCast proof, or a healthy service
  as scientific release evidence.
- Do not enable beta outcome flags before every protocol gate passes.
- Do not merge 6m into the HF model or present its event-selected result as
  general performance.
- Do not publish raw callsigns, exact locations, equipment records, credentials,
  private source replies, or restricted source data.
- Do not spend on a GPU until a measured, preregistered experiment justifies it.

## Resume instruction

On the M5:

```text
Read ml/PROPAGATION-FORWARD-EXECUTION-PLAN.md and the linked frozen protocols.
Resume Workstream 0. First repair and validate the WSPR prune/scheduler failure,
then rebuild the first-party 24-hour clock. Do not retrain A6, inspect the locked
prospective outcomes, enable beta collection, or release a FutureCast horizon.
Use the external Projects SSD for large ignored artifacts and native bounded M5
multicore execution for data/model work. Update this plan's status and evidence
links after each accepted gate.
```

The first implementation session ends only after the WSPR root cause is fixed
or documented as a precise blocker, three exact hours prove recovery, the
continuity decision is recorded, and the next owner-controlled action is clear.
