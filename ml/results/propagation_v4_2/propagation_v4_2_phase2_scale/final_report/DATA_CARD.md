# Propulse NowCast V4.2 Data Card

## Data Roles

| Role | Time scope | Outcome use |
|---|---|---|
| Multi-year training | quarterly 2018-2023 plus legally available 2024 context | fitting only |
| Policy/calibration development | preregistered 2024 folds and August policy slice | selection only |
| Development evaluation | October-November 2024 | model selection |
| First untouched gate | December 2024 | one-shot pass/fail |
| Locked archive | January, April, July, October 2025 | one-shot final retrospective gate |
| Prospective | 2026-08-01 through 2026-09-30 | future, currently unread |

Training uses deterministic, checksum-manifested, nested 5M, 20M, and 50M
cohorts. Evaluation uses natural full-month distributions rather than balanced
samples. The final locked evidence contains `260,474,292` path-hour
rows across December and the four 2025 months.

## Outcome and Weight

Each row represents a band/path/hour opportunity where transmitter and receiver
activity can be reconstructed. The binary target is whether at least one WSPR
decode occurred. Opportunity weights represent inferred opportunity mass; all
reported Brier, log-loss, calibration, day, month, band, and distance comparisons
apply the same rows and weights to candidate and baseline.

## Primary Sources

- WSPRnet monthly archive: <https://www.wsprnet.org/archive/>
- NASA SPDF OMNI low-resolution data: <https://spdf.gsfc.nasa.gov/pub/data/omni/low_res_omni/>
- GFZ Hp30/Hp60: <https://kp.gfz.de/en/hp30-hp60/data>
- NOAA SWPC operational JSON: <https://services.swpc.noaa.gov/json/>

Raw third-party archives remain ignored and are not redistributed through this
repository. Acquisition manifests record URL, retrieval time, byte count,
SHA-256, role, and license or acknowledgement notes.

## Biases and Privacy

Receiver geography and network eras are nuisance variables, not pure propagation
measurements. WSPR overrepresents automated weak-signal operation and does not
directly estimate SSB QSO completion. Public artifacts contain no callsigns,
private station records, or exact operator locations. Learned personalization
requires separate opt-in consent and evidence.
