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
`propulse-wspr-completion-v1`. Non-interactive SSH may instead use the
owner-readable-only Projects-volume file
`PropulseML/secrets/wspr_completion_secret`. The caller must still explicitly export
`PROPULSE_WSPR_LIVE_RESEARCH_ENABLED=true`. It uses 5,000-row bounded pages and
the native 2-by-9 finalizer profile. The corrected manual target hour has passed
ingest, finalization, count, watermark, cleanup, and fallback checks; keep the
hourly schedule disabled until monitoring and restart recovery are installed.

Serving manifests may declare a profile as a checksum-verified `single` model
or a `weighted_ensemble`. Ensemble components must use the same ordered feature
contract; weights must be non-negative and sum to one. Each component is scored
and calibrated independently before the frozen probability-space blend is
applied. The `/models` response exposes each profile kind.
