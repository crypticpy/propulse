# Propagation V4 Development Report

Generated: 2026-07-12T14:28:44.698470+00:00

## Technical summary

This is development evidence, not a production release. The current M2 model
uses 50.0M training rows and has an October 2024
opportunity-weighted Brier score of `0.04473073023523096`.
The locked 2025 archive and 2026 prospective evaluation remain unopened.

The preregistered detailed development gate **failed** because calibrated M2 regressed raw M2 on 0-500 km (+0.000153 Brier versus raw M2), 500-1500 km (+0.000287 Brier versus raw M2). The locked 2025 test remains closed; this frozen candidate will not be tuned against its October evaluation result.

## Key findings

| Candidate | Gate | Brier | Log loss | ECE |
|---|---|---:|---:|---:|
| B0 climatology | full October gate | 0.077799 | 0.320789 | 0.005648 |
| M1 physics/weather | full October gate | 0.054912 | 0.210959 | 0.006642 |
| M2 nowcast | full October gate | 0.044731 | 0.176867 | 0.002013 |


The HTML report contains the paired P.533 comparison, learning curve,
reliability diagram, rolling folds when available, archive coverage, band
slices, 6m mechanism results, and release matrix.

## Scope and definitions

The core estimand is a single WSPR decode conditional on inferred transmitter
and receiver activity. Opportunity weights reconstruct the sampled receiver
population. This is not generic QSO probability.

## Methodology

Training covers Jan/Apr/Jul/Oct 2018-2023. January and July 2024 control early
stopping. April days 1-20 fit calibrators, April days 21-end select the
calibration family, and full April refits it. October 2024 is evaluation-only.
The locked archive is 2025; the prospective window is 2026-08-01 through
2026-09-30.

## Limitations

- The short-path calibration non-regression gate failed on 0-500 km (+0.000153 Brier versus raw M2), 500-1500 km (+0.000287 Brier versus raw M2).
- The frozen V3/B2 development comparison has not been produced.
- FutureCast lacks enough genuine issued-forecast history.
- 6m mechanism assignments are heuristic and incompletely supported.
- Product shadow, prospective, and opt-in beta evidence remain incomplete.
- Raw third-party archives and private shack records are not redistributed.

## Recommended next steps

Publish this failed candidate without changing it. Preregister a new version
that may select identity/raw calibration by distance using calibration data
only, and evaluate that version on a fresh untouched development gate. Produce
the frozen V3/B2 comparison; open 2025 only after every gate passes.
