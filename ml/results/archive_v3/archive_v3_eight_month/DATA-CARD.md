# Data Card: Propulse Archive V3

## Composition

The run uses eight non-contiguous WSPR archive months: January, April, July,
and October in 2019 and 2024. It contains 810,545,893 valid bronze spots,
273,137,641 HF path-hour/power opportunity aggregates, and 613,388 separate 6m
aggregates. OMNI2 and GFZ Hp60 provide lagged hourly environmental features.

The committed manifests contain aggregate counts, schemas, URLs, request
parameters, retrieval timestamps, source status, byte sizes, and SHA-256. Raw
data, callsign-level rows, large feature matrices, and fitted binaries are
ignored.

## Label construction

Active transmitters and receivers are inferred within each native WSPR slot and
band. All decoded pairs are retained; four active receivers are sampled
deterministically per active transmitter for candidate negatives. Negative
samples receive inverse-probability weight. Rows aggregate to hour, band,
four-character transmitter/receiver grids, and power bin.

This corrects deterministic receiver sampling but does not correct unobserved
transmitters, inactive or deaf receivers, antenna differences, local noise, or
network geography.

## Splits

- Train: four 2019 months plus January and April 2024.
- Validation/calibration: July 2024.
- Locked test: October 2024.
- Pre-test rolling folds: seasonal 2019 and 2019-to-2024 regime transfer.

## Quality

All 273,137,641 HF source rows reconcile exactly with the final feature matrix.
There are zero null target hours, non-positive/null weights, or invalid splits.
Monthly inverse-weight exposure error is between `-0.198%` and `-0.054%`.
HF validation passed 70 checks; 6m passed 66.

## Bias, privacy, and terms

WSPR callsigns and locator grids can be identifying. Callsigns are needed only
in ignored opportunity construction and are absent from the final model matrix,
metrics, and committed artifacts. Four-character grids remain in ignored model
data for evaluation; public results contain aggregates only.

WSPRnet exposes public monthly downloads but states no explicit redistribution
license on its archive index. Do not redistribute raw or row-level derived WSPR
data until terms are confirmed. NASA/SPDF acknowledgement is required. GFZ
Hp60 is CC BY 4.0 and requires attribution.

## Recommended additions

Retain callsigns only in private fold metadata for unseen-station and
cross-fitted observation-effect evaluation. Add P.533 outputs as a separate
baseline. Treat RBN, TEC, ionosonde, and collector feeds as separate sources or
heads; never pool them as interchangeable WSPR labels.
