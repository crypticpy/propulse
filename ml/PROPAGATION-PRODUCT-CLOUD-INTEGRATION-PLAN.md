# Propagation Product and Cloud Integration Plan

> Status, 2026-07-16: approved for execution planning. Propulse is a private,
> prelaunch product used only by the project team and occasional invited friends.
> Experimental feature visibility is therefore no longer coupled to scientific
> release eligibility. The evidence gates still control claims, outcome studies,
> model publication status, and any future general release.
>
> North star: [`PERSONALIZED-PROPAGATION-V4-PLAN.md`](PERSONALIZED-PROPAGATION-V4-PLAN.md).
> Active model plan: [`PERSONALIZED-PROPAGATION-V4.2-PERFORMANCE-PLAN.md`](PERSONALIZED-PROPAGATION-V4.2-PERFORMANCE-PLAN.md).
> M5 runbook: [`PERSONALIZED-PROPAGATION-V4.2-M5-RUNBOOK.md`](PERSONALIZED-PROPAGATION-V4.2-M5-RUNBOOK.md).
> Live input contract: [`NOWCAST-LIVE-FEATURE-PIPELINE.md`](NOWCAST-LIVE-FEATURE-PIPELINE.md).
> FutureCast protocol: [`FUTURECAST-V1-PROTOCOL.md`](FUTURECAST-V1-PROTOCOL.md).

## Decision

Integrate the validated retrospective NowCast core, deterministic StationCast,
ReachMap, and aggregate System Health into the private Propulse product now.
Display their actual model profile, freshness, confidence, and experimental
status rather than hiding the entire experience behind the public-release gate.

Do not weaken the scientific protocol:

- A6 remains frozen. December 2024 and the locked 2025 archive may not be reused
  to tune it.
- The August 1 through September 30, 2026 prospective outcomes remain unread
  until the preregistered evaluation.
- Internal visibility does not make a model publicly validated or release
  approved.
- Synthetic FutureCast output may prove software behavior but may never appear
  as a real propagation forecast.
- Learned StationCast and 6m remain separate experiments.
- Outcome collection remains consented and independently controlled even though
  prediction display is enabled.

## Current state

| Capability | Engineering | Evidence | Product decision now |
|---|---|---|---|
| A6 core NowCast | complete | retrospective archive passed; prospective open | integrate and show as experimental |
| Physics fallback | complete | validated fallback | always available and visibly identified |
| Deterministic StationCast | complete | archive math/parity passed; operator beta open | integrate and show as experimental |
| ReachMap current surface | complete foundation | local rendering/service tests passed | integrate and refine in all map modes |
| System Health | aggregate endpoint complete | outage and duration gates open | show to the private team |
| FutureCast pipeline | synthetic end-to-end proof complete | genuine 90-day archive immature | build UI/API contracts; show collection status only |
| Genuine FutureCast models | trainer/scorer complete | no real model trained or passed | train once after the first legal window matures |
| Learned StationCast | protocol foundation only | no consented outcome cohort | defer until beta evidence exists |
| 6m mechanism models | development candidates complete | release decision withheld | keep in a separate research view |

## Visibility versus evidence

The current code uses one activation contract for two different concerns. Split
them without deleting the fail-closed evidence machinery.

### Product visibility modes

Use these browser-facing modes:

| Mode | Behavior |
|---|---|
| `off` | no propagation service calls or UI |
| `internal` | score and display available experimental capabilities; show profile, freshness, and evidence status |
| `released` | display only capabilities and FutureCast horizons approved by the checksum-bound eligibility contract |

Keep the service execution modes:

| Service mode | Behavior |
|---|---|
| `disabled` | no prediction serving |
| `shadow` | serve internal predictions and aggregate operational telemetry; no beta outcome receipts |
| `active` | serve predictions and permit separately approved, consented beta receipts |

For the private integration, use browser `internal` plus service `shadow`.
Outcome collection remains off until its own protocol starts. This makes the
feature visible without pretending the evidence clock has finished.

### Required activation repair

Before any deployment, update `ml/service/runtime_activation.py` and its tests to
accept eligibility schema V2, validate `futurecast_horizons_hours`, verify the
readiness checksum binding, and match the TypeScript reader. Add shared JSON
fixtures so Python and TypeScript cannot silently diverge again.

## Target cloud architecture

Execution policy: implementation, tests, production builds, model/service
verification, artifact promotion, and deploy commands run from the M5. The
current M3 may carry documentation and Git transport only. Once deployed, the
cloud runtime serves requests independently; it does not become a trainer.

```text
Propulse browser
    |
    | same-origin authenticated requests
    v
Vercel /api/propagation/* proxy
    |
    | server-to-server secret, bounded payload, timeout
    v
Railway propagation FastAPI service
    |                    |
    |                    +--> checksum-verified A6/physics model bundle
    |
    +--> Supabase trusted weather and WSPR lag-feature RPCs

M5 Max
    +--> operational/future-issuance collectors --> Supabase
    +--> bounded streaming training/scoring --> Projects SSD
    +--> signed model/report artifact promotion --> private model storage
```

### Platform assignments

| Platform | Responsibility |
|---|---|
| Vercel | React application, same-origin propagation proxy, authentication boundary, request throttling |
| Railway | always-on FastAPI/XGBoost inference service; no model training |
| Supabase | authentication, current weather, verified lag features, aggregate health, consented beta data, private model object storage |
| M5 Max | all collectors, archive materialization, training, locked scoring, report generation, and promotion signing |
| Projects SSD | raw/derived research datasets, Parquet partitions, caches, spools, and write-once run outputs |
| GitHub | source, small manifests/receipts, tests, documentation, reports, and eventually open model release assets |

This reuses the current stack. Railway supports Dockerfile-based FastAPI
services, code-defined health checks/restart policies, and long-running services:

- <https://docs.railway.com/guides/fastapi>
- <https://docs.railway.com/builds/dockerfiles>
- <https://docs.railway.com/config-as-code/reference>
- <https://docs.railway.com/deployments/healthchecks>

Use a private Supabase Storage bucket for internal model bundles. Private bucket
downloads remain access controlled and can later be replaced by a public GitHub
release asset when the open model package is published:

- <https://supabase.com/docs/guides/storage/buckets/fundamentals>
- <https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases>

Do not attach a Railway volume just for the model bundle. A volume prevents
replicas and complicates zero-downtime deployment. Download the immutable bundle
to ephemeral storage at startup, verify it, then mark the service ready.

## Phase A: normalize runtime and artifact contracts

**Owner:** M5 implementation and verification.

- [ ] Add browser `internal` visibility while preserving legacy environment
  compatibility during migration.
- [ ] Keep the evidence eligibility document as status and as the strict
  `released`-mode gate.
- [ ] Fix Python eligibility schema V2 support and add cross-language fixtures.
- [ ] Decouple `active inference` from `beta_collection`; internal display must
  not require a research receipt secret.
- [ ] Keep beta receipt signing, consent, privacy, and stop-monitor requirements
  unchanged.
- [ ] Generate a new immutable `retrospective_validated_internal` serving
  manifest on the M5. It must reference the exact A6 components, physics
  fallback, calibrators, feature contract, archive decision hashes, and one
  prediction thread per request.
- [ ] Refuse startup on a missing file, wrong SHA-256, unexpected schema, wrong
  feature order, or non-native model/calibrator combination.
- [ ] Add a single machine-readable capability response covering core NowCast,
  deterministic StationCast, health, released FutureCast horizons, learned
  StationCast, and 6m.

**Exit gate:** Python and TypeScript agree on every activation/capability fixture,
and the service loads the exact A6 internal manifest on the M5.

## Phase B: package and deploy cloud inference

**Owner:** M5 artifact promotion plus Railway runtime.

- [ ] Add a production entrypoint that respects Railway's injected `PORT` and a
  bounded `PROPULSE_UVICORN_WORKERS` value.
- [ ] Add `railway.json` with the existing `ml/service/Dockerfile`,
  `/v1/propagation/health` readiness check, restart policy, deployment drain,
  and ML/service-only watch paths.
- [ ] Make the Docker image contain runtime code only; do not copy raw archives,
  reports, local secrets, or the full ML workspace.
- [ ] Add a startup artifact fetcher for a versioned private object such as
  `propagation-models/a6/<bundle_sha256>.tar.zst`.
- [ ] Download to a temporary path, verify the outer archive checksum, safely
  extract, verify every manifest member, then atomically expose the bundle.
- [ ] Upload the bundle only from the M5 promotion command. Commit the small
  promotion receipt, never the private service key or large artifact.
- [ ] Run one cloud worker initially with one XGBoost thread, then load test 1,
  2, and 4 workers before changing concurrency. The M5's six-worker serving
  profile does not automatically fit a smaller cloud allocation.
- [ ] Configure exact origins, trusted weather store, verified feature store,
  provider/transform version, telemetry sink, and server-to-server secret.
- [ ] Confirm cold-start time, model RSS, path p50/p95, 4,096-cell surface
  p50/p95, concurrent request behavior, and monthly compute/storage estimates.
- [ ] Configure external continuous monitoring; Railway's deployment health
  check establishes readiness but is not continuous uptime monitoring.

**Exit gate:** a clean Railway deployment downloads and verifies the bundle,
reports the expected hashes/profile, serves test path and surface calls, and
fails closed when any model or trusted-data dependency is deliberately broken.

## Phase C: add the authenticated product proxy

**Owner:** M5 implementation and verification; Vercel runtime.

- [ ] Add same-origin Vercel endpoints for path, surface, capabilities, models,
  and health.
- [ ] Reuse the repository's Supabase JWT verification boundary for registered
  users and invited testers.
- [ ] Authenticate Vercel to Railway with a server-only secret. Never place the
  Railway credential or a service-role key in a `VITE_*` variable.
- [ ] Validate request and response schemas at the boundary, impose body/cell
  limits, set short timeouts, and reject redirects.
- [ ] Add per-user and per-IP throttles, with a stricter surface-request budget.
- [ ] Forward a trace ID but no callsign, user ID, exact shack inventory, or
  private station record to aggregate inference logs.
- [ ] Point `modelClient.ts` at the same-origin proxy by default. Retain a direct
  local URL override for M5 development.
- [ ] Add clear unavailable, stale-input, fallback, and partial-surface states.

**Exit gate:** a registered invited tester can use propagation features from the
Vercel deployment without any cloud secret appearing in the browser or network
payloads.

## Phase D: complete NowCast and StationCast product integration

**Owner:** M5 implementation and verification with Railway/Supabase test environment.

- [ ] Make the active saved operating location and active virtual-shack chain
  the canonical prediction context.
- [ ] Show current probabilities in Band Planner for every supported HF band.
- [ ] Show model version, valid time, freshness, confidence, selected profile,
  and out-of-distribution/fallback state in compact operator-facing UI.
- [ ] Provide core-versus-personalized comparison: the open path probability,
  StationCast probability, and the largest deterministic station-chain effects.
- [ ] Never imply causation from XGBoost feature importance; top factors are
  predictive context only.
- [ ] Label non-WSPR modes as estimated feasibility until CW/digital/voice heads
  pass their own external validation.
- [ ] Allow saved locations and portable station presets to produce different
  predictions without rewriting the user's primary shack.
- [ ] Validate incomplete equipment, custom components, unusual feed-line loss,
  directional antennas, receive-only antennas, QRP, high power, and unsupported
  band combinations.
- [ ] Preserve the physics fallback when verified recent WSPR history is absent.
  A fallback result remains useful and visible, but must not be labeled A6
  NowCast.

**Exit gate:** Band Planner predictions match direct API fixtures and change in
the expected direction when tested station parameters change.

## Phase E: finish ReachMap and globe forecasting UX

**Owner:** M5 implementation and verification; PropSphere and surface API.

- [ ] Render current core and StationCast surfaces in globe, flat, and azimuthal
  modes with a shared probability legend.
- [ ] Add an explicit core/personalized comparison control rather than hiding
  one result.
- [ ] Support band, saved location, station preset, and mode selection.
- [ ] Show hover/tap details for target region, bearing, distance, probability,
  confidence, valid time, freshness, and profile.
- [ ] Use stable cell geometry and avoid recomputing identical five-minute
  surfaces. Start with browser/TanStack caching; add shared Redis only if cloud
  measurements justify it.
- [ ] Add a forecast timeline that supports `now`, `+3`, `+6`, `+12`, and `+24`.
  Before genuine FutureCast release, show only `now` as forecast data and show
  the archive-readiness status for future horizons.
- [ ] Implement time animation with discrete issued snapshots. Any visual
  interpolation between horizons is presentation only and must not be described
  as an additional model prediction.
- [ ] Respect reduced-motion settings and validate animation cancellation,
  mobile controls, text fit, map labels, GPU/canvas load, and no overlay overlap.
- [ ] Capture Playwright desktop/mobile screenshots and canvas-pixel checks for
  every map projection, core/personalized state, and data fallback.

**Exit gate:** the private product provides an understandable current propagation
map today and is contract-ready for real FutureCast horizons later.

## Phase F: keep the M5 evidence and data engines running

**Owner:** M5 Max only. Large data stays on `/Volumes/Projects/PropulseML`.

- [ ] Preserve the current PSK Reporter, RBN, DX Cluster, solar-weather, WSPR
  shadow, coverage-audit, health, and FutureCast issuance LaunchAgents.
- [ ] Finish the 24-hour pipeline/weather preflight without resetting continuity
  solely because an upstream NOAA observation is late.
- [ ] Complete the signed 720-hour WSPR receipt and aggregate coverage window.
- [ ] Complete a literal M5 shutdown/recovery proof while the off-device monitor
  is active.
- [ ] Obtain and record written WSPR operational-use permission or implement an
  authorized first-party source before any general hosted claim depends on it.
- [ ] Keep forecast issuance payloads immutable, every six hours, with issue,
  availability, validity, hash, parser, and source provenance.
- [ ] Monitor Projects SSD free space, spool cleanup, receipt gaps, Supabase lag,
  and collector CPU during heavy training.
- [ ] Keep training at the benchmarked native ARM64/OpenMP profile. XGBoost has
  no Metal training path here; use the M5 CPU cores and bounded external-memory
  pipeline rather than claiming Apple GPU/Neural Engine use. Reserve the M5 GPU
  or rented CUDA hardware for a later model class only when a preregistered
  experiment can actually use it and justifies the added complexity.

**Exit gate:** the operational inputs can support internal cloud inference and
the preregistered evidence windows remain intact.

## Phase G: genuine FutureCast training and serving

**Owner:** M5 training, then Railway and product integration.

Do not begin until the first qualifying 90 consecutive common issuance days and
their valid-time outcomes exist.

- [ ] Freeze the first qualifying source manifest and run the existing 60/15/15
  issue-day split exactly once.
- [ ] Train direct and weather-only XGBoost models for `+3`, `+6`, `+12`, and
  `+24` with two workers and nine native threads each.
- [ ] Run climatology, persistence, calibration guard, per-band safety,
  issue-day bootstrap, and paired P.533 diagnostics.
- [ ] Open the one-shot gate only after training artifacts and checksums are
  complete.
- [ ] Promote only independently passing horizons. A failure at `+24` must not
  block a valid `+3`, and a passing `+3` must not conceal a failed `+24`.
- [ ] Package released horizon models into a separate immutable FutureCast
  bundle and extend the capability endpoint.
- [ ] Add issued-at and valid-at semantics to all API responses and cache keys.
- [ ] Enable only passing timeline positions and update the visual report with
  genuine, not synthetic, results.

**Exit gate:** every visible future horizon is backed by a checksum-linked model
that beat all frozen full-gate baselines on genuine held-out issued forecasts.

## Phase H: prospective evaluation, beta, and open release

**Owner:** M5 analysis, invited operators, documentation, and product.

- [ ] Keep internal predictions visible while preserving the locked August and
  September outcome boundary.
- [ ] After the window closes, score A6 and deterministic StationCast without
  post-test tuning.
- [ ] Start consented outcome collection only after receipt signing, aggregate
  stop monitoring, deletion/retention, and user-facing consent are verified.
- [ ] Compare core versus deterministic StationCast by band, distance, geography,
  equipment class, source availability, and confidence.
- [ ] Decide whether evidence justifies a new A6 successor. If not, retain A6.
- [ ] Train a learned StationCast residual only after a new protocol freezes an
  adequate consented cohort, leakage boundary, privacy threshold, baseline, and
  locked test.
- [ ] Publish model card, data card, source/terms registry, methodology, checksums,
  reproducible code, limitations, retrospective/prospective report, and model
  assets permitted for redistribution.
- [ ] Change the browser from `internal` to `released` only when Propulse is
  actually opened beyond the private test group.

## 6m track

Do not merge 6m into the HF model or the FutureCast schedule.

- [ ] Build independent sporadic-E, tropospheric, auroral, F2/TEP, meteor-scatter,
  and unknown-mechanism labels.
- [ ] Add issuance-aware NOAA GFS/NWP corridor features and parity checks.
- [ ] Obtain independent event catalogs and quiet-day tests.
- [ ] Train and release mechanisms independently; unsupported mechanisms remain
  visibly unavailable rather than receiving an HF probability.

## Data sources still required

No additional source is required to integrate the current HF NowCast product.
The priority is operational parity and accumulated evidence, not adding more
columns. Continue these required sources:

| Source | Use | Link |
|---|---|---|
| WSPRnet/WSPR.live or authorized first-party WSPR | historical labels and recent path lags | <https://www.wsprnet.org/archive/> and <https://wspr.live/> |
| NOAA SWPC JSON/current solar wind | live NowCast weather | <https://services.swpc.noaa.gov/json/> |
| NOAA 45-day Ap/F10.7 | FutureCast issued input | <https://services.swpc.noaa.gov/json/45-day-forecast.json> |
| NOAA three-day solar/geomagnetic forecast | FutureCast issued input | <https://services.swpc.noaa.gov/text/3-day-solar-geomag-predictions.txt> |
| PSK Reporter | separate digital validation/head | <https://www.pskreporter.info/pskdev.html> |
| Reverse Beacon Network | separate CW validation/head | <https://reversebeacon.net/> |
| ITU-R P.533 | frozen physics baseline | <https://www.itu.int/rec/R-REC-P.533-14-201908-I/en> |

Optional IGS, GIRO, HamSCI, and NWP sources stay in bounded ablation or separate
6m studies until they prove incremental time-held-out skill and compatible use.

## Verification matrix

| Layer | Required verification |
|---|---|
| Contract | Python/TypeScript fixtures, schema fuzzing, checksum failures, horizon partial release |
| Model | offline/service parity, calibration, fallbacks, feature order, non-finite rejection |
| API | auth, secret rejection, CORS, size limits, timeout, cancellation, rate limit, 4,096-cell bound |
| Data | event/issue/valid/receipt time, freshness, outage, revision, provider/transform match |
| Privacy | no raw shack/user identity in core logs; consented outcome boundary; RLS |
| Performance | cold start, RSS, path and surface p50/p95, concurrency, M5/cloud thread counts |
| UI | desktop/mobile, all projections, accessibility, reduced motion, failure/fallback states |
| Operations | deployment health, continuous monitor, restart, dependency outage, rollback |
| Research | locked-boundary enforcement, one-shot scoring, report/artifact provenance |

Run the full repository verification on the M5 before each cloud promotion:

```bash
npm install
npm run verify
```

Add cloud integration smoke tests that operate against the deployed Railway and
Vercel preview endpoints without printing secrets or private station data.

## Execution order

1. Phase A: runtime/schema repair and internal manifest.
2. Phase B: Railway inference deployment and model promotion.
3. Phase C: authenticated Vercel proxy.
4. Phase D: NowCast/StationCast product completion.
5. Phase E: ReachMap and forecast-ready globe UX.
6. Phase F continues concurrently on the M5 without changing A6.
7. Phase H prospective analysis starts only after the locked window closes.
8. Phase G genuine FutureCast starts only after its 90-day issued archive and
   outcomes mature.
9. Learned StationCast and 6m remain later independent decisions.

## Immediate resume instruction

On the M5, pull the branch and read this plan plus its four linked controlling
documents. Begin Phase A. Do not retrain A6. First repair the V2 runtime contract,
generate the retrospective-validated internal serving manifest from the existing
checksum-verified A6 components, run the complete M5 verification, and then
prepare the Railway runtime/artifact promotion path. Preserve every existing
collector and the unread prospective outcome boundary while product integration
continues.
