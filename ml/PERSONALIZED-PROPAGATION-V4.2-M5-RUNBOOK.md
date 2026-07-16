# Personalized Propagation V4.2: M5 Execution Runbook

> North star: [`PERSONALIZED-PROPAGATION-V4-PLAN.md`](PERSONALIZED-PROPAGATION-V4-PLAN.md)  
> Active method: [`PERSONALIZED-PROPAGATION-V4.2-PERFORMANCE-PLAN.md`](PERSONALIZED-PROPAGATION-V4.2-PERFORMANCE-PLAN.md)  
> Machine: Apple M5 Max, 128 GB unified memory, 18 CPU cores  
> Repository: `${HOME}/Projects/propulse`
> Large storage: `/Volumes/Projects/PropulseML`  
> Branch: `feat/archive-multimonth-v3`

## Non-negotiable execution boundaries

- Run all data preparation, model fitting, scoring, validation, and report
  generation on the M5.
- Use the M3 only for source editing and Git transport.
- Do not acquire or transform December 2024 until the candidate protocol state
  is `candidate_frozen`.
- Do not acquire or transform any 2025 outcome until every December gate is
  recorded as passed.
- Never fit, calibrate, select a threshold, or change a policy on December or
  2025 outcomes.
- Keep the separate 6m model outside the HF model and HF gate.
- Resume an opened outcome scope only with its original attempt ID.

## Access from the M3

```bash
export PROPULSE_M5_HOST="m5-hostname-or-address"
export PROPULSE_M5_USER="m5-user"
export PROPULSE_M5_KEY="${HOME}/.ssh/propulse-m5"
ssh -o BatchMode=yes -o IdentitiesOnly=yes \
  -i "${PROPULSE_M5_KEY}" \
  "${PROPULSE_M5_USER}@${PROPULSE_M5_HOST}"
cd "${HOME}/Projects/propulse"
```

Use `rsync` for selected source or artifact transfer. Do not encode files as
base64. On the M5, `node` is `${HOME}/.local/bin/node` in non-login SSH shells.

## Hardware contract

The source validates native `arm64`, at least 18 visible cores, an
OpenMP-enabled XGBoost build, AC power, High Power mode, and no explicit macOS
CPU or scheduler limit before M5 workflows run.

| Workload | Parallelism | Memory policy |
|---|---|---|
| Cohort and feature construction | DuckDB 18 threads | 80 GB DuckDB limit, Projects-volume spill |
| 20M training | 2 spawned fits × 9 XGBoost threads | external-memory `ExtMemQuantileDMatrix` |
| 50M training | 2 spawned fits × 9 XGBoost threads | iterator-fed in-memory `QuantileDMatrix` |
| Arrow per fit | 9 CPU threads, 4 I/O threads | 250,000-row iterator batches |
| Evaluation and gates | Benchmark-pinned XGBoost threads, Arrow 18/6 CPU/I/O | 100,000-row scoring batches |
| Serving validation | 1 XGBoost thread per API request | Manifest default; explicit deployment override only |

XGBoost has no Metal backend. The installed build is CPU/OpenMP and has no
CUDA. The 50M backend was selected by a training-only benchmark: `2.603276x`
faster end to end, `7.338326x` faster in the tree-fit stage, identical recorded
validation log loss, and a conservative two-worker projection of `72.8105`
GiB.

## Current status, 2026-07-15

Phases 0-5 are complete. The protocol state is `archive_passed`. The frozen
candidate is A6: 70% A4 recent-cycle plus 30% A5 recency-weighted probability.

| Evidence | Candidate | Frozen V3/B2 | Relative improvement | Decision |
|---|---:|---:|---:|---|
| October-November development | 0.04355603 | 0.04460622 | 2.354% | select A6 |
| Untouched December 2024 | 0.04344062 | 0.04434430 | 2.038% | 10/10 gates pass |
| Locked 2025 archive | 0.04096767 | 0.04186090 | 2.134% | 6/6 gates pass |

The archive evaluation streamed `208,372,533` rows in 29.8 minutes with 18
XGBoost prediction threads, 18 Arrow CPU threads, six Arrow I/O threads, and
`10.2913` GiB peak RSS. All four months and every supported HF band improved;
the paired-day upper 95% Brier delta was `-0.00079758`. No thermal or
performance warning was observed.

The comprehensive report and open-research handoff are under
`ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/final_report/`.
The remaining work is Phase 6 WSPR source authorization/connection, continuous
receipt-time shadow, opt-in, and prospective evidence. Trusted operational
weather and the source-independent finalization runner are implemented.
Frontend/service shadow execution and aggregate-only telemetry are implemented.
A local M5 deployment smoke passed with six one-thread Uvicorn workers, the real
A6 bundle, successful path HTTP/CORS, explicit physics fallback, and a persisted
identity-free event. Durable beta deployment and real opt-in receipts remain
open. The current product request must select the physics fallback until the
authorized WSPR pipeline passes its source and replay gates. Do not rerun
training, reopen outcome scopes, or tune the frozen policy from December or
2025.

For local M5 shadow validation, keep each model-serving process at the manifest
default of one XGBoost thread and use six Uvicorn workers. This is distinct from
offline scoring, which uses the benchmark-pinned 18-thread path:

```bash
export PROPULSE_INFERENCE_MODE=shadow
export PROPULSE_MODEL_BUNDLE="/path/to/approved/serving_manifest.json"
ml/.venv/bin/uvicorn app:app --app-dir ml/service \
  --host 127.0.0.1 --port 8000 --workers 6
```

Client-supplied path lags and freshness are never trusted. With no verified
server feature provider, health reports `path_history_provider=unavailable` and
every request selects physics. The provider requires the URL, server-only
service key, approved source identifier, and frozen transform version together;
do not configure them before authorization and replay gates pass.

The shared-transform extraction has exact single-hour and multi-hour open-data
evidence. Reproduce the single-hour diagnostic with:

```bash
ml/.venv/bin/python ml/src/archive_v4_2/validate_live_transform_parity.py \
  --bronze /path/to/open-october-bronze.parquet \
  --opportunities /path/to/open-october-hf-opportunities.parquet \
  --target-hour 2024-10-15T17:00:00Z --threads 18
```

Evidence is stored at
`ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/live_feature_pipeline/transform_parity.json`.
Do not substitute December or 2025 paths in this command.

The generic ingest and finalizer CLIs are `ml/service/wspr_ingest.py` and
`ml/service/wspr_finalizer.py`. They do not contain a provider connector. The
finalizer requires an explicit completed-source signal and an event-time
watermark at the end of the target hour, writes feature pages first, and commits
the version watermark last; incomplete or degraded hours cannot be returned by
the lookup RPC. Use all 18 DuckDB threads for M5 replay, but size production
threads to its CPU allocation.

Production invokes `ml/service/wspr_scheduler.py` with an authorized
connector's HMAC-authenticated completion manifest. The manifest checksum-links
the source checkpoint, requires all ten HF bands and an exact end-of-hour
watermark, and is safe to retry. The runner limits
`workers * threads_per_band` to visible CPUs, finalizes bands concurrently, and
prunes only after every band succeeds. Use `--workers 2 --threads-per-band 9`
on the M5; size both values to the production allocation elsewhere.

The disabled-by-default WSPR.live research candidate is
`ml/service/wspr_live_connector.py`. It uses one bounded streaming request per
completed hour and spools to `/Volumes/Projects/PropulseML`, so source volume
does not become Python heap. It may be exercised only with both
`PROPULSE_WSPR_LIVE_RESEARCH_ENABLED=true` and
`--acknowledge-research-only`; that is suitable for internal receipt-time
research under the published free-project terms, not subscriber-facing use.
Written confirmation or an independently permitted source remains the release
gate.

The real research dry-run passed all 8 gates for UTC hour
`2026-07-16T02:00:00Z`: one request streamed `287,694` rows across every HF band
in `23.1142` seconds at `57.625` MiB peak RSS, removed its transient spool, and
performed no target write. Aggregate evidence is
`live_feature_pipeline/wspr_live_connector_validation.json`. The send-ready
source request is [`WSPR-LIVE-PERMISSION-REQUEST.md`](WSPR-LIVE-PERMISSION-REQUEST.md).

For a deliberately enabled internal hour, store the HMAC secret in the M5 login
keychain under service `propulse-wspr-completion-v1`. Non-interactive runs can
instead use a `0600` secret under the configured runtime root's `secrets/`
directory. Then invoke
`ml/service/run_m5_wspr_research_hour.sh` with
`PROPULSE_WSPR_LIVE_RESEARCH_ENABLED=true`. The wrapper keeps secrets out of
arguments, maps the ignored service credentials, uses 5,000-row request pages,
and runs the two-by-nine-thread finalizer under `caffeinate`. Complete one manual
target hour and inspect aggregate counts/watermarks before creating any hourly
launchd schedule.

That manual gate is complete. The first attempt exposed a server-side 1,000-row
response cap and its ten watermarks were invalidated. Manifest v2 now carries
signed per-band counts, pagination continues until empty, and count mismatch
fails before feature or watermark publication. The corrected hour matched
`287,694` observations, wrote `75,055` feature cells, and passed `10/10` target
gates. `wspr_live_hour_validation.json` is the aggregate audit. Continuous
scheduling uses the receipt-driven monitoring/restart wrapper described below.

The scheduling implementation uses identity-free atomic run receipts as its
state. `run_m5_wspr_research_catchup.py` processes contiguous missing settled
hours in order, refuses more than 24 hours of automatic catch-up, locks against
overlap, and updates `live_wspr_health.json`. The launchd installer runs that
boundary at minute 15 and on load with an owner-only umask. Small launch logs
stay under `~/Library/Logs/Propulse`. Because LaunchAgents cannot open
removable-volume paths in this context, operational receipts, manifests, health,
locks, secret, and transient spools use
`~/Library/Application Support/PropulseML`; large ML datasets remain on the
Projects volume. Installation remains a deliberate research-only action:

```bash
ml/.venv/bin/python ml/service/install_m5_wspr_research_launchd.py \
  --install --acknowledge-research-only
```

The research-only job is active. Its first scheduled target hour,
`2026-07-16T03:00:00Z`, completed with `261,006` exact observations and `69,980`
feature cells across ten bands. The connector used `152.297` MiB peak RSS; two
finalizers used nine threads each, for 18 bounded native M5 threads. The
independent schedule audit passed `28/28` gates and is stored as
`wspr_research_schedule_validation.json`. Re-run it with the server-only target
environment and signing secret loaded out of process arguments:

```bash
ml/.venv/bin/python ml/src/archive_v4_2/validate_wspr_research_schedule.py
```

This starts the 30-day internal receipt-time shadow; it does not grant
subscriber-facing source authorization or complete the long-window gate.
The paired watchdog runs at minutes 0 and 30, applies the 7,200-second stale
boundary and 2 GiB runtime ceiling, and sends changed failure/recovery states to
the unified log and macOS Notification Center. The local notification delivery
smoke passed. Remote escalation and product System Health integration remain
pre-beta gates.

`summarize_wspr_research_shadow.py` rebuilds the identity-free progress rollup
from each receipt plus its signed completed manifest. It fixes the duration at
720 expected hours and the operational threshold at 99% completion, while also
tracking gaps, stale-boundary latency, ten-band coverage, exact M5 concurrency,
one-request ingest, RSS, and aggregate row/cell totals. The initial real state
is operationally healthy at `1/1` expected hours with zero gaps, but remains
`collecting` because `1/720` is not 30 days. The following minute-15 calendar
event then completed target `2026-07-16T04:00:00Z` without RunAtLoad or a manual
target: `255,536` observations, `67,829` feature cells, 161 MiB connector peak
RSS, the same bounded 18-thread finalizer, and clean transient removal. The
rollup is now `2/2` with zero gaps and remains `collecting` at `2/720`.

The pre-provider foundation validation passed all 14 gates against the real A6
bundle on native ARM64: path p95 `3.3914` ms, 288-cell surface p95 `10.5890` ms,
`1.1201` GiB peak RSS, identity-free telemetry, and forged browser freshness
blocked. Reproduce and package its interactive report only on the M5:

```bash
ml/.venv/bin/python ml/src/archive_v4_2/validate_live_feature_foundation.py \
  --bundle /path/to/approved/serving_manifest.json

ml/.venv/bin/python ml/src/archive_v4_2/generate_live_feature_report.py \
  --profile m5

${HOME}/.local/bin/node ml/src/archive_v4/package_report.mjs \
  --input ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/live_feature_pipeline/REPORT.artifact.json \
  --output ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/live_feature_pipeline/REPORT.html
```

The packaged report passed validation, packaging, source-dialog interaction,
and browser checks at 1,440 px and 390 px. This does not replace target-Postgres
migration validation or live-source replay. Foundation evidence records the
exact migration SHA-256 as well as the serving-manifest SHA-256.

The full replay uses one hour from every UTC hour of day in each open month,
synthetic receipt-time correction cases, and causal H-1/H-2/H-3/H-24 lookups:

```bash
ml/.venv/bin/python ml/src/archive_v4_2/replay_live_feature_pipeline.py \
  --profile m5 --threads 18
```

It passed 15/15 gates over 48 hours, 12,245,675 spots, 3,628,293 opportunity
cells, and 3,218,610 path-hour cells. October and November both covered all ten
HF bands with zero directional differences. The two 10,000-row-class receipt
cases proved duplicate rejection, late correction into a new version,
watermark-last publication, and rejection of future/too-late observations.
Those receipt times are synthetic because the archive lacks reliable receipt
metadata. Real receipt-time validation still requires the 30-day live shadow.

The target PostgreSQL migration can be exercised without persistence:

```bash
ml/.venv/bin/python ml/src/archive_v4_2/validate_live_feature_migration.py \
  --include-pending-prerequisites
```

The initial WSPR-only transaction passed 14/14 schema, RLS, role, lookup,
constraint, retention, and rollback gates on PostgreSQL 17.6. The current
validator always runs the five earlier pending migrations in timestamp order so
the exact release chain is checked before a normal deployment; the flag makes
that intent explicit in release logs. The validator derives the current
project identity from the untracked project URL, never records a connection
identifier, and always rolls back. A passing rollback test is not a deployment.

That reviewed chain was subsequently applied through the normal Supabase
migration ledger. Verify the deployed state with:

```bash
ml/.venv/bin/python ml/src/archive_v4_2/verify_live_feature_deployment.py
```

The target passed all 15 post-deployment gates: six ledger versions, tables,
RLS, intended grants, user policies, service-only functions, locked
`SECURITY DEFINER` search paths, collector availability backfill, solar
provenance columns, and exact four-lag RPC behavior. Smoke rows were rolled
back. The schema is deployed. A real provenance-rich NOAA capture and the
trusted service provider passed 14/14 A6 gates with 14 causal fields and 2.91 ms
cached path p95; browser weather forgery was replaced. The authorized WSPR
connector, signed runner activation/monitoring, and 30-day receipt-time shadow
are not active yet.

## Reproduce Phase 2 at 20M

After the parent exits successfully:

```bash
ml/.venv/bin/python ml/src/archive_v4_2/benchmark_prediction_threads.py \
  --profile m5

ml/.venv/bin/python ml/src/archive_v4_2/pin_prediction_threads.py

ml/.venv/bin/python ml/src/archive_v4_2/score_phase2_scale.py \
  --profile m5 --scale 20000000 --verify-input-hashes

ml/.venv/bin/python ml/src/archive_v4_2/validate_phase2_scale.py \
  --profile m5 --scale 20000000
```

The benchmark uses only the allowed July early-stopping feature matrix, requires
bit-identical predictions at 1/6/9/12/18 threads, then pins the fastest count and
artifact SHA-256 in the tracked config. Sync and commit the config plus benchmark
artifact before scoring. The scorer writes `evaluation_20m_results.json`; validation writes
`validation_20m.json`. If `selection.advance_to_50m` is empty, stop before
December and generate the 20M report. Otherwise, at most two component models
advance.

## Reproduce the 50M fit

```bash
ml/.venv/bin/python ml/src/archive_v4_2/build_phase2_cohorts.py \
  --profile m5 --scale 50000000

nohup caffeinate -dimsu ml/.venv/bin/python \
  ml/src/archive_v4_2/train_phase2_scale.py \
  --profile m5 --scale 50000000 --workers 2 \
  > ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/training_50m.log 2>&1 &

ml/.venv/bin/python ml/src/archive_v4_2/score_phase2_scale.py \
  --profile m5 --scale 50000000 --verify-input-hashes

ml/.venv/bin/python ml/src/archive_v4_2/validate_phase2_scale.py \
  --profile m5 --scale 50000000
```

Only the frozen final rolling fold is trained at 50M. Cohort construction
verifies exact 20M-within-50M nestedness. The scorer applies the preregistered
final selection rule and emits a conservative 100M decision. Do not run 100M
unless every coded gate passes and the Phase 2 report establishes an unresolved
rare-regime or variance reason; more rows alone are not a reason.

## Reproduce the Phase 2 report

```bash
ml/.venv/bin/python ml/src/archive_v4_2/generate_phase2_report.py --profile m5

${HOME}/.local/bin/node ml/src/archive_v4/package_report.mjs \
  --input ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/REPORT.artifact.json \
  --output ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/REPORT.html
```

The report must show the 5M→20M→50M curve, B2 deltas, both evaluation months,
paired uncertainty, band/distance safety, reliability, early-stopping
sensitivity, feature gain, cohort checksums, and both M5 backend/thread benchmarks. A
successful portable-builder receipt must report browser verification at 1,440
px and 390 px.

## Reproduce Phase 3 packaging and contract validation

Only continue when `evaluation_50m_results.json` has a non-null
`final_candidate_selection`:

```bash
ml/.venv/bin/python ml/src/archive_v4_2/package_phase3_candidate.py --profile m5
ml/.venv/bin/python ml/src/archive_v4_2/validate_phase3_candidate.py --profile m5
ml/.venv/bin/python ml/src/archive_v4_2/run_synthetic_gate_report.py
ml/.venv/bin/python ml/src/archive_v4_2/freeze_phase3_candidate.py --profile m5
```

The freeze requires:

- passing 50M validation;
- manifest-default one-thread serving validation with no ambient override;
- offline/service parity within `1e-12`;
- fresh NowCast and stale physics-fallback boundary checks at 7,200 seconds;
- missing freshness selects physics fallback and negative ages are rejected;
- explicit missingness and reduced fallback confidence;
- end-to-end API p95 below 50 ms for a path and 3,000 ms for 4,096 cells;
- peak validation RSS at or below 32 GiB and bundle at or below 256 MiB;
- public-manifest privacy scan;
- a real Phase 2 HTML report; and
- a passed synthetic browser report receipt.

Confirm before opening outcomes:

```bash
ml/.venv/bin/python - <<'PY'
import json
p = "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/outcome_protocol_manifest.json"
value = json.load(open(p))
print(value["protocol_state"], value["outcome_access"])
PY
```

Expected state: `candidate_frozen`; every outcome-access value must be `false`.

## Public source inventory

| Source | Role | URL |
|---|---|---|
| WSPRnet monthly archive | Immutable decode outcomes and exposure reconstruction | <https://www.wsprnet.org/archive/> |
| NASA SPDF OMNI2 | Definitive historical hourly solar-wind, F10.7, and geomagnetic inputs | <https://spdf.gsfc.nasa.gov/pub/data/omni/low_res_omni/> |
| OMNI documentation | Provenance, field definitions, and acknowledgement | <https://omniweb.gsfc.nasa.gov/html/ow_data.html> |
| GFZ Hp60 | Lagged high-cadence geomagnetic input, CC BY 4.0 | <https://kp.gfz.de/en/hp30-hp60/data> |
| NOAA SWPC JSON | Operational live-source parity after archive approval | <https://services.swpc.noaa.gov/json/> |
| ITU-R P.533 | Physics fallback/baseline reference | <https://www.itu.int/rec/R-REC-P.533> |

Raw third-party archives remain under ignored `ml/data/raw` storage. Source
manifests retain URL, retrieval time, byte count, SHA-256, role, and license or
acknowledgement note.

## Historical one-shot December commands

This scope is already complete. Do not run `open_outcome_scope.py` again. The
commands below document the frozen execution and are retained for audit only.

Opening the scope mutates the protocol before download. Preserve the printed
attempt ID.

```bash
ATTEMPT="december-$(date -u +%Y%m%dT%H%M%SZ)"
ml/.venv/bin/python ml/src/archive_v4_2/open_outcome_scope.py \
  --scope december --attempt-id "$ATTEMPT"

ml/.venv/bin/python ml/src/archive_v4_2/prepare_locked_gate.py \
  --scope december --attempt-id "$ATTEMPT" --profile m5

ml/.venv/bin/python ml/src/archive_v4_2/score_locked_gate.py \
  --scope december --attempt-id "$ATTEMPT" --profile m5 \
  --dataset 2024-12=ml/data/processed/archive_v4_2_december/dataset_propagation_v4_2_phase2_scale_december_gate_hf.parquet/part-000.parquet \
  --integrity-audit ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/december_integrity_audit.json

ml/.venv/bin/python ml/src/archive_v4_2/generate_gate_report.py \
  --result ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/december_gate_result.json \
  --output-dir ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/december_report \
  --profile m5

${HOME}/.local/bin/node ml/src/archive_v4/package_report.mjs \
  --input ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/december_report/REPORT.artifact.json \
  --output ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/december_report/REPORT.html
```

If any command fails after opening, correct the operational error and resume
with the same `$ATTEMPT`. Never call the opener again.

The December scorer requires all ten gates: integrity, at least 1% overall
relative Brier improvement and paired-day upper 95% below zero, at least 75%
qualified-day wins, no supported-week collapse above 2%, supported-band
regression at or below 2%, three short-path tolerances, calibration, fallback,
parity/privacy, and efficiency.

## Historical one-shot 2025 archive commands

This scope is already complete. Do not run `open_outcome_scope.py` again. The
commands below document the frozen execution and are retained for audit only.

Run this section only when the protocol state is `december_passed`.

```bash
ATTEMPT="archive-$(date -u +%Y%m%dT%H%M%SZ)"
ml/.venv/bin/python ml/src/archive_v4_2/open_outcome_scope.py \
  --scope archive --attempt-id "$ATTEMPT"

ml/.venv/bin/python ml/src/archive_v4_2/prepare_locked_gate.py \
  --scope archive --attempt-id "$ATTEMPT" --profile m5

ml/.venv/bin/python ml/src/archive_v4_2/score_locked_gate.py \
  --scope archive --attempt-id "$ATTEMPT" --profile m5 \
  --dataset 2025-01=ml/data/processed/archive_v4_2_archive/dataset_propagation_v4_2_phase2_scale_archive_gate_hf.parquet/part-000.parquet \
  --dataset 2025-04=ml/data/processed/archive_v4_2_archive/dataset_propagation_v4_2_phase2_scale_archive_gate_hf.parquet/part-001.parquet \
  --dataset 2025-07=ml/data/processed/archive_v4_2_archive/dataset_propagation_v4_2_phase2_scale_archive_gate_hf.parquet/part-002.parquet \
  --dataset 2025-10=ml/data/processed/archive_v4_2_archive/dataset_propagation_v4_2_phase2_scale_archive_gate_hf.parquet/part-003.parquet \
  --integrity-audit ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/archive_integrity_audit.json

ml/.venv/bin/python ml/src/archive_v4_2/generate_gate_report.py \
  --result ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/archive_gate_result.json \
  --output-dir ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/archive_report \
  --profile m5

${HOME}/.local/bin/node ml/src/archive_v4/package_report.mjs \
  --input ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/archive_report/REPORT.artifact.json \
  --output ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/archive_report/REPORT.html
```

The archive requires at least 1% aggregate improvement, paired-day upper 95%
below zero, point improvement in at least three of four months, no supported
band regression above 3%, calibration limits, and all operational contracts.
Publish every month and every failure.

## Product and prospective phase

Archive approval permits shadow integration, not an immediate prospective or
personalization claim. ReachMap consumes the identity-free core surface;
StationCast applies the existing private virtual-shack chain at inference. The
locked prospective window is 2026-08-01 through 2026-09-30, which is
future-dated as of this runbook. Keep the core in shadow mode until opt-in
alpha/beta evidence and the prospective protocol are complete.

Resume with:

1. deploy the frozen Phase 3 bundle behind the shadow feature mode;
2. record issue/valid/receipt time, model and feature versions, source
   watermarks, freshness, fallback reason, core probability, deterministic
   StationCast probability, and consent state;
3. preserve raw prospective events immutably without inspecting the frozen
   window or fitting from it;
4. run the preregistered evaluation once after 2026-09-30; and
5. keep FutureCast, learned StationCast residuals, and 6m disabled unless their
   separate evidence gates pass.

## Recovery checks

```bash
# Source/test contract on M5
ml/.venv/bin/python -m unittest discover -s ml/src/archive_v4_2/tests -p 'test_*.py'

# Repository/source synchronization on M3
git status --short
git log -1 --oneline
git ls-remote origin refs/heads/feat/archive-multimonth-v3

# M5 storage and memory
df -h /Volumes/Projects
vm_stat
```

Do not delete a partial outcome namespace after it opens. The download,
bronze, opportunity, feature, audit, training, and scoring stages are designed
to resume from immutable completed artifacts.
