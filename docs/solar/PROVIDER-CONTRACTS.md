# Solar Provider Contracts

**Contract version:** 1
**Executable authority:** `src/lib/solar/sourcePolicies.ts`, `src/lib/solar/adapters.ts`, and `src/lib/solar/mediaProducts.ts`
**Scope:** Every data, image, and animation product used by Solar Pulse.

## Contract rules

All structured data routes return the same versioned envelope: `schemaVersion`, `sourceId`, `provider`, `product`, normalized `data`, `observedAt`, `fetchedAt`, `sourceUrl`, and optional warnings. Required-empty, malformed, wrong-channel, wrong-content-type, oversized, and implausibly future responses are typed failures rather than successful empty data.

Time-series adapters validate timestamps, filter the exact product/channel, sort ascending, de-duplicate by timestamp, bound the retained window/rows, and derive `observedAt` from the newest retained observation. The only presentation-order exception is official alerts, which are returned newest-first after normalization. A consumer may use the last row as current only because this adapter contract guarantees chronological order.

## Structured products

| Source ID / route | Provider product and upstream | Timestamp and ordering | Channel / normalized unit | Bounds and empty rule | Role |
| --- | --- | --- | --- | --- | --- |
| `noaa-k-index` `/api/solar/k-index` | NOAA SWPC [planetary K-index forecast](https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json) | `time_tag`; ascending three-hour boundaries; current excludes `predicted` | `observed`, `estimated`, or `predicted`; Kp 0–9; optional official `a_running` | 72 rows, 96 kB upstream, 48 kB output; forecasts without a current row fail | Authoritative current and forecast Kp |
| `noaa-solar-flux` `/api/solar/flux` | NOAA SWPC [F10.7 cm flux](https://services.swpc.noaa.gov/json/f107_cm_flux.json) | `time_tag`; ascending | Exact 2800 MHz observation; sfu | 45 rows, 256 kB upstream, 32 kB output; no usable 2800 MHz row fails | Authoritative observed SFI |
| `noaa-magnetometer` `/api/solar/magnetometer` | NOAA SWPC [RTSW one-minute magnetic field](https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json); fallback: [one-day matrix](https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json) | `time_tag`; ascending true latest 65-minute window | Bz required; By/Bt independently nullable; nT | 90 rows, 2 MB upstream, 64 kB output; both sources failing preserves the primary classification | Authoritative with normalized fallback |
| `noaa-probabilities` `/api/solar/probabilities` | NOAA SWPC [solar probabilities](https://services.swpc.noaa.gov/json/solar_probabilities.json) | maximum valid `date`; one-day horizon | C/M/X flare and ≥10 MeV proton probabilities; 0–100% | One forecast, 64 kB upstream, 8 kB output; missing required probability fails | Official one-day forecast |
| `noaa-sunspots` `/api/solar/sunspots` | NOAA SWPC [solar-cycle sunspots](https://services.swpc.noaa.gov/json/solar-cycle/sunspots.json) | `time-tag`; ascending month | Monthly observed international SSN | 36 months, 750 kB upstream, 32 kB output; no valid month fails | Authoritative cycle context |
| `noaa-xray` `/api/solar/xray` | NOAA SWPC [GOES six-hour X-rays](https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json) | `time_tag`; ascending latest two-hour window | Exact 0.1–0.8 nm channel; W/m² | 120 rows, 1 MB upstream, 64 kB output; missing long channel fails | Authoritative current X-ray flux |
| `noaa-protons` `/api/solar/protons` | NOAA SWPC [GOES integral protons](https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json) | `time_tag`; ascending latest four-hour window | Exact ≥10 MeV channel; pfu | 120 rows, 1.5 MB upstream, 64 kB output; missing ≥10 MeV channel fails | Authoritative S-scale input |
| `noaa-dst` `/api/solar/dst` | NOAA SWPC / Kyoto WDC [Dst](https://services.swpc.noaa.gov/products/kyoto-dst.json) | matrix `time_tag`; ascending | Dst; nT | 72 rows, 128 kB upstream, 32 kB output; header-only or unusable rows fail | Authoritative geomagnetic context |
| `noaa-drap` `/api/solar/drap` | NOAA SWPC [global D-RAP frequencies](https://services.swpc.noaa.gov/text/drap_global_frequencies.txt) | `Product Valid At`; rectangular latitude/longitude grid | Highest affected frequency; MHz | 181 latitude rows, 750 kB upstream, 500 kB output; missing timestamp, coordinates, cells, or rectangularity fails | Official modeled impact grid |
| `noaa-flux-forecast` `/api/solar/flux-forecast` | NOAA SWPC [three-day solar/geomagnetic prediction](https://services.swpc.noaa.gov/text/3-day-solar-geomag-predictions.txt) | `Issued` plus exactly three prediction dates | Predicted 10 cm flux (sfu) and official predicted planetary A | Three days, 64 kB upstream, 24 kB output; changed/parse-empty format fails | Official forecast only |
| `nasa-cme` `/api/solar/cme` | NASA DONKI `CMEAnalysis`, 14-day window, `mostAccurateOnly=true` | `time21_5`; ascending | speed km/s, coordinates degrees, half-angle degrees | 24 events, 1 MB upstream, 160 kB output; a valid empty array means no matching event | Authoritative event analysis; fetched time owns freshness |
| `swpc-scales` `/api/solar/scales` | NOAA SWPC [current weather scales](https://services.swpc.noaa.gov/products/noaa-scales.json) | `DateStamp` + `TimeStamp` from current (`0`) set | R, S, G integer scale 0–5 or explicit null | One current set, 64 kB upstream, 16 kB output; incomplete R/S/G set fails | Authoritative current summary |
| `swpc-alerts` `/api/solar/alerts` | NOAA SWPC [alerts](https://services.swpc.noaa.gov/products/alerts.json) | `issue_datetime`; normalized then displayed newest-first | Product ID, title, bounded message, classified bulletin type | 40 items, 500 kB upstream, 160 kB output; valid empty array means no bulletins in the product | Authoritative bulletins; fetched time owns freshness |
| `swpc-xray-latest` `/api/solar/xray-latest` | NOAA SWPC [latest X-ray flares](https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json) | maximum valid `time_tag` | Current/max NOAA flare class plus begin/max/end time | One item, 128 kB upstream, 12 kB output; missing valid class fails | Official event summary; fetched time owns freshness |
| `swpc-solar-wind-mag` `/api/solar/wind-mag` | NOAA SWPC [magnetic summary](https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json) | `time_tag`; ascending | Bz or Bt required; nT | One row, 8 kB upstream/output; no usable magnetic value fails | Independent current summary |
| `swpc-solar-wind-plasma` `/api/solar/wind-plasma` | NOAA SWPC [speed summary](https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json) | `time_tag`; ascending | `proton_speed` normalized to speed; km/s | One row, 8 kB upstream/output; no usable speed/density fails | Independent current summary |

For Kp, `observedAt` is the end boundary of the latest observed or estimated three-hour interval. During the active interval that boundary can be up to three hours ahead of wall-clock time; predicted rows never determine envelope freshness. Synthetic monitoring permits exactly that product-specific interval horizon while retaining the normal five-minute future tolerance for other observations.

## Freshness and request policy

| Product group | Soft TTL | Hard usability limit | Refetch | Deadline / retries |
| --- | ---: | ---: | ---: | ---: |
| Alerts | 1 min | 10 min | 1 min | 8 s / 2 |
| Kp, magnetometer, X-ray, protons, scales, wind summaries, latest flare | 5 min | 30 min | 2 min | 8 s / 2 |
| D-RAP | 15 min | 1 h | 15 min | 8 s / 2 |
| Dst | 30 min | 2 h | 15 min | 8 s / 2 |
| Observed flux | 4 h | 24 h | 4 h | 8 s / 2 |
| Probabilities and three-day prediction | 6 h / 4 h | 24 h | 4 h | 8 s / 2 |
| CME analysis | 1 h | 6 h | 1 h | 10 s / 2 |
| Monthly sunspots | 35 d | 75 d | 1 d | 8 s / 2 |

Snapshot/event-list products marked above use `fetchedAt` for freshness because an old newest event can still be a current successful snapshot. All other products use `observedAt`.

## Media products

All images use the stable route `/api/solar/image?product=ID`; metadata uses `/api/solar/image-meta?product=ID`. The image proxy accepts image media types only, caps the response at 6 MB, forwards ETag/Last-Modified when present, and applies product-specific stale-if-error caching. Scientific images use `object-contain`, preserving legends and map edges.

| ID | Upstream / provider | Soft / hard age | Animation |
| --- | --- | ---: | --- |
| `drap-global` | NOAA [global D-RAP PNG](https://services.swpc.noaa.gov/images/d-rap/global.png) | 5 min / 1 h | `drap-global` |
| `drap-10mhz` | NOAA [10 MHz D-RAP PNG](https://services.swpc.noaa.gov/images/d-rap/global_f10.png) | 5 min / 1 h | — |
| `drap-20mhz` | NOAA [20 MHz D-RAP PNG](https://services.swpc.noaa.gov/images/d-rap/global_f20.png) | 5 min / 1 h | — |
| `aurora-north` | NOAA [northern OVATION image](https://services.swpc.noaa.gov/images/aurora-forecast-northern-hemisphere.jpg) | 5 min / 1 h | `aurora-north` |
| `synoptic-map` | NOAA [solar synoptic map](https://services.swpc.noaa.gov/images/synoptic-map.jpg) | 15 min / 2 h | — |
| `sunspot-hmi` | NASA SDO [latest HMI continuum](https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIIC.jpg) | 5 min / 24 h | — |

Animation manifests are fetched only while their accessible dialog is open, capped at 180 normalized frames, and expose only safe same-origin frame proxy URLs. `drap-global` uses NOAA’s D-RAP global manifest; `aurora-north` uses the OVATION north 24-hour manifest. Adjacent preloading is bounded, failed frames remain retryable, and all work stops on close/product change.

## Change discipline

Changing a provider URL, timestamp field, channel, unit, TTL, output shape, or empty rule is a contract change. Update the executable policy/adapter, fixtures, endpoint tests, this document, and the synthetic check together. Increment `SOLAR_SCHEMA_VERSION` when a cached response can no longer be consumed safely by the current client.
