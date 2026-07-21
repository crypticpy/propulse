# NowCast Live Feature Pipeline

> **Decommissioned 2026-07-21.** This pipeline was removed end to end: the M5
> LaunchAgents, `ml/service` connector/scheduler/finalizer code, research-health
> heartbeat endpoints, and the Supabase `wspr_*` stores. NowCast/FutureCast are
> served by the pre-trained Railway models with the physics fallback; path
> history is permanently unavailable and the service fails closed to the physics
> profile by design. Historical record only — do not rebuild.

> Status: design and release gates frozen before V4.2 Phase 3 candidate freeze.
> This document does not authorize a live data source or enable NowCast in the
> product. Until every release gate below passes, Propulse must mark path
> history stale and serve the packaged physics/weather profile.

> Archive update, 2026-07-15: frozen A6 passed untouched December 2024 and the
> locked four-month 2025 archive. The frontend and inference service now have an
> explicit shadow mode: requests are scored silently, the UI remains on approved
> behavior, and only aggregate identity-free telemetry is emitted. This proves
> service/fallback operation; it does not satisfy the live-source, replay, or
> receipt-time gates and must not be described as live NowCast evidence.

> Local runtime update, 2026-07-15: the checksum-verified A6 bundle served a
> real M5 HTTP shadow request through six one-thread Uvicorn workers. Health,
> CORS, stale-profile selection, and persisted aggregate telemetry passed. The
> request used a synthetic fixture and therefore is operational smoke evidence,
> not beta, receipt-time, coverage, calibration, or source-authorization
> evidence.

> Feature-foundation update, 2026-07-15: the frozen opportunity SQL is now a
> shared `wspr-opportunity-duckdb-v1` library used by the historical builder.
> On the M5 it reproduced an open October 2024 hour exactly: 302,903 bronze
> spots, 88,466 opportunity cells and 78,478 lag cells, zero bidirectional row
> differences, identical successes/opportunities/sampled rows, 18 DuckDB
> threads, 0.72 GiB peak RSS, and 2.18 seconds. A private rolling schema,
> complete-watermark RPC, and server-only PostgREST provider are implemented
> and the private schema is now deployed. The service
> now ignores browser-provided path lags/freshness and fails closed to physics
> unless that verified provider supplies every requested target.

> Foundation-validation update, 2026-07-15: all 14 pre-provider gates passed
> against the real checksum-verified A6 bundle on native ARM64. A forged browser
> request with 0.999 lag values and zero claimed freshness remained on physics
> fallback; aggregate telemetry contained no grid or station fields. Path p95
> was 3.39 ms and a 288-cell surface p95 was 10.59 ms with the manifest-default
> one-thread serving contract. The interactive report is
> [`live_feature_pipeline/REPORT.html`](results/propagation_v4_2/propagation_v4_2_phase2_scale/live_feature_pipeline/REPORT.html)
> and passed browser verification at 1,440 px and 390 px. Source authorization,
> production scheduling, real receipt-time capture, and live shadow evidence
> remain open.

> Replay and migration update, 2026-07-15: the M5 replay passed 15/15 gates on
> 48 hours spanning October and November, all UTC hours and all ten HF bands.
> It processed 12,245,675 spots into 3,628,293 exact opportunity cells and
> 3,218,610 exact path-hour cells with zero directional or causal lag mismatch.
> Synthetic late/duplicate receipt cases produced immutable first versions and
> exact corrected versions. The private schema then passed 14/14 rollback-only
> gates on target PostgreSQL 17.6 with no persistent changes. Historical
> receipt times are synthetic, so the permitted 30-day live shadow gate
> remains unchanged.

> Deployment update, 2026-07-15: the exact six-file release chain passed 22/22
> rollback gates, was applied through the normal migration ledger, and passed
> 15/15 post-deployment gates. All release tables exist with RLS, service-only
> functions and locked search paths; the four-lag RPC smoke was exact and its
> test rows were rolled back. This deploys storage contracts only. It does not
> authorize a WSPR source, start ingest/finalization/pruning jobs, or enable
> NowCast selection.

> Trusted-weather and orchestration update, 2026-07-15: a real hardened NOAA
> capture produced 14 causal A6 weather features and the service passed 14/14
> target gates at 2.91 ms cached path p95. Forged browser Kp and weather
> freshness were replaced before inference; absent WSPR still selected physics.
> The source-independent hourly runner now requires an HMAC-authenticated,
> checkpoint-hashed completion manifest for all ten HF bands, bounds
> `workers * threads_per_band` to visible CPUs, and prunes only after every band
> finalizes. Subscriber-facing activation still requires written source terms;
> the later internal research schedule remains separately double-gated.

> Research connector update, 2026-07-16: the disabled-by-default WSPR.live
> connector passed 8/8 real-source gates on the M5. One settled-hour request
> streamed 287,694 valid rows across all ten HF bands in 23.11 seconds at 57.63
> MiB peak RSS, removed its Projects-volume spool, and made no target write.
> This validates the current source schema and bounded streaming path; it does
> not authorize subscriber-facing use or start the 30-day evidence window.

> Real target-hour update, 2026-07-16: the first finalizer exposed a 1,000-row
> PostgREST response cap. All ten truncated watermarks were explicitly failed.
> Pagination now exhausts the result and manifest v2 signs per-band counts before
> publication. The corrected hour matched all 287,694 rows, produced 75,055 path
> cells, and passed 10/10 independent target gates; incomplete four-lag history
> still fails closed.

> Research schedule update, 2026-07-16: the research-only M5 LaunchAgent is
> active at minute 15. Its first receipt matched 261,006 observations and 69,980
> feature cells across all ten bands with two workers and nine threads each. A
> separate minute-0/minute-30 watchdog enforces the 7,200-second stale boundary,
> receipt continuity, UTC, worker, failure, and 2 GiB runtime gates. Local
> notification delivery smoke and the initial independent audit passed 28/28
> gates. The protected-preview HMAC heartbeat subsequently passed 8/8
> M5-to-endpoint-to-private-store gates while the public reader remained off.
> A GitHub-hosted runner then passed the independent default-branch protected
> fresh-heartbeat path at 184 seconds old with zero failed or exhausted
> deliveries. The first real calendar event also passed at immutable scheduled
> run `29485741095`: the heartbeat was healthy at 2,035 seconds with no state
> change and zero failed or exhausted deliveries. The real stale alert/recovery
> webhook smoke remains open.
> The 30-day clock has started; subscriber permission, remote alert delivery,
> System Health activation, beta outcomes, and long-window evidence remain open.
> An automatic identity-free rollup re-verifies every receipt and signed
> manifest, fixes the duration at 720 expected hours and scheduled completion at
> 99%. Actual minute-15 calendar events completed without RunAtLoad or manual
> targets, advancing the operationally healthy rollup to `14/14` expected hours,
> zero gaps, `3,295,875` observations, `933,688` feature cells, and `collecting`
> status at `14/720` through `2026-07-16T16:00:00Z`. A third owner-only
> LaunchAgent now rebuilds the bounded aggregate coverage audit at 06:45 and
> 18:45 local time. The twice-hourly watchdog enforces audit age, signed-window
> lag, health, query bounds, private-table scope, and identity exclusion; exact
> deployed-state validation passes `34/34` gates.

> Capture hardening, 2026-07-15: the collector now selects NOAA rows by source
> observation time instead of assuming array order, parses the current Kyoto
> Dst object schema, preserves Bx and proton temperature, and stores per-source
> observation/quality provenance. Native M5 TypeScript build and all three
> source-order tests passed. The provenance schema and a real hardened capture
> are now deployed and validated; this still does not enable live NowCast.

## Decision

V4.2 NowCast cannot use the existing `path_hourly_stats` table as its recent
path input. That table aggregates positive PSK Reporter/RBN/DX Cluster activity
at two-character Maidenhead fields. V4.2 was trained with exposure-aware WSPR
success rates at four-character grid paths for exactly H-1, H-2, H-3, and H-24.
The meanings, resolution, population, and denominator are different.

The current fallback is therefore correct:

- fresh, contract-valid WSPR lag features select the NowCast profile;
- absent, unverified, or older-than-7,200-second path evidence selects the
  physics/weather profile;
- PSK Reporter, RBN, and DX Cluster remain separate live observations and may
  support a future model only after explicit training and validation; and
- no empty, synthetic, coarse, or cross-source value may be labeled as fresh
  WSPR history.

This does not reduce the value of the registered virtual shack. Propulse
already derives conducted power, feed-line and inline losses, amplifier gain,
antenna gain toward each bearing, receiver evidence, mode bandwidth/threshold,
and saved location into the StationCast envelope. That deterministic private
adapter applies after either open-core profile.

## Source Policy

| Source | Permitted role | Release rule |
|---|---|---|
| [WSPRnet monthly archive](https://www.wsprnet.org/archive/) | historical training and locked evaluation | preserve URLs, retrieval time, checksums, and archive terms |
| [WSPR.live database](https://wspr.live/) | research/shadow candidate for recent WSPR observations | written production permission required before use in any subscriber-facing workflow |
| [WSPRnet recent database](https://www.wsprnet.org/olddb?mode=html) | source-discovery and small manual checks | do not scrape at production scale without written permission and an agreed interface |
| [WSPR Daemon](https://wsprdaemon.org/) | possible authorized ingest or operator-owned decoder source | agree on access, attribution, load, retention, and redistribution first |
| Propulse/opt-in operator decoders | first-party supplementary evidence | explicit consent, revocation, provenance, and selection-bias labels required |
| PSK Reporter/RBN/DX Cluster | UI activity and future model research | never substitute into a V4.2 WSPR lag feature |

WSPR.live publicly allows its service for research/projects whose results are
free and prohibits commercial or profit-oriented use. Propulse is a free
non-profit product (paid tiers only cover hosting costs), which the operator
has determined fits those terms, so the `/api/wspr/spots` proxy is always on.
If WSPR.live ever objects to this use or query volume, switch to an
authorized/self-operated ingest rather than routing around the restriction.

## Feature Contract

For prediction issue hour `H`, band `B`, origin grid `T`, and target grid `R`:

| Feature | Meaning |
|---|---|
| `path_success_prev1` | exposure-weighted WSPR success rate for `(H-1, B, T, R)` |
| `path_success_prev2` | same for `H-2` |
| `path_success_prev3` | same for `H-3` |
| `path_success_prev24` | same for `H-24` |
| `path_prev*_available` | 1 only when the corresponding cell was legally constructible at issue time |
| `path_history` freshness | issue time minus the latest completed source/feature watermark used by the request |

The historical transform defines an active transmitter as a transmitter heard
by at least one receiver in the slot and an active receiver as a receiver that
decoded at least one transmitter in the slot. Positives are always retained.
Four receivers per transmitter/slot are selected deterministically for sampled
negatives, with inverse inclusion weights. Hourly grid-path successes and
opportunities are summed before the rate is calculated. The online transform
must reuse this code and pinned DuckDB/hash semantics or demonstrate replay
equivalence before it may set an availability flag to 1.

### Operational weather

Recent path history is only half of the online contract. The current product
callers provide Kp, F10.7, and sometimes Bz, while the core was trained with a
larger as-of weather vector and explicit missingness. The Railway collector
already stores a useful subset in `solar_snapshots`; Phase 3 must expose one
trusted, timestamped feature snapshot rather than assembling different subsets
in each React page.

| Operational source | Core fields |
|---|---|
| [NOAA SWPC real-time solar wind](https://services.swpc.noaa.gov/products/solar-wind/) | `bt`, `bx_gsm`, `by_gsm`, `bz_gsm`, `temperature_k`, `density_cm3`, `wind_speed` and derived pressure/field values when source-supported |
| [NOAA SWPC planetary K index](https://services.swpc.noaa.gov/json/planetary_k_index_1m.json) | `kp`, then `kp_delta_3h` and `kp_max_24h` from as-of history |
| [NOAA SWPC F10.7](https://services.swpc.noaa.gov/json/f107_cm_flux.json) | `f107` |
| [NOAA SWPC solar-cycle indices](https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json) | `sunspot_number` |
| [NOAA SWPC proton flux](https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json) | `proton_flux_10mev` |
| [NOAA SWPC Kyoto Dst product](https://services.swpc.noaa.gov/products/kyoto-dst.json) | `dst`, then `dst_min_6h` from as-of history |
| [GFZ Kp/Hp data](https://kp.gfz.de/en/data) | `ap`, `hp60`, status/provenance where operationally available |
| [NASA OMNI](https://omniweb.gsfc.nasa.gov/html/ow_data.html) | definitive historical training/evaluation context, not a low-latency live feed |

Every field carries observation time, source publication/receipt time, and
feature `available_at`. Derived windows use only snapshots available by the
prediction issue time. Unsupported AE/AL/AU/PCN or Mach/plasma fields remain
missing with their flags set; they are never filled from future definitive
OMNI data. The backend returns one weather watermark and per-source ages. A
page fetch timestamp is not evidence that every underlying measurement is
fresh.

The pure `buildOperationalWeather` transform now implements this causal subset
for `solar_snapshots`: source-specific freshness limits, separate observation
and receipt ages, per-source `available_at`, conservative watermarks, and legal
Kp/Bz/Dst backward windows. Its M5 tests, full TypeScript build, and lint pass.
It is not wired into product callers until the provenance migration is deployed
and backend replay parity passes.

## Data Flow

1. **Authorized ingest**
   Poll or subscribe using a source-approved method. Store both RF event time
   and Propulse receipt time. Reject malformed bands, callsigns, locators,
   impossible power, and timestamps outside the bounded arrival window.
2. **Immutable rolling bronze**
   Normalize into the archive schema with source, source record ID, event UTC,
   received UTC, band, callsigns, grid4, power bin, SNR, and mode. Deduplicate by
   source ID and a deterministic natural key. Retain at least 27 hours so H-24
   can be rebuilt after a delayed hourly job.
3. **Hourly exposure transform**
   At a recorded cutoff after each UTC hour, run the same positive/activity,
   deterministic receiver-sampling, inverse-weighting, and grid-path aggregate
   logic as the training pipeline. A `complete` watermark must cover the entire
   target hour; feature pages are written first and the watermark is committed
   last. Never revise a feature snapshot used by an issued prediction;
   corrections create a new `available_at` version.
4. **Feature store**
   Store hourly path cells keyed by `(target_hour, band, tx_grid4, rx_grid4,
   available_at, transform_version)`, including successes, opportunities,
   success rate, sampled/positive rows, source watermark, and quality flags.
5. **Batch lookup**
   Resolve all target grids for one origin/band in a single backend call. Return
   the four lag values, availability flags, common feature watermark, source
   age, and transform version. Cache only by issue-hour/origin/band/target-set
   and never beyond the source freshness limit.
6. **Core feature construction**
   The trusted backend, not an untrusted browser value, merges UTC geometry,
   operational weather with issuance timestamps, and recent path features.
   StationCast then applies the user's private station envelope.
7. **Profile selection**
   Select NowCast only when the provider, transform version, coverage, and age
   pass. Otherwise select physics and emit explicit provenance and lower
   confidence.

## Storage Shape

Do not expand every transmitter grid against every receiver grid globally.
Keep bounded rolling activity and positive tables, then materialize only cells
produced by the frozen sampler or requested by a batch lookup.

### `wspr_observations_rolling`

`source`, `source_id`, `event_time`, `received_at`, `slot_epoch`, `band`,
`tx_call`, `tx_grid4`, `rx_call`, `rx_grid4`, `power_bin_dbm`, `snr_db`,
`mode`, `ingest_version`.

### `wspr_path_hourly_features`

`target_hour`, `band`, `tx_grid4`, `rx_grid4`, `successes`, `opportunities`,
`success_rate`, `sampled_rows`, `positive_rows`, `available_at`,
`source_watermark`, `transform_version`, `quality_flags`.

Indexes must cover `(tx_grid4, band, target_hour desc)` and the full path key.
Raw rolling observations expire after the documented replay/recovery window;
identity-free aggregate cells may be retained for drift monitoring. Public
research exports include only aggregate cells and suppress sparse identity
groups.

## Pre-Release Validation

### A. Source and legal gate

- written authorization covers subscriber-facing use, query rate, caching,
  retention, attribution, and public aggregate research;
- the approved endpoint and contact are recorded in the release manifest;
- load tests stay below the provider's agreed rate; and
- a provider outage exercises fallback without fabricated data.

### B. Open-month replay parity

Replay October and November 2024 in event-time order without reading December
or 2025. The online job receives only records available before each simulated
issue time. On deterministic rows from each month require:

- exact lag availability-flag parity;
- maximum absolute lag-value error at or below `1e-12` when code is shared;
- otherwise a separately preregistered equivalence bound plus unchanged model
  Brier/ECE within that bound; changing the bound after seeing results is not
  allowed;
- zero future event/receipt/weather availability timestamps;
- exact UTC H-1/H-2/H-3/H-24 selection; and
- identical batch and single-path feature responses.

The same replay separately checks operational-weather names, units, missing
flags, UTC windows, and availability timestamps against the archived feature
contract. It reports degradation when the operational subset is used instead
of definitive OMNI, so the physics fallback claim reflects inputs that can
actually exist in production.

The archive lacks a reliable receipt timestamp for every historic spot. Any
replay using event time alone must be labeled optimistic. A minimum 30-day live
shadow capture with receipt timestamps is required before product enablement.

The completed replay samples every UTC hour of day from both October and
November and records exact cell, lag, causality, duplicate, late-arrival,
versioning, watermark, bounded-memory, and batch/single lookup results in
`live_feature_pipeline/replay_validation.json`. Its synthetic receipt clock is
explicitly labeled and does not satisfy the live requirement above.

### C. Operational gate

- at least 99% of scheduled hourly jobs complete before the 7,200-second stale
  boundary during the shadow window;
- duplicate/reordered/late observations are idempotent and versioned;
- lookup p95 is below 250 ms for ten single targets and below 1,000 ms for a
  4,096-cell surface batch, excluding model scoring;
- feature-store and inference-service clocks are UTC and monitored;
- bounded memory and retention are demonstrated under peak spot volume;
- NowCast coverage is reported by band, UTC hour, broad region, and distance;
  low coverage triggers physics rather than optimistic extrapolation; and
- shadow predictions retain model version, feature watermark, provider,
  profile, and station-chain fingerprint for audit.

### D. Product gate

- V4.2 must first pass the untouched December and locked 2025 archive gates;
- the live pipeline passes A-C without using prospective outcomes for tuning;
- physics and NowCast are compared in shadow mode before any UI preference;
- the globe never labels physics fallback as live NowCast;
- virtual-shack adjustments remain deterministic until consented residual data
  meet the North Star support and bias gates; and
- public documentation explains coverage, stale behavior, and source terms.

## Implementation Sequence

- [ ] Obtain and record source authorization or select a self-operated source.
- [x] Extract the archive opportunity transform into one versioned DuckDB
  library, switch the historical builder to it, and prove exact open-hour
  parity on the M5.
- [x] Use the shared transform and power-bin aggregation from a bounded hourly
  micro-batch finalizer that commits the completeness watermark last.
- [x] Add rolling bronze and hourly feature-store migrations with RLS/service
  policies, retention, and sparse-export protection.
- [x] Connect the research-permitted WSPR.live path to the implemented
  idempotent ingest, bounded hourly finalizer, atomic watermarks, and health
  metrics for internal evidence only; subscriber-facing authorization remains
  open.
- [x] Build and M5-test the pure `solar_snapshots` operational-weather
  builder with source observation/receipt times and legal rolling features.
- [x] Deploy the provenance and private WSPR feature-store migrations through
  the reviewed chain and pass post-deployment RLS/RPC verification.
- [x] Expose the operational-weather builder through the trusted model backend,
  remove browser weather/freshness claims, and pass real A6 target validation.
- [x] Add and activate the HMAC completion-manifest runner for bounded internal
  all-band finalization and prune-after-success orchestration.
- [x] Implement and real-source validate the double-gated WSPR.live research
  connector without writing the target feature store.
- [x] Validate one corrected end-to-end private-store/finalizer hour under exact
  signed per-band counts and preserve the failed first version for audit.
- [x] Add service-role-only batched path-history lookup and make the trusted
  model backend reject browser-provided lag values and freshness.
- [x] Validate the real A6 bundle, fail-closed service behavior, aggregate-only
  telemetry, migration contract, and responsive visual report on the M5.
- [x] Add and pass the October/November open-month event-time replay with
  synthetic duplicate, late-arrival, correction-version, and causal-lag cases.
- [x] Install the receipt-driven M5 hourly schedule and twice-hourly watchdog;
  pass exact target counts, owner-only runtime, multicore, and local alert gates.
- [x] Automate the signed-receipt 720-hour denominator, 99% completion rate,
  gap, stale-boundary, coverage, memory, and performance rollup.
- [x] Schedule the independent, 24-hour-query-bounded coverage/drift audit
  twice daily on the M5 and make its currency, window lag, operational health,
  private-table scope, and privacy exclusions part of the existing watchdog.
- [x] Add and deploy the service-role-only aggregate health singleton,
  replay-protected HMAC ingest, retryable alert transition outbox, secret-free
  M5 publisher boundary, and double-gated product System Health reader.
- [x] Configure and validate the protected preview endpoint from the M5 with a
  signed aggregate heartbeat, dedicated private store, and public reader off.
- [x] Invoke the authenticated off-M5 monitor from a GitHub-hosted runner and
  pass fresh-heartbeat, privacy, disabled-reader, and zero-delivery-failure
  gates; remove the temporary feature-branch trigger afterward.
- [ ] Configure an HTTPS alert destination, smoke an actual stale alert plus
  recovery and full-M5-outage delivery, then enable the independent
  server/frontend view flags; keep inference and provider gates unchanged.
- [ ] Complete the 30-day permitted receipt-time research shadow replay.
- [ ] Pass source, parity, operational, privacy, and fallback tests.
- [x] Deploy the inactive beta outcome boundary with versioned opt-in consent,
  account-bound signed prediction receipts, explicit attempts, and no
  viewed-prediction negatives. Collection remains off until authorization and
  beta approval.
- [x] Add explicit frontend/service shadow execution with aggregate-only
  telemetry and hidden model UI; requests remain on physics until the complete
  causal H-1/H-2/H-3/H-24 history window exists.
- [x] Wire trusted fresh feature responses into Band Planner and ReachMap after
  V4.2 archive approval. Both paths call the server-authoritative path-history
  provider; stale/missing history retains physics fallback, and ReachMap labels
  that profile explicitly rather than calling it NowCast.
- [x] Publish privacy-safe interim band, UTC-hour, broad-region, and distance
  coverage in the visual report from a read-only aggregate feature-store audit.
  The current 14-hour artifact is checksum-bound to the signed scheduled
  receipt window, excludes the manual validation hour, is labeled `collecting`,
  caps each database query at 24 hours before global recombination and
  suppression,
  and contains no station identity, grid-4 output, equipment, raw observations,
  or locked outcomes.
- [ ] Complete the 720-hour window and publish the preregistered non-overlapping
  early/late source-drift comparison in the final release report.

## Stop Conditions

Stop and keep physics fallback when permission is absent, replay parity fails,
source coverage is too sparse, receipt-time leakage cannot be bounded, latency
misses the product budget, or live calibration materially regresses. Do not
weaken an availability flag or silently substitute a different radio network
to make the NowCast badge appear.
