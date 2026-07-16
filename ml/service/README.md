# Propagation Inference Service

The service exposes the V4.2 path/surface contract without accepting a raw
shack snapshot. Set `PROPULSE_MODEL_BUNDLE` to an approved serving manifest and
choose an explicit execution mode, then run:

```bash
export PROPULSE_INFERENCE_MODE=shadow
ml/.venv/bin/uvicorn app:app --app-dir ml/service \
  --host 127.0.0.1 --port 8000 --workers 6
```

Modes are `disabled`, `shadow`, and `active`. Shadow mode scores real requests
and emits operational evidence without exposing model output in the product.
An invalid value fails service startup. The M5 local profile uses six service
processes with one XGBoost prediction thread each. This preserves concurrent
request throughput without oversubscribing the 18-core CPU; increase either
value only after a representative load test. Batch research and archive
scoring use the separately benchmarked 18-thread M5 profile.

Browser access defaults to `http://localhost:5173` and
`http://127.0.0.1:5173`. Set `PROPULSE_ALLOWED_ORIGINS` to a comma-separated
deployment allowlist; wildcard origins are intentionally unsupported.

The serving manifest defaults XGBoost to one prediction thread per request so
concurrent API requests do not inherit the M5 training worker's thread count.
Set `PROPULSE_XGBOOST_THREADS` only when the deployment CPU allocation and load
test justify a different value. `/health` and `/models` expose the effective
count and whether it came from the manifest or environment.

When shadow or active mode is selected, each successful inference emits a
`propagation-shadow-v1` aggregate telemetry event. It records request kind,
issue/valid/receipt times, band/mode, cell count, model/feature versions,
the core and station-adapter contracts, profile and OOD counts, allowlisted
path-history/space-weather ages, probability/confidence summaries, and latency.
It never records grid locators, coordinates, callsigns, user IDs, station
fingerprints, or raw equipment fields. Telemetry failure does not fail a
prediction. The default sink writes structured JSON to the service logger;
production storage must retain the same allowlisted schema.

Endpoints are `/v1/propagation/path`, `/surface`, `/models`, and `/health`.
When recent path history is older than two hours, inference selects the physics
profile and returns an explicit stale-data OOD flag. Missing freshness is stale,
and negative ages are rejected. If no approved model is
loaded, prediction endpoints return `503`; the service never fabricates spots
or probabilities.

The current product feature request intentionally marks path history stale.
Therefore shadow requests select the packaged physics profile until an
authorized/self-operated WSPR source, exposure-aware hourly transform, replay
parity, and live receipt-time gate satisfy
[`NOWCAST-LIVE-FEATURE-PIPELINE.md`](../NOWCAST-LIVE-FEATURE-PIPELINE.md).
PSK Reporter, RBN, and DX Cluster activity must not be relabeled as V4.2 WSPR
history to make the NowCast profile appear live.

Recent path history is server-authoritative. The service always removes the
browser's `path_success_prev*`, `path_prev*_available`, and `path_history`
freshness claims, then replaces them from the service-role-only feature store.
No configured provider, a lookup outage, incomplete target coverage, a future
timestamp, a transform/provider mismatch, or any quality flag fails closed to
the physics profile. A browser cannot select NowCast by submitting a small
freshness age.

Operational weather is server-authoritative too. The service removes every
browser-provided weather value, weather missingness flag, derived weather
window, and `space_weather` freshness claim. It rebuilds the supported vector
from provenance-rich `solar_snapshots`, requiring both source observation and
collector receipt time to be causal. Kp, magnetic field, solar wind, proton
flux, Dst, F10.7, sunspots, and the Kp/Bz/Dst windows each retain their frozen
source-specific age rules. Missing or future data remains missing instead of
falling back to the browser.

Configure the trusted weather path independently of WSPR source authorization:

```bash
export PROPULSE_WEATHER_STORE_URL="https://project.supabase.co"
export PROPULSE_WEATHER_STORE_SERVICE_KEY="server-only-service-role-key"
export PROPULSE_WEATHER_CACHE_SECONDS=60
```

The service key must never use a `VITE_` prefix. The cache is bounded to five
minutes and keyed by issue minute; current production validation uses 60
seconds. Health and aggregate shadow telemetry report the provider name and
server-derived weather age without exposing feature values.

Enable the provider only after its source is approved and the migration has
been deployed. These variables are all-or-nothing; partial configuration fails
startup:

```bash
export PROPULSE_FEATURE_STORE_URL="https://project.supabase.co"
export PROPULSE_FEATURE_STORE_SERVICE_KEY="server-only-service-role-key"
export PROPULSE_WSPR_PROVIDER="approved-provider-id"
export PROPULSE_PATH_TRANSFORM_VERSION="wspr-opportunity-duckdb-v1"
```

The service key must never use a `VITE_` prefix or enter client configuration.
The RPC accepts 1-4,096 target grids in one call and returns nothing unless the
H-1, H-2, H-3, and H-24 band watermarks were all complete, transform-matched,
quality-clean, and available by issue time.

After an authorized connector emits a completed-hour manifest, run
`wspr_scheduler.py` rather than invoking bands independently. The manifest is
HMAC-authenticated, checksum-links the connector checkpoint, confirms an exact
end-of-hour source watermark, and must name all ten HF bands. The scheduler
uses bounded `workers * threads_per_band` concurrency, refuses CPU
oversubscription, commits each band through the watermark-last finalizer, and
calls retention pruning only after every band succeeds:

```bash
export PROPULSE_WSPR_COMPLETION_SECRET="server-only-random-secret"
ml/.venv/bin/python ml/service/wspr_scheduler.py \
  --completion-manifest /private/path/completed-hour.json \
  --workers 2 --threads-per-band 9
```

The `2 x 9` example is the M5 profile. Production must size the product to its
allocated CPU count. An external scheduler may retry the same signed manifest;
feature and watermark keys are idempotent, and the local lock prevents
overlapping runs in one instance.

Completion manifest v2 includes a signed observation count for each band as
well as the total. The PostgREST reader continues until an empty page because a
server may cap a requested page below `page_size`; a short page is not evidence
of completion. Each finalizer compares its fully paginated count to the signed
band count before writing any feature or watermark. The scheduler repeats the
cross-band check before pruning.

For internal research shadow only, `wspr_live_connector.py` implements the
public WSPR.live candidate without loading an hour into memory. It makes one
exact-hour query across the ten HF bands, applies the archive's grid/call/power/
SNR filters at the source, streams canonical JSONL to a private spool, ingests
idempotently by WSPR spot ID, and writes the scheduler manifest only after the
complete HTTP response and private-store writes succeed. Use the fast Projects
volume for the transient spool on the M5:

```bash
export PROPULSE_WSPR_LIVE_RESEARCH_ENABLED=true
ml/.venv/bin/python ml/service/wspr_live_connector.py \
  --acknowledge-research-only \
  --spool-dir /Volumes/Projects/PropulseML/live_wspr_spool \
  --manifest-output /Volumes/Projects/PropulseML/live_wspr_manifests/hour.json
```

The connector defaults to the latest hour with a ten-minute settlement delay,
uses one source request per run, rejects partial/malformed/empty responses, and
never emits callsigns or locators in its result. The explicit environment flag
and CLI acknowledgement do not grant subscriber-facing permission. Keep this
path internal until the source operator confirms the nonprofit,
donation-supported, derivative-model use in writing.

On the M5, `run_m5_wspr_research_hour.sh` joins the connector and signed runner
without exposing server credentials or the HMAC secret in process arguments.
It loads the ignored `.env.local`, maps the server-only feature-store variables,
and reads the signing secret from the login keychain service
`propulse-wspr-completion-v1`. Non-interactive runs may instead use the
owner-readable-only `secrets/wspr_completion_secret` file beneath the configured
runtime root.

The caller must still explicitly export
`PROPULSE_WSPR_LIVE_RESEARCH_ENABLED=true`. It uses 5,000-row bounded pages and
the native 2-by-9 finalizer profile. The corrected manual target hour has passed
ingest, finalization, count, watermark, cleanup, and fallback checks. The
receipt-based monitoring and restart boundary is now installed on the M5 for
internal research only.

`run_m5_wspr_research_catchup.py` is that recovery boundary. It reads only
identity-free completed receipts, starts with the latest settled hour when no
state exists, processes contiguous missing hours in order, refuses gaps above
24 hours, uses a nonblocking process lock, and writes
`live_wspr_health.json` with freshness, consecutive failures, and continuous
completed hours. Each successful hour has an atomic aggregate receipt and a
checksum-linked completed manifest in the configured runtime root; raw identities do
not enter the receipt.

After manual validation, install the research-only launchd job with
`install_m5_wspr_research_launchd.py --install --acknowledge-research-only`.
It runs at minute 15 and on load, uses the native M5 Python environment, sets an
owner-only umask, writes small launch logs to `~/Library/Logs/Propulse`, and
deliberately does not contain credentials or the signing secret. Receipts,
health, manifests, and transient source artifacts use
`~/Library/Application Support/PropulseML`, because macOS blocks LaunchAgents
from opening removable-volume paths. Large ML datasets remain on Projects and
raw rolling rows remain in the private target store. Use the same command with
`--uninstall` to stop and remove it. The first scheduled receipt, for
`2026-07-16T03:00:00Z`, independently matched `261,006` target observations and
`69,980` feature cells across all ten bands, with zero health failures. Audit
the latest receipt, target counts, health record, plist, and thread bound with
`validate_wspr_research_schedule.py`; the generated evidence contains no station
identity or secret material.

The next minute-15 calendar event (not RunAtLoad) advanced the schedule to two
continuous receipts. Target `2026-07-16T04:00:00Z` matched `255,536`
observations and `67,829` feature cells, used 161 MiB connector peak RSS and the
same bounded 18-thread finalizer profile, and exited cleanly with no transient
spool or run directory.

The following scheduled targets through `2026-07-16T06:00:00Z` completed under
the same bounded profile. The aggregate rollup is now `4/4` expected hours with
zero gaps, `1,022,042` observations, and `275,834` feature cells.

`check_m5_wspr_research_health.py` is installed as a second LaunchAgent at
minutes 0 and 30. It evaluates the preregistered 7,200-second freshness limit,
latest settled-hour completion, receipt continuity, UTC alignment, worker
state, failures, health age, and a 2 GiB transient-runtime ceiling. Changed
failure and recovery states go to the unified log and macOS Notification
Center. Its local notification smoke and expanded schedule audit pass.

The remote path is active only on the protected feature preview. The watchdog
reads `PROPULSE_RESEARCH_HEALTH_ENDPOINT` and a 32+ character
`PROPULSE_RESEARCH_HEALTH_INGEST_SECRET` from the existing owner-only
`.env.local`; it signs an aggregate heartbeat and refuses redirects. A
protected Vercel preview may also set the owner-only
`PROPULSE_RESEARCH_HEALTH_BYPASS_SECRET`, which is sent only in Vercel's
documented automation-bypass header. The bypass is independent of the HMAC
secret and is never placed in the endpoint URL. The
server endpoint accepts only a strict identity-free schema, writes a private
service-role singleton, and places alert/recovery transitions in a retryable
outbox. It never receives station, path, row-count, equipment, or credential
fields. The migration passed 20 rollback gates and 21 deployed-state gates on
PostgreSQL 17.6, with every smoke row rolled back.

`validate_research_health_endpoint.py --profile m5` passed 8/8 end-to-end
gates: signed ingest, exact private singleton state, no initial healthy outbox
event, disabled coarse reader, protected-preview bypass, native ARM64 runtime,
locked outcomes unread, and identity-free evidence. The alert destination and
both product-view flags remain unset.

When the health tables live outside the application's general Supabase project,
configure both `PROPULSE_RESEARCH_HEALTH_STORE_URL` and
`PROPULSE_RESEARCH_HEALTH_STORE_SERVICE_KEY` on the server. Partial dedicated
configuration fails closed and never mixes a dedicated URL with a general
service key. The endpoint falls back to `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` only when neither dedicated value is present.

`SystemHealthPage` reads the coarse endpoint only when both
`PROPULSE_RESEARCH_HEALTH_VIEW_ENABLED=true` on the server and
`VITE_PROPAGATION_RESEARCH_HEALTH_ENABLED=true` at frontend build time. Both
remain false. To activate after alert delivery is proven, configure a Slack,
Discord, or generic HTTPS destination with
`PROPULSE_RESEARCH_ALERT_WEBHOOK_URL` and the matching
`PROPULSE_RESEARCH_ALERT_WEBHOOK_KIND`. A generic receiver must also set its
exact `PROPULSE_RESEARCH_ALERT_WEBHOOK_ALLOWED_HOST`; a bearer token is valid
only for that generic mode. Delivery refuses redirects, sends a generic
idempotency key, sanitizes stored errors, and caps each event at eight attempts.
Use the proven independent off-M5 runner to smoke both an actual stale alert and
genuine-heartbeat recovery, then enable the two view flags. This health path
does not enable inference or source permission.

The M5 watchdog cannot report total loss of its own power or network. The
pre-beta design therefore requires an independent monitor to check the private
heartbeat comfortably inside the 7,200-second stale limit. A once-daily
[Vercel Hobby cron](https://vercel.com/docs/cron-jobs/usage-and-pricing#hobby-scheduling-limits)
is too slow; use Vercel Pro cron, an external uptime monitor, or an
authenticated scheduled GitHub workflow.

The additive `monitor_propagation_research_health` migration passed 17 rollback
and 18 deployed-state gates on PostgreSQL 17.6. It preserves the last source
heartbeat timestamp, emits one stale transition, suppresses repeated checks,
does nothing to fresh or missing state, and lets the next genuine heartbeat
emit recovery. `research-health-monitor.yml` calls the bearer-protected API at
minutes 17 and 47 once the workflow is present on the default branch. GitHub
Actions run `29480631813` passed the protected-preview fresh path with a
490-second-old identity-free heartbeat, no transition, and zero failed or
exhausted deliveries. Its temporary feature-branch push trigger is removed.
The remaining alerting gate is a real destination plus stale alert/recovery and
full-M5-outage delivery smoke.

Rollback-validate, deploy, and verify the private migration only on the M5:

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

The watchdog also regenerates `live_wspr_shadow_progress.json` from every
identity-free receipt and its HMAC-verified completed manifest. The rollup fixes
the denominator at 720 expected hours, requires at least 99% scheduled
completion, checks every completed hour against the 7,200-second boundary, and
tracks gaps, band coverage, one-request ingest, exact M5 concurrency, latency,
RSS, source rows, and feature cells. It reports `collecting` until the full
30-day duration exists even when every current operational gate passes. The
current rollup is `4/4` expected hours, 100% completion, zero gaps, and `4/720`
required hours through `2026-07-16T06:00:00Z`.

Serving manifests may declare a profile as a checksum-verified `single` model
or a `weighted_ensemble`. Ensemble components must use the same ordered feature
contract; weights must be non-negative and sum to one. Each component is scored
and calibrated independently before the frozen probability-space blend is
applied. The `/models` response exposes each profile kind.
