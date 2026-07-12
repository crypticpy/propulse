# Model Card: Propagation V4 NowCast Core

## Status

Development-only. Release approved: **no**. Primary trained cap in this report:
`50000000` rows. The detailed development gate status is
`failed`; the 2025 locked
and 2026 prospective tests are pending.

## Intended use

Estimate conditional single-decode WSPR path support for amateur-radio research
and shadow product evaluation. StationCast Stage A may adjust the open core with
a locally derived, privacy-safe station envelope.

## Not intended for

- safety-of-life or emergency-service guarantees;
- generic FT8/CW/SSB or two-way QSO probability;
- regulatory power or station-compliance decisions;
- identity, callsign, or exact-location inference.

## Training and evaluation

- Train candidates: quarterly anchors in 2018-2023.
- Development protocol: Jan/Jul 2024 early stop, split April calibration,
  October 2024 gate.
- Primary metric: opportunity-weighted Brier score.
- Baselines: band-hour climatology, pinned ITU-R P.533, and frozen V3 when its
  binaries are transferred.

## Limitations

Network participation, receiver sensitivity, local noise, labels, and path
exposure are imperfect. Predictions must expose freshness, model version,
confidence, assumptions, and OOD flags. Missing live history selects the physics
fallback rather than fabricating evidence.
- Short-path calibrated Brier regressed raw M2 on 0-500 km (+0.000153 Brier versus raw M2), 500-1500 km (+0.000287 Brier versus raw M2).
