# Personalized Propagation V4: Multi-Year Model and Product Execution Plan

> Status: execution in progress; preregistration frozen on 2026-07-12.
> Previous result: [`ARCHIVE-MULTIMONTH-V3-RESULTS.md`](ARCHIVE-MULTIMONTH-V3-RESULTS.md).
> Primary compute target: Apple M5 Max, 128 GB unified memory, with the external
> `Projects` SSD for ignored data, models, caches, and reports.
> Final deliverable: a reproducible open model and research package, a
> personalized Propulse prediction flow, and a visual HTML report.

## Handoff instruction

On the M5, point the coding agent to this file with:

> Read `ml/PERSONALIZED-PROPAGATION-V4-PLAN.md` and execute it in order. Start
> at Phase 0, update the checklists and run manifest as work completes, preserve
> every locked-test rule, do not open the 2025 archive test or the 2026
> prospective test early, and stop at any failed gate rather than tuning around
> it. Use the external `Projects` drive for all ignored data and model outputs.

The agent must also read:

- [`ARCHIVE-MULTIMONTH-V3-RESULTS.md`](ARCHIVE-MULTIMONTH-V3-RESULTS.md);
- [`ARCHIVE-MULTIMONTH-V3-PLAN.md`](ARCHIVE-MULTIMONTH-V3-PLAN.md);
- [`ARCHIVE-TRAINING.md`](ARCHIVE-TRAINING.md);
- [`ml/README.md`](README.md);
- [project `README.md`](../README.md).

No passwords, private machine addresses, user equipment records, callsigns,
precise home locations, API credentials, or private Supabase data may enter Git
history, run manifests, screenshots, or public reports.

## Executive decision

Proceed, but do not describe the next step as merely "training on 50 million
rows." V3 already trained XGBoost on a deterministic 50M-row sample drawn from
167.6M training rows. Its 20M-to-50M Brier improvement was only `0.2828%`.

V4 will hold the model training cap at 50M while changing the evidence:

1. Build a multi-year candidate pool spanning solar minimum, ascent, maximum,
   all seasons, and several WSPR network eras.
2. Sample 50M rows by declared year/season/band/power/distance/solar-regime
   strata instead of allowing dense months and paths to dominate.
3. Lock an entirely new 2025 archive test and a future 2026 prospective test.
4. Add a trusted ITU-R P.533/VOACAP baseline and operational live-data parity.
5. Connect the existing Propulse shack model through a versioned station adapter.
6. Add direct future-horizon models without leaking future observations.
7. Keep 6m as an independent research and product track.

Only increase the cap to 100M or consider a GPU/deep model if the 50M V4
learning curve, baseline comparison, and prospective tests show that data scale
rather than labels or calibration is the limiting factor.

## What Propulse already has

The product foundation is not a blank station profile. The current repository
already includes:

- multiple saved operating locations and an active location;
- owned and custom radios, power limits, modes, bands, factory specifications,
  and independent receiver measurements;
- antennas with band coverage, height, azimuth, rotatability, polarization,
  per-band gain overrides, and per-band SWR;
- feedline type, length, connectors, condition, and frequency-dependent loss;
- inline adapters, pigtails, chokes, baluns, ferrites, and insertion loss;
- amplifiers, tuners, filters, switches, and other accessories;
- ordered station chains and active presets;
- per-band ERP calculations, chain diagrams, and performance dashboards;
- Supabase synchronization and row-level security for shack records;
- a Three.js/MapLibre PropSphere with live spots, MUF, aurora, day/night, paths,
  time controls, and existing grid heatmap patterns;
- live collectors for PSK Reporter, RBN, DX cluster, and NOAA/GFZ data, plus a
  WSPR.live research proxy; a permitted first-party WSPR collector remains an
  explicit production prerequisite.

V4 must use this foundation. It must not create a second, simplified equipment
profile or a separate location system.

## Working names and product boundaries

These are code names, not final public branding:

| Working name | Responsibility | Initial horizon |
|---|---|---|
| **NowCast Core** | Open network/propagation probability from path, band, time, solar state, and legal recent observations | now through +1 hour |
| **FutureCast Core** | Open direct-horizon forecasts using only information issued by forecast time | +3, +6, +12, +24 hours |
| **StationCast** | Private-at-inference equipment/location adapter built from the active Propulse station chain | same horizons as core |
| **ReachMap** | Per-user spatial probability surface rendered on PropSphere | band, mode, and horizon selectable |
| **6m Cast** | Separate VHF mechanism and confidence model | now through +6 hours initially |

The open core model, feature definitions, evaluation, and inference code remain
freely accessible. Authentication, synchronized shack management, cached map
generation, and hosted operating services may be donation-supported. Research
claims must remain identical for hosted and self-hosted users.

## Non-negotiable scientific boundaries

- A WSPR decode probability is not automatically a QSO probability for FT8,
  CW, or SSB.
- A missing public spot is not a failed attempted contact.
- User equipment improves the link-budget estimate, but arbitrary WSPR stations
  do not publish complete radio, antenna, feedline, local-noise, or orientation
  histories. The archive cannot directly learn all equipment effects.
- Callsigns, user IDs, and exact station identities are not propagation
  features in the open core.
- Receiver/transmitter participation effects may be estimated only as
  cross-fitted nuisance terms and must be absent for held-out stations.
- No target-hour or future measurement may enter a nowcast or forecast feature.
- Forecast sources require both `issued_at` and `valid_at`; joining on
  `valid_at` alone is leakage.
- The current 6m result remains experimental and must never be folded into the
  HF model.
- Raw third-party data are not redistributed unless their terms explicitly
  allow it. Publish downloaders, hashes, schemas, and derived aggregate
  documentation instead.

## Immediate Phase 0 findings

The following issues must be corrected before station personalization:

1. `useChainPerformance`, `useStationPerformance`, and
   `useActiveStationGain` implement overlapping calculations. The last uses a
   fixed 14.1 MHz reference loss, while the others calculate per-band loss.
   One pure, tested chain engine must become canonical for UI and inference.
2. The generated Sherwood data contains physically impossible parsed noise
   floors such as `-1406`, `-14510`, and `-1416` dBm. Footnote digits appear to
   have been concatenated to decimal values. Catalog imports need range checks,
   source-cell fixtures, and quarantine rather than `pickMin` on unvalidated
   samples.
3. Current chain calculations can apply amplifier gain without consistently
   enforcing radio drive, amplifier output, supported bands, duty cycle, or the
   chain's declared operating power. V4 must calculate realizable conducted
   power, not unconstrained gain.
4. Antenna calculations use peak gain when no direction is supplied. ReachMap
   needs path-bearing gain, rotor heading, beamwidth/pattern confidence, and an
   honest fallback for unknown orientation.
5. Receiver laboratory noise-floor figures are bandwidth and test-condition
   dependent. They are relative equipment evidence, not the user's local RF
   noise. StationCast must combine receiver performance with the user's noise
   environment and later measured local noise.
6. `api/propagation/wspr.ts` generates synthetic spot-like data. It must not be
   used as live evidence or model validation and should be retired or explicitly
   labeled as a demo fixture before launch.

## Prediction contracts

### Core archive estimand

Preserve the V3 estimand for comparability:

```text
P(single WSPR decode |
  transmitter was heard active somewhere,
  receiver was heard active on this band,
  path, issue time, band, reported power,
  operationally available weather and path history)
```

Also return the probability of at least one decode over `n` declared,
approximately independent attempts:

```text
P(at least one decode in n attempts) = 1 - (1 - p_single)^n
```

This transform must display its independence assumption and must not silently
turn a two-minute WSPR probability into a generic opening percentage.

### Personalized operating estimand

The user-facing target is broader:

```text
P(successful reception or two-way contact |
  origin, target cell, valid time, band, mode,
  active station chain, declared power,
  operational features, recent network evidence)
```

V4 will approach it as a hybrid, not pretend the WSPR label already represents
it:

```text
core path support
  + physics/P.533 received-power and reliability evidence
  + station transmit EIRP and receive-system margin
  + mode-specific detection/contact calibration
  + later consented Propulse outcome residual
```

The API and UI must label which stages are active. Until mode-specific labels
pass validation, results other than WSPR are "estimated mode feasibility," not
measured QSO probability.

## Data source registry

Every source must have a registry entry with owner, purpose, URL/request,
retrieval time, checksum, parser version, time semantics, geographic coverage,
latency, update cadence, declared terms, attribution, redistribution status,
and production fallback.

### Required observation and baseline sources

| Source | V4 role | Access and handling |
|---|---|---|
| WSPRnet monthly archive | Reproducible historical WSPR labels and exposure inference | [Archive](https://www.wsprnet.org/archive/). Keep raw rows ignored; record hashes and confirm redistribution terms. |
| WSPR.live | Research query/mirror and possible operational WSPR feed | [Service and database documentation](https://wspr.live/). It permits research/projects whose results are free, prohibits commercial/profit-oriented use, and offers no availability guarantee. Nonprofit/donation status does not remove ambiguity around hosted subscriptions. Obtain written production permission or use a first-party upstream ingestion path; never make it the only live dependency. |
| Propulse WSPR collector | First-party prospective feed and production history | Existing collector and `path_hourly_stats`. Preserve event time, ingest time, source sequence/dedupe key, and outage intervals. |
| ITU-R P.533-14 | Trusted physics/reliability baseline for HF circuits | [Recommendation](https://www.itu.int/rec/R-REC-P.533-14-201908-I/en). Record version and invocation inputs; do not vendor recommendation text. |
| NTIA HF propagation models | Executable VOACAP/REC533 candidate | [NTIA software](https://its.ntia.gov/software/high-frequency/high-frequency-propagation-models/). Confirm license, build reproducibility, and Apple Silicon behavior before adoption. |
| Reverse Beacon Network | Separate CW external validation and later CW head | [RBN](https://reversebeacon.net/) and its raw archive. Do not pool CW labels with WSPR. Record terms and share research back with the community. |
| PSK Reporter | Separate digital-mode external validation and later FT8/FT4 head | [Developer information](https://www.pskreporter.info/pskdev.html). Respect request cadence; use the existing Propulse collector. |

### Required historical and real-time space weather

| Source | V4 role | Access and handling |
|---|---|---|
| NASA SPDF OMNI2 | Definitive historical solar wind and geomagnetic features | [OMNI data documentation](https://omniweb.gsfc.nasa.gov/html/ow_data.html). Use for research/reanalysis; tag definitive values so they are not confused with operational availability. |
| GFZ Kp | Kp definitive, nowcast, and forecast status | [Kp data/API](https://kp.gfz.de/en/data). Preserve status/revision and CC BY 4.0 attribution. |
| GFZ Hp30/Hp60 | High-cadence geomagnetic inputs | [Hp data/API](https://kp.gfz.de/en/hp30-hp60/data). Preserve index cadence and revision status. |
| NOAA SWPC JSON services | Operational Kp, F10.7, solar wind, Bz, GOES, aurora, proton, and forecast inputs | [JSON directory](https://services.swpc.noaa.gov/json/) and [real-time solar wind](https://www.swpc.noaa.gov/products/real-time-solar-wind). Archive the exact payload plus `observed_at`, `issued_at`, `ingested_at`, and source revision. |
| NOAA 45-day Ap/F10.7 forecast | FutureCast exogenous forecast inputs | [Product](https://www.swpc.noaa.gov/products/45-day-forecast) and [JSON](https://services.swpc.noaa.gov/json/45-day-forecast.json). Store every issuance; never backfill forecasts with observations. |
| NOAA 3-day solar/geophysical forecast | +3 to +72 hour operational conditions | Existing Propulse endpoint based on [SWPC text product](https://services.swpc.noaa.gov/text/3-day-solar-geomag-predictions.txt). Archive raw issue text and parsed values. |

### Research feature arms

These sources enter as separately ablated arms after the required baseline.

| Source | Proposed feature | Gate |
|---|---|---|
| IGS ionosphere products | Global VTEC, predicted VTEC, and ROTI/irregularity | [IGS products](https://www.igs.org/products/) and [ionosphere working group](https://igs.org/wg/ionosphere/). Distinguish final, rapid, real-time, and predicted products by latency; validate incremental skill and missing-data fallback. |
| GIRO/DIDBase | `foF2`, `hmF2`, `foEs`, and ionogram quality near path control points | [GIRO](https://giro.uml.edu/) and [rules of the road](https://giro.uml.edu/didbase/RulesOfTheRoad.html). Requires account/attribution and is CC BY-NC-SA; obtain compatibility review before inclusion in redistributed models or hosted inference. |
| NOAA GFS/HRRR or equivalent first-party NWP | Refractivity, humidity gradients, pressure, wind, and frontal structure for 6m tropo | Start from [NOAA NOMADS](https://nomads.ncep.noaa.gov/). Select one global operational product and one matching historical/reanalysis source only after a parity study. |
| HamSCI Personal Space Weather Stations | Independent local ionospheric and noise research | [HamSCI PSWS](https://hamsci.org/projects/personal-space-weather-station). Establish data access, consent, attribution, and feature quality before use. |

### Equipment evidence

| Source | V4 role | Gate |
|---|---|---|
| Sherwood Engineering receiver table | Independent receiver measurements already imported by Propulse | [Receiver test table](http://www.sherweng.com/table.html). Preserve the source cell and retrieval date, verify terms, parse footnotes structurally, and reject values outside declared physical ranges. |
| Manufacturer manuals/specifications | Bands, modes, power limits, interfaces, and declared receiver/transmitter data | Store per-model source URL, document revision, retrieval date, units, and whether a value is measured or claimed. Never silently replace an independent measurement with a factory claim. |
| Operator-entered/custom equipment | Actual installed chain, lengths, orientation, condition, power, and local constraints | Private user data. Validate ranges and units, retain user overrides separately from catalog truth, and require explicit research consent before aggregate learning. |

## Multi-year archive design

### Frozen calendar

Use the same four seasonal anchor months per year so selection does not depend
on observed model performance:

| Split | Months | Use |
|---|---|---|
| Train candidate pool | Jan/Apr/Jul/Oct of 2018-2023, 24 months | Multi-year training and rolling folds |
| Validation/calibration | Jan/Apr/Jul/Oct 2024, 4 months | Hyperparameters, ablations, calibration only |
| Locked archive test | Jan/Apr/Jul/Oct 2025, 4 months | Open once after all preregistered gates pass |
| Locked prospective test | 2026-08-01 through 2026-09-30 | Frozen archive-to-product evaluation; no tuning |

The previous October 2024 result remains valid historical evidence but is no
longer a secret test after publication. It may be used only as V4 development
and calibration data. The frozen V3 model must be scored unchanged on the 2025
test as a baseline.

If a required monthly archive is missing or corrupt, do not substitute another
month after looking at outcomes. Record the missing source and apply the
predeclared fallback: omit that same seasonal month from all comparison arms,
or move the entire run to the next fixed quarterly month before training.

### Sampling the 50M training rows

Build full exposure-aware aggregates for the 24 training months, then select a
deterministic 50M training sample using seed `20260712` and strata:

- calendar year;
- UTC season/month anchor;
- band;
- power bin;
- distance bin (`<1k`, `1-3k`, `3-6k`, `6-10k`, `>10k` km);
- solar regime from operationally reproducible F10.7 bins;
- geomagnetic quiet/active/storm regime;
- path-history availability and recent-success regime.

Sampling weights must restore the natural training distribution for the loss.
Validation, calibration, and locked tests remain at their natural distributions
and are never balanced for scoring. Report both opportunity-weighted global
metrics and unweighted stratum metrics.

### Streaming and memory plan

[Polars](https://docs.pola.rs/) remains the typed transformation and validation
layer; [DuckDB](https://duckdb.org/docs/stable/data/parquet/overview.html)
remains the large relational/aggregation engine. Pandas must not become the
primary dataframe path.

1. Store source and bronze data as month/band partitioned Zstandard Parquet.
2. Build monthly exposure aggregates independently with hard row, timestamp,
   uniqueness, and weight invariants.
3. Generate features by month and partition, never through one all-years join.
4. Write the balanced 50M training sample as shuffled, bounded Parquet shards.
5. Implement XGBoost [`DataIter`](https://xgboost.readthedocs.io/en/stable/python/python_api.html#xgboost.DataIter)
   with [`ExtMemQuantileDMatrix`](https://xgboost.readthedocs.io/en/stable/tutorials/external_memory.html)
   on the external SSD when the in-memory matrix would exceed the declared
   budget.
6. Stream predictions and additive metrics over test row groups. Compute exact
   Brier/log loss/calibration counts additively; use a declared bounded sample
   or histogram method for PR/ROC curves if exact arrays do not fit.
7. Bound process RSS to 96 GB on the M5. Stop before swap pressure threatens
   system stability.
8. Keep source, transform, feature, train, score, and report stages resumable
   and content-addressed.

Do not rent a GPU for this run. Reconsider GPU training only after the V4 50M
experiment passes and a 100M CPU/external-memory pilot demonstrates a material
learning-curve opportunity.

## Core model experiment matrix

All candidates use the same splits, label construction, sample weights, and
locked-test protocol.

| ID | Candidate | Question |
|---|---|---|
| B0 | Global and band-hour train climatology | Minimum honest baseline |
| B1 | ITU-R P.533/VOACAP output with validation-only probability mapping | Does ML beat established circuit prediction? |
| B2 | Frozen V3 physics and nowcast models | Does V3 survive a new year unchanged? |
| M1 | Multi-year 50M geometry + operational weather XGBoost | Does calendar/regime breadth improve cold-start paths? |
| M2 | M1 + legal H-1/H-2/H-3/H-24 path history | Updated NowCast Core |
| M3 | M2 + IGS TEC/ROTI research arm | Does direct ionosphere state add robust incremental skill? |
| M4 | M2 + cross-fitted station observation nuisance features | Does modeling receiver/network sensitivity help without identity leakage? |
| M5 | M2 + P.533 circuit features | Does a physics/ML hybrid improve short paths and extremes? |

XGBoost remains the primary engine. Run one constrained LightGBM comparison as
an implementation-regression check, not an open-ended framework bakeoff. Do not
add a neural network until boosted-tree scaling, labels, and operational parity
are resolved.

### Candidate refinements

- Tune band/distance-family models or interactions because V3 was weakest below
  3,000 km.
- Compare validation-only global, per-band, and hierarchical
  band-by-distance calibration with shrinkage toward the global calibrator.
- Test monotonic behavior for declared transmit power and physically monotonic
  link-margin inputs; reject constraints that harm time-held-out calibration.
- Preserve input missingness and data freshness as features.
- Add out-of-distribution flags for unseen grids, solar regimes, equipment
  values, forecast age, and network outages.
- Use temporal fold ensembles only if their improvement justifies serving cost.
- Report SHAP or gain importance by feature family, plus leave-one-family-out
  ablations; do not use importance as causal evidence.

### Required core gates before opening 2025

- exposure-weight reconstruction error within 3% for every month/band audit;
- zero split overlap and zero features with `available_at > issue_time`;
- all rolling-origin validation folds have positive Brier skill over B0;
- primary M2 beats both B1 and frozen B2 on validation Brier;
- no band loses more than 2% relative Brier versus the best simpler candidate;
- calibration error and high-confidence reliability improve or remain within a
  predeclared tolerance;
- short-path (`<3,000 km`) Brier improves by at least 3% relative over V3 on
  validation, or the report explicitly rejects that refinement;
- source-outage fallback returns bounded, calibrated probabilities with lower
  confidence rather than failing or fabricating live state.

After these gates pass, score every frozen candidate on 2025 exactly once.
There is no post-test hyperparameter tuning. A later fix requires a new version
and a new test window.

The primary endpoint is opportunity-weighted Brier score on the four 2025
months. For the multi-year M2 model to replace frozen V3/B2, the day-block
bootstrap interval for `Brier(M2) - Brier(B2)` must lie below zero and the
relative Brier improvement must be at least 1%. M2 must also beat B0 and B1 with
intervals below zero, must not regress any band by more than 5% relative Brier,
and must keep expected calibration error within `0.005` of the best validated
calibrator. If M2 fails the replacement gate, retain B2 and still publish the
multi-year result.

## FutureCast design

Train direct models for `+3`, `+6`, `+12`, and `+24` hours. Do not recursively
feed predictions into later horizons for V4.

Each training example must contain:

- `issue_time` and `valid_time`;
- only measurements whose `available_at <= issue_time`;
- the exact NOAA/GFZ/IGS forecast issuance available at `issue_time`;
- forecast age and missingness;
- time-of-day/solar geometry computed for `valid_time`;
- recent path history ending at or before `issue_time`;
- outcome labels at `valid_time`.

Compare each horizon against persistence, band-hour climatology, P.533 with
forecast inputs, and a weather-only forecast. FutureCast is released only for
horizons with positive time-held-out Brier skill and acceptable calibration.
The UI must show forecast issue time, valid time, freshness, and widening
uncertainty.

## StationCast: equipment-aware personalization

### Canonical station-chain feature contract

Create a pure shared library that accepts an immutable station-chain snapshot,
band, frequency, mode, path bearing/elevation assumptions, and requested power.
It returns:

- realizable radio drive and conducted output power;
- amplifier output after gain, max-power, supported-band, and duty-cycle limits;
- tuner/filter/switch/inline insertion losses;
- feedline loss from frequency, length, connectors, condition, and SWR;
- antenna gain toward the target, including rotor/azimuth and pattern confidence;
- power at the feedpoint, EIRP, and ERP with units labeled correctly;
- selected receiver measurement source and provenance;
- estimated receiver/system noise and mode bandwidth;
- mode threshold and link margin where supported;
- warnings, missing fields, uncertainty ranges, and a stable chain fingerprint.

The same function and fixtures must drive Shack performance UI, DX Wizard,
Band Planner, prediction API requests, and report examples. The browser must not
send the full private equipment inventory to a public endpoint. Send only the
derived, versioned feature envelope needed for inference, or perform the adapter
locally when model parity is proven.

### Three-stage personalization rollout

**Stage A: deterministic physics adapter**

Use the canonical chain engine to adjust declared transmit EIRP, directional
gain, receive margin, and mode feasibility around the open core probability.
Publish the formula and uncertainty assumptions. This is available before a
large Propulse user-outcome dataset exists.

**Stage B: calibrated mode heads**

Use separate WSPR, FT8/FT4 (PSK Reporter), CW (RBN), and later SSB/QSO labels.
Each head maps core propagation, physics link margin, and mode characteristics
to its own probability. Never relabel one network as another mode.

**Stage C: consented learned station residual**

After sufficient prospective operator data, learn a regularized residual from
coarse equipment-derived features and station history. Use grouped user/time
splits, minimum-support thresholds, hierarchical shrinkage, and a global
fallback. Do not learn a memorized user-ID lookup.

### Outcome instrumentation

Create explicit outcome types:

- `prediction_shown`;
- `attempt_started`;
- `receive_success` / `receive_failure`;
- `contact_success` / `contact_failure`;
- `not_attempted` / `unknown`.

Only an actual attempt may become a failure. A prediction that was viewed but
not tried is not a negative. Prefer objective Bridge/WSJT-X/rig/logbook events;
allow manual confirmation with a lower evidence grade. Store model version,
issue/valid time, band, mode, declared power, coarse target, chain fingerprint,
feature-envelope version, data freshness, and consent status.

## Separate 6m program

Use all available 6m data from the same 2018-2025 quarterly calendar because
6m is sparse, but preserve year-based train/validation/test splits. Do not apply
the HF 50M cap or HF calibrator.

Model and report mechanism-specific evidence:

- sporadic E: GIRO `foEs`, season, local solar time, path midpoint/control
  points, and ionogram confidence;
- auroral propagation: Kp/Hp, oval proximity, geomagnetic coordinates, Bz,
  solar wind, and recent high-latitude reports;
- tropospheric enhancement: global pressure/temperature/humidity profiles,
  refractivity gradients, inversions, wind, and path terrain/sea fraction;
- meteor scatter: known shower windows and short-lived report bursts;
- F2/TEP: TEC, `foF2`, geomagnetic latitude, solar flux, and equatorial geometry.

Start with a mixture-of-experts or mechanism classifier feeding small boosted
trees, not one undifferentiated probability. Return the likely mechanism and
confidence. Release 6m only after event and quiet-day tests both pass; a model
that predicts only event-selected network activity is not product-ready.

## Real-time feature and serving architecture

### Ingestion

Extend the existing collector rather than building a second ingestion system:

```text
WSPR / PSK Reporter / RBN / DX cluster
NOAA SWPC / GFZ / forecast issuances
optional IGS / GIRO / NWP
             |
             v
raw immutable observations + issued forecasts
             |
             v
dedupe, freshness, outage, and quality checks
             |
             v
hourly path/network aggregates and feature snapshots
```

Every observation carries `event_time`, `available_at`, `ingested_at`, source,
quality, and revision. Every forecast carries `issued_at`, `valid_at`, source,
and payload hash. Collectors expose lag, last success, row rate, duplicate rate,
and outage status to System Health.

### Serving

Use a small Python inference service/container for the XGBoost core first. It
loads versioned model/calibrator bundles, validates the feature schema, batches
paths, and emits prediction provenance. Do not force large XGBoost inference
into a Vercel edge function before parity and cold-start behavior are measured.

Required endpoints:

```text
POST /v1/propagation/path
POST /v1/propagation/surface
GET  /v1/propagation/models
GET  /v1/propagation/health
```

Each prediction response includes:

```json
{
  "model_version": "v4...",
  "feature_contract": "station-chain-v1",
  "issue_time": "...",
  "valid_time": "...",
  "band": "20m",
  "mode": "WSPR",
  "core_probability": 0.0,
  "personalized_probability": 0.0,
  "confidence": 0.0,
  "ood_flags": [],
  "data_freshness": {},
  "top_factors": [],
  "assumptions": []
}
```

When recent network data are stale, serve the physics/weather model with a
lower confidence and an explicit fallback flag. Never replace missing live data
with synthetic spots.

### Surface generation and caching

For ReachMap, batch-score a hierarchical world grid from the user's active
location. Begin coarse and refine visible/high-opportunity regions. Cache only
derived surfaces using:

```text
origin grid4 + chain fingerprint + band + mode + horizon
+ issue bucket + model version + feature snapshot hash
```

Do not place raw user equipment or exact coordinates in shared cache keys or
public logs. Use short-lived private cache authorization and coarse location
where the requested accuracy permits it.

## Supabase changes

Add migrations only after the contracts are reviewed. Proposed tables:

| Table | Purpose |
|---|---|
| `propagation_model_versions` | model/card URI, checksum, feature schema, calibration, status, license, training manifest |
| `propagation_feature_issuances` | immutable operational feature snapshots and forecast issue/valid times |
| `propagation_surface_cache` | private derived surface metadata/object URI, expiry, model version, coarse origin, chain fingerprint |
| `propagation_predictions` | sampled/audited issued predictions, provenance, freshness, no raw private inventory |
| `propagation_attempts` | consented attempt start/end, band/mode/power, coarse path, evidence grade |
| `propagation_outcomes` | receive/contact outcome linked to an attempt and prediction |
| `ml_research_consents` | versioned opt-in, allowed uses, withdrawal timestamp, retention policy |

Existing `station_chains`, equipment tables, operating locations, and
`path_hourly_stats` remain canonical. Do not duplicate them. Link a station
chain to an operating location explicitly; the current preset sync mapper leaves
`linked_location_id` null and must be corrected through a reviewed migration and
UI flow.

RLS requirements:

- users read and mutate only their predictions, attempts, outcomes, caches, and
  consents;
- public research aggregates must have minimum cohort sizes and coarse
  geography;
- service-role ingestion is isolated from user-facing clients;
- deleting/withdrawing consent prevents future training inclusion and follows a
  documented retention/deletion policy;
- public model training manifests contain aggregate counts, not station rows.

## PropSphere and product flow

### User flow

1. User selects an operating location and active station chain.
2. User selects band, mode, power, and forecast horizon with compact native
   controls already used by PropSphere.
3. Propulse derives the versioned station envelope and requests a surface.
4. ReachMap overlays probability on the globe while live spots and current MUF
   remain independently visible.
5. User scrubs now/+3/+6/+12/+24 hours; issue/valid time and freshness update.
6. Clicking a cell shows probability, uncertainty, expected signal margin when
   supported, likely mechanism, top factors, equipment assumptions, bearing,
   distance, and the best operating window.
7. Starting an operating attempt can be recorded through Bridge/WSJT-X/rig or a
   deliberate manual action, then linked to the outcome.

### Rendering requirements

- implement one surface data abstraction with Three.js globe, MapLibre flat,
  and azimuthal renderers;
- use a raster or stable hex/mesh surface with fixed resolution levels;
- encode probability by a perceptually ordered, color-blind-tested scale;
- encode uncertainty separately with opacity or a restrained pattern;
- never show high precision where the grid/model does not support it;
- preserve live-observation layers so forecast and current evidence are not
  visually conflated;
- animate only time transitions and path flow when motion adds information;
- respect reduced-motion preferences;
- keep mobile controls compact and ensure labels/tooltips do not overlap.

Before completion, use Playwright screenshots and canvas-pixel checks on desktop
and mobile for globe, flat map, azimuthal view, time animation, empty/error
states, and at least two substantially different station chains.

## Validation plan

### Offline model validation

Report at minimum:

- weighted Brier score, Brier skill, log loss, PR-AUC, ROC-AUC;
- calibration curves, expected/max calibration error, and prediction coverage;
- day-block and station/path-cluster bootstrap intervals;
- results by band, year, season, distance, solar regime, geomagnetic regime,
  geography, source freshness, history availability, and unseen endpoint/path;
- high-confidence reliability and abstention/OOD coverage;
- P.533, climatology, frozen V3, and operational fallback comparisons;
- learning curves at 5M, 20M, and 50M using nested deterministic samples;
- feature-family ablations and calibration selection using validation only.

### Station adapter validation

- golden fixtures for radios, amplifiers, lossy chains, high-SWR feedlines,
  directional antennas, unsupported bands, power limits, and missing data;
- dimensional/unit checks for dB, dBi, dBd, ERP, EIRP, watts, frequency, length,
  bandwidth, and noise;
- property tests: added passive loss cannot increase output; lower requested
  power cannot increase EIRP; amplifier limits are never exceeded; unsupported
  bands warn/fail closed;
- TypeScript/Python parity within declared numeric tolerance;
- catalog range/provenance tests that reject impossible receiver values;
- privacy tests proving raw shack snapshots never enter public logs/caches.

### Production and prospective validation

1. Shadow-run frozen V4 without showing predictions.
2. Compare archive semantics to live collector features and monitor drift.
3. Keep 2026-08-01 through 2026-09-30 unopened until the preregistered date
   window ends and the model bundle is frozen.
4. Run internal alpha with explicit feedback and outcome evidence grades.
5. Run a small opt-in beta stratified across regions, station capabilities,
   modes, and operating styles.
6. Compare core versus StationCast prospectively; personalization must improve
   calibration or decision utility, not only anecdotes.

Beta stop conditions include systematic overconfidence, privacy leakage,
equipment math errors, stale-source misrepresentation, material geographic
degradation, or mode claims unsupported by the collected outcomes.

## Final visual report and open research package

The completed run must create:

```text
ml/results/propagation_v4/<run_id>/REPORT.html
ml/results/propagation_v4/<run_id>/REPORT.md
ml/results/propagation_v4/<run_id>/model_card.md
ml/results/propagation_v4/<run_id>/data_card.md
ml/results/propagation_v4/<run_id>/run_manifest.json
ml/results/propagation_v4/<run_id>/figures/
```

The HTML report should be self-contained, accessible, and printable. Use
animations only where they explain a horizon or reliability change; provide a
static equivalent and honor reduced motion.

Required visuals:

1. calendar and solar-regime coverage of all train/validation/test months;
2. raw opportunities, sampled rows, and effective weights by band/year;
3. 5M/20M/50M learning curves with runtime and peak memory;
4. core candidate Brier/log loss/PR-AUC with uncertainty intervals;
5. reliability diagrams overall, by band, distance, and forecast horizon;
6. daily score deltas against climatology, P.533, and frozen V3;
7. short-path error analysis and before/after calibration;
8. map of geographic coverage and errors without exposing stations;
9. operational feature freshness/outage timeline;
10. equipment-chain explainer showing conducted power, losses, directional gain,
    receive margin, and resulting probability change;
11. two contrasting personalized ReachMap examples using synthetic shack
    fixtures, not real user records;
12. animated now/+3/+6/+12/+24 ReachMap comparison plus static frames;
13. 6m mechanism, event/quiet, and confidence analysis in its own section;
14. prospective shadow/beta results with evidence-grade breakdown;
15. explicit limitations, failed experiments, license/terms notes, and release
    decision.

Publish source code, configs, hashes, schemas, manifests, metric tables, model
cards, permitted model artifacts, and aggregate figures. Do not publish raw
third-party archives or private operator data. Include a complete reproduction
command and estimated storage/runtime.

## Execution phases and gates

### Phase 0: freeze, audit, and consolidate

- [ ] Tag/freeze V3 model, config, report, and checksum manifest.
- [x] Add the V4 config schema and run manifest before downloading outcomes.
- [x] Consolidate all station chain calculations into one pure engine.
- [x] Fix and validate Sherwood parsing; quarantine impossible data.
- [x] Audit equipment source licenses, provenance, units, and update dates (ambiguous Sherwood/manufacturer redistribution remains blocked from the public release unless cleared; synthetic fixtures only in research examples).
- [x] Remove or clearly isolate synthetic propagation data from product paths.
- [x] Define privacy, consent, retention, and open-research policy.
- [x] Confirm WSPR.live/upstream operational permission and fallback strategy (production blocked pending written permission; research proxy disabled by default, no synthetic fallback).

**Gate:** chain fixtures pass; catalog has no impossible values; frozen configs,
source registry, privacy policy, and test calendar are committed.

### Phase 1: source acquisition and live forecast archive

- [x] Start immutable archive of every operational forecast issuance now (local capture plus six-hour collector and immutable Supabase schema; production deployment remains a release gate).
- [x] Download/checksum the 2018-2025 quarterly WSPR months.
- [x] Acquire OMNI2 and GFZ historical inputs with status/provenance.
- [x] Build and validate P.533/VOACAP on Apple Silicon.
- [x] Profile optional IGS/GIRO/NWP sources without adding them to primary M2
  ([source profile](research/PROPAGATION-V4-OPTIONAL-SOURCE-PROFILE.md); each remains a gated ablation or validation arm).
- [x] Backfill collector outage metadata and feature availability timestamps (migration and collector RPC implemented; production application remains a deployment gate).

**Gate:** all required sources reconcile, licenses/terms are recorded, and
operational versus definitive values are distinguishable.

### Phase 2: multi-year streaming dataset

- [x] Convert and validate month/band bronze Parquet (28 development months;
  locked 2025 raw files remain unopened by transforms).
- [x] Build exposure-aware aggregates independently per month.
- [x] Re-run exact exposure audits on bounded station/slot samples (HF and 6m
  development audits each pass 35/35 checks).
- [x] Build geometry, weather, legal history, and missingness features; P.533
  remains an independently scored bounded baseline rather than a primary M2 feature.
- [x] Create the weighted, regime-balanced 50M nested sample (exact nested
  5M/20M/50M cohorts; post-stratified opportunity mass relative error
  `6.8e-14`; separate 5M validation sample).
- [x] Implement external-memory iterator and streamed scoring, including
  resumable month-partitioned feature materialization after the single-sink M3
  run exceeded memory.
- [x] Freeze validation/calibration and ignored locked-test manifests; scoped
  commands mechanically exclude locked outcomes from development execution.

**Gate:** row/weight/time invariants pass, no split leakage exists, memory stays
within budget, and a two-year smoke run reproduces expected V3 behavior.

### Phase 3: core training and locked evaluation

- [ ] Execute B0/B1/B2 and M1-M5 validation experiments.
- [ ] Select model/calibration using only 2024 development months.
- [ ] Run rolling-origin and source-outage validation.
- [ ] Check all pre-2025 gates.
- [ ] Score the frozen candidates on 2025 once.
- [ ] Decide whether a 100M experiment is scientifically justified.

**Gate:** V4 must beat climatology and P.533 on 2025 with calibrated gains, and
must not materially regress critical band/distance/geographic slices. Otherwise
retain V3/core physics and publish the failed expansion honestly.

### Phase 4: FutureCast and 6m

- [ ] Build issued-forecast examples for +3/+6/+12/+24 hours.
- [ ] Train and validate direct horizon models against persistence/baselines.
- [ ] Build separate 6m mechanism features and models.
- [ ] Freeze only the horizons/mechanisms that pass.

**Gate:** every released horizon has positive held-out Brier skill and reliable
uncertainty; 6m passes both event and quiet-day tests.

### Phase 5: inference, Supabase, and product integration

- [ ] Package core and calibrators with checksums and schema versions.
- [ ] Implement batch path/surface inference and health/fallback endpoints.
- [ ] Add reviewed Supabase migrations and RLS policies.
- [ ] Connect active location and active station chain to StationCast.
- [ ] Replace Band Planner heuristic calls with versioned predictions behind a
  feature flag while preserving an explicit fallback.
- [ ] Add ReachMap to PropSphere across globe, flat, and azimuthal views.
- [ ] Add issue/valid time, freshness, confidence, and assumptions UI.
- [ ] Instrument attempts/outcomes with opt-in consent.

**Gate:** contract, parity, privacy, RLS, accessibility, rendering, load, and
fallback tests pass locally and in staging.

### Phase 6: prospective test, beta, and publication

- [ ] Complete the frozen 2026-08-01 through 2026-09-30 evaluation.
- [ ] Run internal alpha and opt-in beta with evidence-grade outcomes.
- [ ] Compare core versus StationCast and document selection bias.
- [ ] Generate all static and animated final-report visuals.
- [ ] Publish model/data cards, reproduction guide, source registry, and report.
- [ ] Update README, research pages, changelog, and system health documentation.
- [ ] Tag the open model/research release and deploy the approved product flow.

**Gate:** release only claims supported by the archive, prospective, and beta
evidence. Failed horizons or modes remain visibly experimental or disabled.

## Compute, storage, and stop rules

Expected working storage for 32 quarterly months, derived candidates, and
resumable caches is approximately 150-300 GB. Confirm at least 400 GB free on
the external `Projects` SSD before Phase 1. Keep Git artifacts small; raw and
large derived files stay ignored with manifests committed.

The M5 Max is the default machine. The M3 may run code/unit/smoke tests and
report generation on bounded samples. Rent GPU compute only if all of these are
true:

1. V4 50M passes the scientific gates;
2. the 20M-to-50M curve is materially steeper than V3 or a new model class has a
   justified hypothesis;
3. the same data/label/calibration protocol is frozen;
4. projected benefit, cost, reproducibility, and open-source serving impact are
   documented before the run.

Stop the run rather than improvise if a source license is incompatible, the
locked test is exposed early, opportunity reconstruction fails, operational
feature parity cannot be established, memory exceeds the bound, or a product
path would disclose private station data.

## Definition of done

V4 is complete only when:

- the new 2025 archive test and 2026 prospective test are reported without
  post-test tuning;
- P.533/VOACAP, frozen V3, and climatology comparisons are reproducible;
- the selected 50M multi-year model and learning curve are documented;
- NowCast, any released FutureCast horizons, StationCast, and 6m have separate
  estimands, metrics, versioning, and limitations;
- the active Propulse location and full station chain affect predictions through
  the canonical tested feature contract;
- ReachMap works locally across all map modes with responsive visual QA;
- Supabase migrations/RLS and outcome consent pass review;
- the final visual report, model card, data card, manifests, source links,
  checksums, reproduction guide, and permitted artifacts are in Git;
- the public research package contains no secrets, raw restricted datasets, or
  private operator information;
- the release decision clearly says what is production-ready, experimental, or
  rejected.
