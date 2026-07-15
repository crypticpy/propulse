# NowCast Live Feature Pipeline

> Status: design and release gates frozen before V4.2 Phase 3 candidate freeze.
> This document does not authorize a live data source or enable NowCast in the
> product. Until every release gate below passes, Propulse must mark path
> history stale and serve the packaged physics/weather profile.

> Capture hardening, 2026-07-15: the collector now selects NOAA rows by source
> observation time instead of assuming array order, parses the current Kyoto
> Dst object schema, preserves Bx and proton temperature, and stores per-source
> observation/quality provenance. Native M5 TypeScript build and all three
> source-order tests passed. Migration and deployment remain pending; this does
> not enable live NowCast.

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
free and prohibits commercial or profit-oriented use. Propulse is open-source
and nonprofit, but a donation/subscription-supported product is not assumed to
qualify. The existing `WSPR_LIVE_RESEARCH_PROXY_ENABLED` flag remains off in
production until the operator gives written permission for this exact use and
query volume. If permission is not granted, use an authorized/self-operated
ingest rather than routing around the restriction.

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
   logic as the training pipeline. Never revise a feature snapshot used by an
   issued prediction; corrections create a new `available_at` version.
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
- [ ] Extract the archive opportunity transform into one versioned library used
  by historical builds and hourly micro-batches.
- [ ] Add rolling bronze and hourly feature-store migrations with RLS/service
  policies, retention, and sparse-export protection.
- [ ] Build idempotent ingest, hourly finalizer, watermarks, and health metrics.
- [x] Build and M5-test the pure `solar_snapshots` operational-weather
  builder with source observation/receipt times and legal rolling features.
- [ ] Deploy the provenance migration and expose the builder through one
  trusted backend response; do not assemble model weather in React pages.
- [ ] Add batched path-history lookup to the trusted model backend.
- [ ] Add open-month event-time replay, then a receipt-time live shadow replay.
- [ ] Pass source, parity, operational, privacy, and fallback tests.
- [ ] Wire fresh feature responses into `buildNowCastRequests` and ReachMap only
  after V4.2 archive approval; retain physics fallback permanently.
- [ ] Publish coverage and drift evidence in the final visual report.

## Stop Conditions

Stop and keep physics fallback when permission is absent, replay parity fails,
source coverage is too sparse, receipt-time leakage cannot be bounded, latency
misses the product budget, or live calibration materially regresses. Do not
weaken an availability flag or silently substitute a different radio network
to make the NowCast badge appear.
