# Data Card: Propagation V4 Multi-Year Archive

## Scope

- Natural HF training rows: `673981409`.
- Natural HF training opportunities: `17921373181.0`.
- Nested samples: `{"20000000": 20000000, "5000000": 5000000, "50000000": 50000000}`.
- Validation sample rows: `5000000`.
- Development audits: HF `{'checks': 35, 'failures': 0}`, 6m `{'checks': 35, 'failures': 0}`.

## Sources

WSPRnet archive labels/exposure evidence, NASA SPDF OMNI2 and GFZ historical
indices, operationally timestamped NOAA/GFZ features, and a pinned ITU-R P.533
baseline. See `ml/config/propagation_v4_sources.json` and the committed source
manifest for URLs, hashes, terms, and time semantics.

## Sampling

Rows are deterministically ranked within frozen year/season/band/power/distance/
solar/geomagnetic/history strata. Nested quotas create exact 5M/20M/50M
cohorts. Training weights post-stratify sampled opportunity mass back to natural
stratum opportunity mass.

## Distribution and privacy

Raw third-party rows, callsigns, exact station identities, private locations,
and user shack inventories are excluded from the public research package.
Publish downloaders, checksums, schemas, aggregate documentation, and permitted
model artifacts only.
