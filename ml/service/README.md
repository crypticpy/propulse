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

## Private cloud runtime

Package and promote A6 only from the M5. The package command reads the promoted
manifest and checksum-verifies every referenced model and calibrator before it
creates an immutable archive on the Projects SSD:

```bash
ml/.venv/bin/python ml/src/archive_v4_2/package_cloud_bundle.py
```

The tracked `cloud_bundle_package_receipt.json` is the source of truth for the
private bucket, object key, byte length, outer SHA-256, member hashes,
compression settings, and M5 provenance. The archive itself remains untracked.
After explicit approval for the external write, upload it with:

```bash
ml/.venv/bin/python ml/src/archive_v4_2/upload_cloud_bundle.py
```

The uploader creates or verifies a private, size-bounded `propagation-models`
bucket, streams the binary archive as ordered objects below the provider's
per-object limit using resumable TUS chunks, then downloads and hashes the
reassembled private archive before writing an immutable upload receipt. Objects
use deterministic `.part-000` suffixes and carry individual byte counts and
SHA-256 values. Railway concatenates them into one temporary archive and verifies
the original outer SHA-256 before extraction; every manifest member checksum
remains independently enforced. The uploader does not transport the archive
through SSH or encode it as base64.

The production Docker image contains only inference modules, the two runtime
activation documents, and the station/calibration adapters. It runs as a
non-root user and downloads the bundle to temporary storage at startup. The
entrypoint verifies the archive SHA-256, rejects unsafe tar members, verifies
every bundle member, and atomically activates the model only after all checks
pass. Build it on the M5 with:

```bash
docker build -f ml/service/Dockerfile -t propulse-inference .
```

Railway uses `railway.json` and requires these server-only variables:

```text
PROPULSE_MODEL_BUNDLE_URL=https://PROJECT.supabase.co/storage/v1/object/authenticated/propagation-models/a6/SHA256.tar.zst
PROPULSE_MODEL_BUNDLE_SHA256=SHA256
PROPULSE_MODEL_BUNDLE_PART_COUNT=2
PROPULSE_MODEL_BUNDLE_AUTH_TOKEN=server-only-storage-token
PROPULSE_SERVICE_TOKEN=shared-random-secret-at-least-32-characters
PROPULSE_ALLOWED_ORIGINS=https://APP_ORIGIN
PROPULSE_INFERENCE_MODE=shadow
PROPULSE_FEATURE_STORE_URL=https://PROJECT.supabase.co
PROPULSE_FEATURE_STORE_SERVICE_KEY=server-only-service-role-key
PROPULSE_WSPR_PROVIDER=approved-provider-id
PROPULSE_PATH_TRANSFORM_VERSION=wspr-opportunity-duckdb-v1
PROPULSE_WEATHER_STORE_URL=https://PROJECT.supabase.co
PROPULSE_WEATHER_STORE_SERVICE_KEY=server-only-service-role-key
PROPULSE_WEATHER_CACHE_SECONDS=60
PROPULSE_XGBOOST_THREADS=1
PROPULSE_UVICORN_WORKERS=1
```

Production startup fails before model loading if any trusted store, provider,
origin, secret, thread, worker, or cache bound is missing or unsafe. Keep one
worker and one prediction thread until the deployed 1/2/4-worker load test is
complete.

Vercel requires `PROPULSE_INFERENCE_URL` set to the exact HTTPS Railway origin,
the same server-only `PROPULSE_SERVICE_TOKEN`, and server-side `SUPABASE_URL`
plus `SUPABASE_ANON_KEY` for JWT verification. Missing server-side auth
configuration fails closed in production. The five
`/api/propagation/*` endpoints verify the browser's Supabase JWT, enforce
same-origin access, strict request and response contracts, body and cell bounds,
per-user and per-IP budgets, timeouts, and redirect refusal. They forward only
the inference envelope and a trace ID. The Railway secret, service-role keys,
user ID, and browser JWT are never forwarded to or emitted by browser code.
Production should leave `VITE_PROPAGATION_MODEL_URL` unset so the client uses
the authenticated same-origin proxy. Set that variable only for direct M5 local
development.

When shadow or active mode is selected, each successful inference emits a
`propagation-shadow-v1` aggregate telemetry event. It records request kind,
issue/valid/receipt times, band/mode, cell count, model/feature versions,
the core and station-adapter contracts, profile and OOD counts, allowlisted
path-history/space-weather ages, probability/confidence summaries, and latency.
It never records grid locators, coordinates, callsigns, user IDs, station
fingerprints, or raw equipment fields. The default sink writes structured JSON
to the service logger; production storage must retain the same allowlisted
schema. Ordinary shadow telemetry remains best effort. Once active research
receipts are enabled, privacy validation and the independent aggregate stop
counter become fail-closed: telemetry failure suppresses the receipt and
prediction rather than representing an unobserved stop as zero.

Opt-in beta outcomes use a separate active-only receipt boundary. Configure the
same independent 32+ character secret in the inference service and product API
only after beta approval:

```bash
export PROPULSE_RESEARCH_RECEIPT_SECRET="server-only-random-secret"
export PROPULSE_BETA_TELEMETRY_STORE_URL="https://project.supabase.co"
export PROPULSE_BETA_TELEMETRY_STORE_SERVICE_KEY="server-only-service-role-key"
```

The path endpoint emits no research receipt in disabled or shadow mode, without
a current pseudonymous subject binding, or without that secret. A receipt HMAC
protects coarse prediction provenance and the subject binding ties it to the
authenticated consenting account without exposing a user ID to the model. The
product API, not the browser, verifies and persists the receipt. Surface calls
never emit receipts. Receipt v2 adds only fixed capability classes and the
selected physics/NowCast profile. Raw shack inventory and exact component
values remain excluded. The API stores capability classes only when the
current consent independently includes `derived_equipment_training`; ordinary
attempt/outcome consent stores those columns as null. The signed support
decision is retained only to reject unsupported chains from evaluation. Both
`VITE_PROPAGATION_RESEARCH_OUTCOMES_ENABLED` and
`PROPULSE_PROPAGATION_RESEARCH_OUTCOMES_ENABLED` remain false until the beta
release gate passes.

The model service validates the canonical station-chain equations, the HF-band
support decision, and the exact identity-free shadow event before returning an
active beta receipt. It emits aggregate `equipment_math_events`,
`unsupported_support_events`, or `privacy_events` through the same hardened RPC
used by the participation API. A separate weekly M5 monitor reads only the
k-anonymous aggregate evidence RPC. After 200 valid outcomes it enforces the
0.10 high-confidence overprediction stop, and it emits the geographic stop only
after the same broad origin-field cell has reportable regression above 3% in
two contiguous weekly reads. Enable and schedule that monitor only when the
beta itself is approved:

```bash
export PROPULSE_STATIONCAST_BETA_MONITOR_ENABLED=true
ml/.venv/bin/python ml/service/stationcast_beta_stop_monitor.py \
  --window-end 2026-08-10T00:00:00Z \
  --receipt-secret "$HOME/Library/Application Support/PropulseML/stationcast_beta/monitor_receipt_hmac.key" \
  --commit --acknowledge-beta-safety-monitor
```

Its state and receipt are owner-only aggregate files under
`~/Library/Application Support/PropulseML/stationcast_beta`. Repeating the same
weekly window emits no counter and reuses the original signed receipt only when
its config, evidence digest, and window still match. A mismatch fails closed,
and real operations accept only a signed `continue` decision. A noncontiguous
read resets the geographic streak. Collection flags remain false in the current
release.

Endpoints are `/v1/propagation/path`, `/surface`, `/reference`, `/capabilities`,
`/models`, and `/health`. Production authentication protects every endpoint
except `/health`, which remains public for the deployment readiness probe and
exposes no secret. When recent path history is older than two hours, inference
selects the physics profile and returns an explicit stale-data OOD flag.
Missing freshness is stale, and negative ages are rejected. If no approved
model is loaded, prediction endpoints return `503`; the service never
fabricates spots or probabilities.

### `/v1/propagation/reference`

A server-side reference-surface endpoint for the hourly collector scoring job
(issue #296): it scores a fixed list of origin/target grid4 pairs for one band
without a browser-built feature payload or station envelope. Request:

```json
{
  "issue_time": "2026-09-06T15:00:00+00:00",
  "valid_time": "2026-09-06T15:30:00+00:00",
  "band": "20m",
  "declared_power_watts": 5,
  "paths": [{ "origin_grid4": "EM12", "target_grid4": "JO21" }]
}
```

`paths` accepts 1-512 grid4 pairs (`^[A-R]{2}[0-9]{2}$`, origin != target); an
unrecognized `band` is a `422`. The service builds the 23 geometry/time
features (great-circle distance/bearing/midpoint, solar elevation, day/hour
cyclical encodings, `power_bin_dbm`) itself from `origin_grid4`, `target_grid4`,
`valid_time`, `band`, and `declared_power_watts` — these are a direct Python
port of the served model's actual training feature lineage,
`ml/src/archive_v3/build_features.py` (plus `build_bronze.py` for the grid4
coordinates and `power_bin_dbm`), kept in `reference_features.py` (pure
functions, no FastAPI dependency). The client's
`src/lib/propagation/coreFeatureBuilder.ts` implements the same contract and
agrees with this module formula for formula — there is no known difference
between them. Path history and operational weather are then verified and
applied exactly as `/path` and `/surface` do. The response has no station
envelope, no personalization, and no research receipt — `core_probability` is
the raw model output:

```json
{
  "model_version": "...",
  "feature_contract": "reference-surface-v1",
  "band": "20m",
  "data_freshness": { "space_weather": 42 },
  "profile_counts": { "physics": 1 },
  "predictions": [
    {
      "origin_grid4": "EM12",
      "target_grid4": "JO21",
      "core_probability": 0.31,
      "confidence": 0.8,
      "profile": "physics",
      "missing_feature_count": 11
    }
  ]
}
```

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

> **Decommissioned (2026-07-21).** The live-WSPR research pipeline that was
> documented here — `wspr_live_connector.py`, `wspr_scheduler.py`,
> `wspr_finalizer.py`, the `run_m5_wspr_research_*` / prospective-collector /
> forecast-archive LaunchAgents, the research-health heartbeat endpoints and
> GitHub monitor workflow, and the Supabase `wspr_*` stores — has been removed.
> Continuous ingestion into Supabase is not part of the product architecture:
> NowCast/FutureCast are served by the pre-trained Railway models plus the
> physics fallback, and WSPR training data is pulled from the public wspr.live
> archive only at (roughly yearly) base-model retraining time. With no
> configured feature store the service marks path history unavailable and fails
> closed to the physics profile, which is the intended steady state. Do not
> rebuild the live pipeline. (Database teardown: supabase/migrations/
> 20260721110000, 20260721112000, 20260721120000.)

The feature-store trio above is optional as an all-or-none group. Leave all
three unset and startup accepts it: the path-history provider resolves to
`unavailable` and `PROPULSE_PATH_TRANSFORM_VERSION` is not required. Set any
one of the three and startup requires all three plus the approved transform
version, exactly as before partial configuration was always rejected. An
explicit `PROPULSE_PATH_HISTORY_PROVIDER=unavailable` overrides the trio
either way, forcing the unavailable provider (and skipping the trio and
transform checks) even when the three variables are still present - this is
how the dead RPC-backed provider can be turned off on Railway without
deleting variables first. When the provider is unavailable the service logs
one line at startup instead of warning on every request, and `/health`
reports `serving_profile: physics`; once a provider is configured and its
lookups are current, `/health` reports `serving_profile: nowcast`.
`configured_profile` is the *expected* profile given how the provider is
configured; `serving_profile` is the profile of the most recent prediction
actually served (before any request it equals `configured_profile`), so a
configured provider that fails or returns stale rows shows up as
`serving_profile: physics` instead of a phantom nowcast. `/health` also
exposes `served_profile_counts`, a rolling in-process tally (since process
start) of the profile each request served, so operators can see the real
split alongside the
configured expectation. `/health` also exposes `missing_feature_counts`, a
rolling in-process tally of which model features arrived as `None`, capped
to the top 20 names since the process started.

Serving manifests may declare a profile as a checksum-verified `single` model
or a `weighted_ensemble`. Ensemble components must use the same ordered feature
contract; weights must be non-negative and sum to one. Each component is scored
and calibrated independently before the frozen probability-space blend is
applied. The `/models` response exposes each profile kind.
