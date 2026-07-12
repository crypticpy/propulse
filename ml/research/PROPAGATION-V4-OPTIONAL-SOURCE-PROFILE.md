# Propagation V4 Optional Source Profile

Status: frozen pre-experiment review, 2026-07-12.

This review decides which optional sources may enter later ablation studies. It
does not change the preregistered M2 primary candidate and does not authorize a
source for hosted production use.

## Decision summary

| Source | Scientific value | Operational parity | Terms/access | V4 decision |
|---|---|---|---|---|
| IGS GIM/ROTI | Direct VTEC and irregularity evidence | Final products lag about 11 days; rapid products lag less than 24 hours; real-time and predicted products are separate product classes | Public product archive; attribution and product-class provenance required | Profile as M3 only. Never train with final TEC and serve with real-time TEC without a measured parity study. |
| GIRO/DIDBase | Independent `foF2`, `hmF2`, and `foEs` validation | Station coverage and autoscaling quality vary; numerical access requires an account | CC BY-NC-SA 4.0 plus data-owner acknowledgement and sharing rules | Validation-only candidate after written compatibility review. Excluded from M2, model redistribution, and hosted inference for now. |
| NOAA GFS | Refractivity and humidity fields for 6m tropo hypotheses | Four operational cycles per day; archived model versions and grids change over time | NOAA/NCEI distribution has no known data restrictions, but files and exact issuances must be archived | Preferred NWP arm for 6m. Build an issuance-aware parity dataset before training; do not backfill a live forecast with reanalysis. |
| HamSCI PSWS | Local noise, Doppler, magnetometer, and independent radio-network context | Network and instrument coverage are heterogeneous | Data are exposed through project services; a stable bulk/API and attribution contract still needs confirmation | External validation/research collaboration candidate, not a primary feature dependency. |
| NOAA 45-day Ap/F10.7 | Exogenous FutureCast inputs | Current JSON is operational and mutable | Public NOAA product | Archive forward from 2026-07-12. No official historical issuance archive was identified in this review, so historical observed values must not masquerade as forecasts. |

## IGS ionosphere arm

The [IGS product catalog](https://www.igs.org/products/) documents combined
global ionosphere maps at 5-degree longitude by 2.5-degree latitude and two-hour
cadence. It distinguishes final, rapid, real-time, and predicted products. The
[IGS ionosphere working group](https://igs.org/wg/ionosphere/) also lists final,
rapid, real-time, predicted, and ROTI products.

M3 may add path-control-point VTEC, VTEC gradient, product age, product class,
and missingness. A valid comparison must use the product that would actually
have been available at each `issue_time`. Final maps are suitable for scientific
diagnosis, not operational nowcast features. The go/no-go test is incremental
time-held-out Brier skill with source-outage fallback and no material band
regression.

## GIRO validation arm

The [GIRO Rules of the Road](https://giro.uml.edu/didbase/RulesOfTheRoad.html)
state CC BY-NC-SA 4.0 terms, require acknowledgement/data-owner involvement,
restrict sharing acquired data to current account holders, and require an
account for numerical access. Propulse's nonprofit intent does not by itself
resolve compatibility for a public model artifact or a donation-supported
hosted service.

No GIRO rows or derived model weights enter V4 until the project records written
permission or a documented legal compatibility decision. A later bounded arm
should use quality-flagged autoscaled values only for independent event and
mechanism validation, retain station provenance, and avoid redistributing raw
records.

## NOAA GFS 6m arm

The [NCEI GFS catalog](https://www.ncei.noaa.gov/products/weather-climate-models/global-forecast)
documents operational analyses and forecasts, including 0.25-degree and
0.5-degree products from four daily model cycles. [NOMADS help](https://nomads.ncep.noaa.gov/info.php?page=help)
distinguishes the monitored real-time service from longer-term NCEI archives.

The initial 6m NWP arm should extract only a bounded corridor around each path:
surface pressure, temperature, relative humidity, winds, boundary-layer height,
and vertical refractivity-gradient proxies. Store model cycle, forecast hour,
grid/version, `issued_at`, `valid_at`, retrieval hash, and `available_at`.
Compare historical issued forecasts to the current operational feed before
claiming parity. The current heuristic 6m model remains experimental until this
arm and event catalogs are available.

## HamSCI PSWS arm

The [HamSCI data page](https://www.plots.hamsci.org/data) identifies PSWS data
and aggregated amateur-radio observations, and the [PSWS overview](https://hamsci.org/psws-overview)
describes a heterogeneous distributed instrument network. This is promising
for local-noise and independent event validation, but it is not yet a reliable
production dependency. Proceed through a research collaboration with explicit
instrument quality, consent, attribution, retention, and programmatic-access
terms.

## FutureCast archive consequence

The current [NOAA 45-day JSON product](https://services.swpc.noaa.gov/json/45-day-forecast.json)
is a mutable latest issuance. The official source review did not identify a
complete historical issuance archive suitable for leakage-free 2018-2024
training. Therefore V4 archives immutable payloads forward, keeps the
`issued_at`/`valid_at` distinction, and withholds +3/+6/+12/+24-hour model claims
until enough true issued forecasts and outcomes accumulate. An observed-index
backfill may be used only as an explicitly labeled oracle diagnostic.

## Required follow-ups

1. Capture at least 90 days of NOAA forecast issuances and quantify gaps.
2. Download a bounded IGS rapid/predicted sample and compare availability and
   missingness with the live product contract.
3. Request GIRO compatibility guidance before obtaining numerical records.
4. Build a one-month GFS path-corridor extraction pilot for 6m and record cost,
   latency, coverage, and model-version changes.
5. Establish a HamSCI collaboration and data contract before ingestion.
