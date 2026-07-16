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
base64. On the M5, prepend
`$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin` in non-login SSH shells;
`node` is `${HOME}/.local/bin/node` and `gh` is `/opt/homebrew/bin/gh`. Git HTTPS
credentials and the GitHub CLI token are independent: verify both
`git ls-remote` and `gh auth status` before relying on M5-side GitHub API
automation.

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

## Current status, 2026-07-16

Phases 0-5 are complete. The protocol state is `archive_passed`. The frozen
candidate is A6: 70% A4 recent-cycle plus 30% A5 recency-weighted probability.

| Evidence | Candidate | Frozen V3/B2 | Relative improvement | Decision |
|---|---:|---:|---:|---|
| October-November development | 0.04355603 | 0.04460622 | 2.354% | select A6 |
| Untouched December 2024 | 0.04344062 | 0.04434430 | 2.038% | 10/10 gates pass |
| Locked 2025 archive | 0.04096767 | 0.04186090 | 2.134% | 6/6 gates pass |

The internal WSPR shadow is operationally healthy through target
`2026-07-16T14:00:00Z`: `12/12` expected hours, zero gaps, `2,867,582`
observations, and `796,382` feature cells. This is `12/720` duration evidence,
not a 30-day pass. The audited `11:00Z` finalizer used two workers with nine native
threads each and completed in 114.34 seconds after keyset pagination replaced
deep OFFSET scans.

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
identity-free event. Durable beta evidence and real opt-in receipts remain
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
smoke passed. Its signed aggregate heartbeat is now active through the
protected feature preview and dedicated private store; the end-to-end validator
passed 8/8 gates with the public reader returning 404. Remote alert delivery and
product System Health activation remain pre-beta gates. Their code and private
database boundary are now implemented: the HMAC ingest accepts only aggregate freshness/continuity
state, alert transitions enter a retryable outbox, browser database roles have
no access, and the System Health reader requires independent server and
frontend flags. Target PostgreSQL 17.6 passed 20/20 rollback gates and 21/21
deployed-state gates, including replay rejection, alert/recovery transitions,
identity-free columns, ledger presence, and rollback of smoke rows.

## FutureCast issuance archive

FutureCast needs real forecast vintages, not definitive observations relabeled
as forecasts. The dedicated M5 job reuses
`collector/src/collectors/forecast.ts`, stores the exact NOAA 45-day and
three-day payloads plus parsed values in the immutable forecast tables, and
writes small owner-only aggregate receipts under
`~/Library/Application Support/PropulseML/forecast_archive`. The launchd plist
contains only paths; the ignored `.env.local` must be a non-symlink `0600` file.

Build, test, and install on the M5:

```bash
npm --prefix collector run build
npx vitest run collector/src/collectors/forecast.test.ts
ml/.venv/bin/python -m unittest discover -s ml/src/archive_v4/tests \
  -p 'test_futurecast*.py'
ml/.venv/bin/python -m unittest discover -s ml/service \
  -p 'test_forecast_archive.py'

ml/.venv/bin/python ml/service/install_m5_forecast_archive_launchd.py \
  --install --acknowledge-noaa-archive
```

Inspect non-secret state:

```bash
launchctl print gui/$(id -u)/org.propulse.forecast-archive
cat "$HOME/Library/Application Support/PropulseML/forecast_archive/futurecast_readiness.json"
tail -n 50 "$HOME/Library/Logs/Propulse/forecast-archive.stdout.log"
tail -n 50 "$HOME/Library/Logs/Propulse/forecast-archive.stderr.log"
```

The first scheduled run on `2026-07-16` exited zero and persisted two payloads
and 144 values: 90 daily Ap/F10.7 values and 54 three-day solar/geomagnetic
values. Both products cover `+3/+6/+12/+24`; the readiness receipt reports one
legal common availability day, zero invalid captures, and
`issued_forecast_training_ready=false`. `futurecast_examples.py` rejects future
issuance and future availability. Do not train until the receipt reaches 90
consecutive common days. When it does, materialize outcome joins as bounded
month/day Parquet partitions with DuckDB or Polars lazy scans on the M5, then
fit separate direct-horizon models with the same bounded multicore XGBoost
policy used by V4.2. Do not recursively feed predictions into later horizons.

The independent 6m development candidates are not a substitute for FutureCast
or HF NowCast. Reproduce the current release decision with:

```bash
ml/.venv/bin/python ml/src/archive_v4/freeze_6m_release.py
```

The M5 decision is `withheld`: no 6m mechanism is product-servable. It verifies
and records six hashes for the auroral, F2/TEP, and tropospheric experimental
model/calibrator pairs; meteor scatter, sporadic E, and unknown remain
unsupported. Development event and quiet-slice skill is recorded but cannot
replace independent event catalogs, GIRO/NWP parity, or locked/prospective
tests. A future 6m version must produce a new decision rather than modifying
this evidence.

The production endpoint, independent ingest secret, and dedicated store are
configured at `https://propulse.cloud`. Keep both view flags unset until the
remaining outage and beta gates pass. An optional external webhook can use the server-only
`PROPULSE_RESEARCH_ALERT_WEBHOOK_URL` plus `generic`, `slack`, or `discord`
kind. Generic destinations also require the exact
`PROPULSE_RESEARCH_ALERT_WEBHOOK_ALLOWED_HOST`; only generic destinations may
use a bearer token. Delivery refuses redirects, uses an idempotency key for
generic receivers, stores sanitized errors, and stops retrying an event after
eight attempts. The independent off-M5 GitHub runner already proved an actual
stale-to-recovery issue lifecycle. Before activation, perform the stronger
controlled full-device shutdown proof while the off-M5 runner remains active.
Only afterward may
`PROPULSE_RESEARCH_HEALTH_VIEW_ENABLED` and
`VITE_PROPAGATION_RESEARCH_HEALTH_ENABLED` be enabled. These flags expose
coarse health only; they do not authorize a WSPR source or select NowCast.

The feature-branch Vercel deployment is protected. For preview-only remote
smoke tests, set its independent automation credential as
`PROPULSE_RESEARCH_HEALTH_BYPASS_SECRET` in the M5 owner-only environment. The
watchdog sends it through the documented `x-vercel-protection-bypass` header,
never as a query parameter, process argument, plist value, or report field.
Production does not require this value while its public domain remains outside
preview protection. See [Vercel Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

Use the dedicated `PROPULSE_RESEARCH_HEALTH_STORE_URL` and
`PROPULSE_RESEARCH_HEALTH_STORE_SERVICE_KEY` server variables if the private
health migration is deployed to a different Supabase project than the product
preview. They are all-or-nothing and take precedence over the general Supabase
pair, so a stale preview credential cannot redirect aggregate health into the
wrong project.

Validate the configured protected endpoint from the M5 without printing any
secret or station-level data:

```bash
ml/.venv/bin/python \
  ml/src/archive_v4_2/validate_research_health_endpoint.py --profile m5
```

The original endpoint evidence passes 8/8 signed-ingest, exact-store, empty-initial-outbox,
disabled-reader, preview-bypass, native-M5, locked-outcome, and identity-free
gates. Production incident evidence now separately exercises durable stale and
recovery delivery through the GitHub issue path; no optional webhook is
configured.

The twice-hourly watchdog detects worker failure while the M5 is running. It
cannot detect complete M5 power or network loss from inside that same machine.
The pre-beta monitor must therefore run outside the M5 and check the private
heartbeat at an interval materially below the 7,200-second stale boundary.
[Vercel Hobby cron](https://vercel.com/docs/cron-jobs/usage-and-pricing#hobby-scheduling-limits)
is not sufficient because it permits only daily schedules; use a Pro cron, an
external uptime monitor, or a scheduled GitHub workflow with an authenticated
private monitor endpoint.

The additive monitor migration passed 17/17 rollback gates and 18/18
deployed-state gates on PostgreSQL 17.6. It never changes the source
`reported_at`; one stale episode creates one `health_record_recent` alert, and
the next genuine M5 heartbeat creates recovery. Reproduce its M5-only database
proof with:

```bash
ml/.venv/bin/python \
  ml/src/archive_v4_2/validate_research_health_monitor_migration.py --profile m5
ml/service/run_m5_research_health_migration.sh --dry-run
ml/service/run_m5_research_health_migration.sh \
  --apply --acknowledge-private-migration
ml/.venv/bin/python \
  ml/src/archive_v4_2/validate_research_health_monitor_migration.py \
  --profile m5 --verify-deployed
```

The GitHub workflow requires encrypted repository values for its monitor
endpoint and independent bearer. Those values are configured as repository
secrets. The protected-preview fresh path passed from
a GitHub-hosted runner in
[run 29482048362](https://github.com/crypticpy/propulse/actions/runs/29482048362):
the response was identity-free, `evaluated=true`, 184 seconds fresh, unchanged,
and had zero failed or exhausted deliveries. The M5-generated
`research_health_external_monitor_validation.json` records the immutable run
and commit plus the disabled-reader and privacy gates. The temporary, path-
scoped feature-branch push trigger was then removed. Monitoring-only
[PR #8](https://github.com/crypticpy/propulse/pull/8) merged the workflow to the
default branch without the model or product changes, so the minutes 17 and 47
schedule is active.

Production [PR #11](https://github.com/crypticpy/propulse/pull/11) added bounded
body reads, timestamp-bound HMAC replay checks, monitor rate limiting before
authentication, terminal-dot SSRF normalization, and a leased atomic outbox.
Its database hardening passed 18/18 rollback gates and 19/19 deployed-state
gates on PostgreSQL 17.6. Reproduce both modes on the M5:

```bash
ml/.venv/bin/python \
  ml/src/archive_v4_2/validate_research_health_hardening_migration.py \
  --profile m5
ml/.venv/bin/python \
  ml/src/archive_v4_2/validate_research_health_hardening_migration.py \
  --profile m5 --verify-deployed
```

The real stale run
[`29494058601`](https://github.com/crypticpy/propulse/actions/runs/29494058601)
failed closed at a 10,227-second heartbeat and opened exactly one aggregate-only
[issue #10](https://github.com/crypticpy/propulse/issues/10). Genuine recovery
run [`29497729210`](https://github.com/crypticpy/propulse/actions/runs/29497729210)
observed 25 seconds, posted the exact recovery transition, and closed the same
issue. The nine-gate incident validator proves privacy and lifecycle integrity.
`gh` is installed at `/opt/homebrew/bin/gh`; noninteractive SSH shells must add
`/opt/homebrew/bin` to `PATH`. Git HTTPS keychain authentication and the `gh`
API token are separate, so verify `gh auth status` before collecting new issue
or workflow receipts and run `gh auth login -h github.com` if that API token is
stale:

```bash
ml/.venv/bin/python \
  ml/src/archive_v4_2/validate_research_health_incident_delivery.py \
  --profile m5 --evidence-dir /path/to/owner-only-gh-json
```

This stale episode came from missing publisher configuration, not a physical
shutdown. Do not record the literal full-M5-outage gate as passed until a
controlled shutdown is observed and recovered by the external workflow.

The private schema procedure is M5-only and password-safe:

```bash
ml/.venv/bin/python \
  ml/src/archive_v4_2/validate_research_health_migration.py --profile m5
ml/service/run_m5_research_health_migration.sh --dry-run
ml/service/run_m5_research_health_migration.sh \
  --apply --acknowledge-private-migration
ml/.venv/bin/python \
  ml/src/archive_v4_2/validate_research_health_migration.py \
  --profile m5 --verify-deployed
```

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
following scheduled targets through `2026-07-16T14:00:00Z` also completed under
the same bounded profile. The rollup is now `12/12` with zero gaps, `2,867,582`
aggregate observations, `796,382` feature cells, and remains `collecting` at
`12/720`. The `08:00Z` job also proved that the rebuilt native ARM64 environment
remains launchd-safe: it exited zero after the exact two-by-nine-thread run.
Deep OFFSET pages later returned target HTTP 500 responses; monotonic-id keyset
pagination plus the covering `(source, target_hour, band, id)` index removed
that database access pattern. The audited `11:00Z` finalizer completed in 114.34
seconds with the exact two-by-nine profile.

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
and browser checks at 1,440 px and 390 px with 53 blocks, 10 charts, 16 metrics,
and three evidence tables. This does not replace target-Postgres
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
research connector and signed runner are active internally. Written source
authorization, the 30-day receipt-time shadow, remote alert delivery, and
subscriber-facing release remain open.

### Preregistered beta and retention boundary

The frozen operator experiment is defined in
[`PERSONALIZED-PROPAGATION-V4.2-BETA-PROTOCOL.md`](PERSONALIZED-PROPAGATION-V4.2-BETA-PROTOCOL.md).
Its primary endpoint is WSPR reception so the beta does not relabel the core's
single-decode estimand as a generic QSO probability. Contact outcomes and
non-WSPR modes remain separately reported secondary evidence. Capability
classes are nullable unless the operator independently permits derived
equipment training; the signed server support decision is retained only to
exclude unsupported chains.

On the M5, validate the additive database boundary without persistence and
then verify its deployed state:

```bash
cd ml/src/archive_v4_2
../../.venv/bin/python validate_propagation_beta_protocol_migration.py \
  --profile m5
../../.venv/bin/python validate_propagation_beta_protocol_migration.py \
  --profile m5 --verify-deployed
```

The rollback pass completed 22/22 gates and restored the original PostgreSQL
17.6 state. The deployed pass completed 23/23 gates, including the exact
ledger entry, nullable consent-gated classes, strict enums, hardened
service-role functions, atomic purpose removal/withdrawal deletion, bounded
retention pruning, and k-anonymous WSPR-reception monitoring. Neither check
read locked outcomes. Production Vercel holds an independent sensitive
`CRON_SECRET`; `/api/propagation/research-retention` runs daily at 05:17 UTC and
returns deletion counts only. Both outcome flags remain false until every
protocol preflight gate passes.

The separate aggregate-only API telemetry boundary is also deployed. Its base
migration was preserved after application; the forward UTC correction passed
21/21 rollback gates, and the exact two-entry deployed chain passed 22/22 live
gates. It stores hourly counters only, rejects undeclared dimensions, revokes
browser DML, and exposes hardened service-role RPCs. A separate
`America/Chicago` session proof passed 11/11 rollback and 12/12 deployed gates.
Revalidate it with:

```bash
ml/service/run_m5_beta_telemetry_migration.sh --dry-run
ml/.venv/bin/python \
  ml/src/archive_v4_2/validate_stationcast_beta_telemetry_migration.py \
  --profile m5 --verify-deployed
ml/.venv/bin/python \
  ml/src/archive_v4_2/validate_stationcast_beta_telemetry_utc_migration.py \
  --profile m5 --verify-deployed
```

Do not interpret an unused counter as an observed zero. Before enabling beta,
rerun the real-target producer validator below and require all counters to
increment exactly once under its isolated test protocol, followed by zero rows
after cleanup.

Freeze and exercise the private exporter and scorer on the M5 before any real
outcome flag is enabled:

```bash
cd /Users/crypticpy/Projects/propulse
export POLARS_MAX_THREADS=18
PRIVATE=/Volumes/Projects/PropulseML/private/stationcast_beta
umask 077
mkdir -p "$PRIVATE"
openssl rand -out "$PRIVATE/participant-key.secret" 32
openssl rand -out "$PRIVATE/api-telemetry.secret" 32
openssl rand -out "$PRIVATE/stop-monitor.secret" 32

ml/.venv/bin/python ml/src/archive_v4_2/run_synthetic_stationcast_beta.py \
  --profile m5
```

For a real preregistered window, export an unsigned aggregate-only receipt from
the deployed counter boundary. It must match
`ml/config/propagation_v4_2_beta_api_telemetry.schema.json`. Sign and audit it,
then export and score the private cohort:

```bash
export PROPULSE_STATIONCAST_BETA_MONITOR_ENABLED=true
export PROPULSE_BETA_TELEMETRY_STORE_URL="$VITE_SUPABASE_URL"
export PROPULSE_BETA_TELEMETRY_STORE_SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
ml/.venv/bin/python ml/service/stationcast_beta_stop_monitor.py \
  --window-end 2026-09-28T00:00:00Z \
  --state "$PRIVATE/stop-monitor-state.json" \
  --output "$PRIVATE/stop-monitor-signed.json" \
  --receipt-secret "$PRIVATE/stop-monitor.secret" \
  --commit --acknowledge-beta-safety-monitor

ml/.venv/bin/python ml/src/archive_v4_2/generate_stationcast_beta_api_telemetry.py \
  --profile m5 --window-start 2026-08-01T00:00:00Z \
  --window-end 2026-10-01T00:00:00Z \
  --output "$PRIVATE/api-telemetry-unsigned.json"

ml/.venv/bin/python ml/src/archive_v4_2/sign_stationcast_beta_api_telemetry.py \
  --profile m5 \
  --input "$PRIVATE/api-telemetry-unsigned.json" \
  --secret "$PRIVATE/api-telemetry.secret" \
  --output "$PRIVATE/api-telemetry-signed.json"

ml/.venv/bin/python ml/src/archive_v4_2/generate_stationcast_beta_operations_receipt.py \
  --profile m5 --window-start 2026-08-01T00:00:00Z \
  --window-end 2026-10-01T00:00:00Z \
  --api-telemetry-receipt "$PRIVATE/api-telemetry-signed.json" \
  --api-telemetry-secret "$PRIVATE/api-telemetry.secret" \
  --stop-monitor-receipt "$PRIVATE/stop-monitor-signed.json" \
  --stop-monitor-secret "$PRIVATE/stop-monitor.secret"

ml/.venv/bin/python ml/src/archive_v4_2/export_stationcast_beta_private.py \
  --profile m5 --window-start 2026-08-01T00:00:00Z \
  --window-end 2026-10-01T00:00:00Z \
  --policy-version propagation-research-v1-2026-07-12 \
  --participant-key-secret "$PRIVATE/participant-key.secret"

ml/.venv/bin/python ml/src/archive_v4_2/score_stationcast_beta.py \
  --profile m5 \
  --input "$PRIVATE/stationcast_beta_20260801_20261001.parquet" \
  --export-receipt "$PRIVATE/stationcast_beta_20260801_20261001.receipt.json" \
  --operations-receipt \
    ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/live_feature_pipeline/stationcast_beta_operations_receipt.json \
  --stop-monitor-receipt "$PRIVATE/stop-monitor-signed.json" \
  --require-release
```

The private Parquet, HMAC secrets, signed telemetry, signed monitor receipt,
monitor state, and private export receipt remain on the Projects volume and are
never committed. The aggregate scorer decision may be committed only after the
privacy/reportability gates pass. The scorer requires matching config, monitor,
export, Parquet, and operations SHA-256 values; identical export/operations
windows; a monitor read less than seven days old; an exact export row count; and
every observed timestamp inside that half-open window. It counts distinct
observed UTC dates, not an elapsed span. Raw 32-byte HMAC secrets are read
byte-for-byte, so do not convert them to text or append a newline.
Real operations accept only the original HMAC-signed weekly `continue` receipt.
A repeated window reuses that receipt only when its config, evidence digest, and
window still match; `stop`, `already_evaluated`, changed, or missing receipts
fail closed.

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
| NOAA 45-day Ap/F10.7 forecast | Immutable FutureCast exogenous vintages | <https://services.swpc.noaa.gov/json/45-day-forecast.json> |
| NOAA three-day solar/geomagnetic forecast | Three-hour K and daily Ap/F10.7 vintages | <https://services.swpc.noaa.gov/text/3-day-solar-geomag-predictions.txt> |
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

### First-party prospective capture

The M5 runs a separate always-on collector for PSK Reporter, RBN, DX Cluster,
and current NOAA/Kyoto solar/geomagnetic measurements. Network fetches run
concurrently; the CPU-heavy band/path reductions run as PostgreSQL set
operations rather than materializing raw hours in Node.
Both reductions wait 20 minutes after the hour and publish durable watermarks
only after the aggregate RPC returns. The owner-only watchdog runs at minutes
2, 17, 32, and 47 and never writes callsigns, grids, equipment, or user data.

Build, migration, and installation commands are M5-only:

```bash
export PATH="${HOME}/.local/bin:/opt/homebrew/bin:${PATH}"
npm --prefix collector run typecheck
npx vitest run collector/src/aggregator/hourly.test.ts \
  collector/src/collectors/rbn.test.ts
npm --prefix collector run build

ml/service/run_m5_prospective_collector_migration.sh --dry-run
ml/service/run_m5_prospective_collector_migration.sh \
  --apply --acknowledge-collector-migration
ml/.venv/bin/python ml/service/install_m5_prospective_collector_launchd.py \
  --install --acknowledge-public-upstream-capture
```

Inspect only aggregate operational state:

```bash
launchctl print gui/$(id -u)/org.propulse.prospective-collector
launchctl print gui/$(id -u)/org.propulse.prospective-collector-health
cat "$HOME/Library/Application Support/PropulseML/prospective_capture/prospective_capture_readiness.json"
tail -n 50 "$HOME/Library/Logs/Propulse/prospective-collector.stderr.log"
```

The first cycle on `2026-07-16T10:30Z` completed PSK Reporter, RBN, and DX
Cluster concurrently with `2,554`, `15,115`, and `133` attempted rows,
respectively, in under four seconds wall time and no stderr. The startup 09:00
UTC band/path watermarks are causal but contain zero rows because collection
started later; zero-row startup watermarks therefore did not begin the evidence
clock. The first nonempty settled hour wrote ten band rows and 2,246 path rows;
the latest preserved receipt remains `warming` at `4.21/24` gap-free hours
across 20 healthy receipts.
Later HamQTH timeouts opened one DX Cluster outage at `10:37Z` and one
RBN outage at `10:38Z`; successful polls closed both at `10:47Z`, before the
30-minute source-freshness budget expired. No outage record was deleted. The
five-minute weather poll separately validates upstream observation times
against A6's freshness contract. Required Kp, magnetic-field, solar-wind, and
Dst sources gate readiness. Proton flux keeps its 15-minute causal limit but is
an optional model field, so normal NOAA publication lag marks that feature
missing rather than disabling the complete weather input. The first nonempty
settled hour and every subsequent 15-minute receipt must remain continuous for
a full day.

Validate all non-participation StationCast stop producers against the real
aggregate target without retaining test rows:

```bash
ml/.venv/bin/python \
  ml/src/archive_v4_2/validate_stationcast_beta_stop_producers.py \
  --profile m5
```

The validator uses an isolated 2099 protocol, drives model-service station-math,
unsupported-support, and privacy failures, drives the aggregate weekly
high-confidence and same-cell two-read geographic monitors, asserts the five
exact target counters, and deletes the test protocol rows in a `finally`
boundary. The proof passes nine independent gates, leaves every unrelated
counter at zero, and re-queries every test counter as zero after cleanup. It
never reads operator outcomes or enables either beta flag.

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
