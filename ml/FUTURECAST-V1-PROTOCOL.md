# FutureCast V1 issued-forecast protocol

> Status: preregistered implementation protocol. Genuine forecast acquisition
> began on 2026-07-16. Training, gate scoring, and release remain mechanically
> disabled until the first 90 consecutive common legal issuance days and their
> WSPR outcome hours have matured.
>
> Parent plan: [`PERSONALIZED-PROPAGATION-V4-PLAN.md`](PERSONALIZED-PROPAGATION-V4-PLAN.md)
>
> Frozen configuration: [`config/futurecast_v1.json`](config/futurecast_v1.json)

## Question

For an identity-free grid4 path and HF band, can a direct model issued now
predict WSPR opportunity success at +3, +6, +12, or +24 hours better than
information that was already available at issue time?

FutureCast is separate from the frozen A6 NowCast model. A horizon can be
released only on its own evidence. A failed horizon stays withheld and cannot
borrow the result of another horizon.

## Immutable data boundary

The only forecast inputs are archived NOAA products captured before prediction
time:

- [NOAA SWPC 45-day Ap/F10.7 forecast](https://services.swpc.noaa.gov/json/45-day-forecast.json);
- [NOAA SWPC three-day solar/geomagnetic forecast](https://services.swpc.noaa.gov/text/3-day-solar-geomag-predictions.txt).

Every value must retain `payload_sha256`, `issued_at`, `available_at`,
`valid_at`, parser version, product, metric, and quality. Observed OMNI, GFZ,
Kyoto, or later definitive measurements may not be substituted for a missing
historical forecast issuance.

All required metrics for one NOAA product must come from one complete payload
issuance. A newer partial payload may not be mixed with older metrics; the
latest earlier complete payload remains eligible until a new complete payload
is available.

The outcome is the exposure-aware WSPR path-hour aggregate at the hour
containing `valid_time`, derived from the authorized
[WSPR.live](https://wspr.live/) research feed. It is a fractional binomial
label:

```text
label = successes / opportunities
weight = opportunities
```

This preserves Bernoulli log-loss and Brier model comparisons without
materializing every opportunity row. Inputs may read only immutable forecast
values, completed WSPR feature watermarks, and identity-free WSPR path-hour
features. Raw WSPR observations, callsigns, station identities, equipment,
beta outcomes, and the frozen core prospective outcome store are excluded.

## Legal issue examples

A candidate prediction issue is the first `:30` UTC boundary at or after a new
required forecast product becomes available. At that boundary, both products
must have a complete issuance available no later than `issue_time` and must
cover the requested `valid_time`.

Each direct-horizon example contains:

- exact `issue_time`, `valid_time`, and horizon;
- the latest eligible value for all six forecast product/metric pairs;
- forecast issuance and availability ages;
- grid4-derived geometry and solar position computed at `valid_time`;
- path success at H-1, H-2, H-3, and H-24 only when its completed watermark
  and feature version were available by `issue_time`;
- band and calendar features; and
- the later WSPR aggregate label at `valid_time`.

No model prediction is recursively fed into a later horizon. Grid4 identifiers
remain private evaluation metadata and are excluded from the model matrix.

## Frozen evidence window and splits

Use the first qualifying run of 90 consecutive UTC capture days common to both
required products and all four horizons. Do not choose a later, cleaner, or
more favorable run.

Split by issue day, never by row:

| Block | Days | Use |
|---|---:|---|
| Train | first 60 | fit direct and weather-only models; fit train-only baselines |
| Calibration | next 15 | early stopping, isotonic calibration, threshold-free selection |
| Gate | final 15 | score exactly once after every artifact and checksum is frozen |

The 15 calibration days are also fixed chronologically: five days for XGBoost
early stopping, five days to fit isotonic calibration, and five days to select
isotonic versus identity calibration. The guard uses weighted Brier and then
weighted log loss as its deterministic tie-break. It cannot inspect the gate.

The +24-hour label for the last gate issue must be complete before the scope can
open. A metadata-only watermark preflight verifies every required outcome
hour-band before any private path labels are exported. Rows from one issue day cannot cross blocks. No fit, feature choice,
calibrator choice, or policy change may use the final gate block.

## Models and baselines

Fit one bounded CPU/OpenMP XGBoost model per horizon. The direct model uses
forecast, age, valid-time geometry/calendar, band, and legal path-history
features. A weather-only model uses the same forecast, geometry/calendar, and
band features but no recent path history.

Each horizon is compared on the full gate with:

1. path persistence from the most recent legal issue-time history, with the
   train-only climatology as its missing-history fallback;
2. train-only band-by-valid-hour climatology with a global fallback;
3. the weather-only direct model.

Pinned [ITU-R P.533](https://www.itu.int/rec/R-REC-P.533) is a separate,
required paired physics diagnostic, built from the official
[ITU-R Study Group 3 implementation](https://github.com/ITU-R-Study-Group-3/ITU-R-HF).
It uses a
deterministic sample of up to 50 paths per issue day, horizon, and band from both the
calibration and gate blocks. It is deliberately not included in the full-gate
"best baseline" selection: evaluating the external P.533 executable over every
path would be computationally wasteful, while a bounded paired diagnostic still
tests whether the learned model behaves sensibly against physics.

P.533 receives the same issued NOAA three-day F10.7 value as the learned model.
F10.7 is converted to a statistical sunspot number with the Australian Bureau
of Meteorology equation, `R = 1.61D - (0.0733D)^2 + (0.0240D)^3`, where
`D = F10.7 - 67`, then rounded and clipped to P.533's `[1, 311]` input range.
The source is <https://www.sws.bom.gov.au/Educational/2/2/5>. The diagnostic
uses an isotropic 1 W transmitter, 6 Hz bandwidth, and -28 dB required SNR.
These choices are fixed reference conditions because the identity-free path
aggregate intentionally contains no station power or equipment information.

The first ten calibration issue days fit an isotonic mapping from P.533 SNR to
WSPR success. The final five calibration issue days choose that mapping versus
raw overall circuit reliability by weighted Brier, then log loss. Gate labels
are not read while the diagnostic is generated. Missing or stale forecast
inputs select an explicit lower-confidence physics/persistence fallback; they
are never imputed from future observations.

Two XGBoost fits may run concurrently with nine native threads each. Each fit is
limited to 48 GiB RSS and their conservative combined bound is 96 GiB. Polars,
DuckDB, and P.533 may use all 18 cores for a single materialization, scoring, or
physics stage. Training and scoring stream bounded Parquet row groups from the
Projects SSD; the full dataset is never loaded into memory.
Each XGBoost task uses a fresh macOS `spawn` child (`max_tasks_per_child=1`) so
native thread pools and external-memory caches cannot leak across model fits.
Both isotonic-fit and identity-guard calibration subsplits must contain at least
10,000 rows per model. Production source, example, model, physics-diagnostic,
and gate artifacts are one-shot outputs; force-rerun flags are restricted to
synthetic development fixtures.

## Per-horizon release gates

A horizon is a release candidate only when all of these pass on the untouched
15-day gate block:

- at least 1,000,000 weighted opportunities across all 15 issue days;
- at least 0.5% relative Brier improvement over the best frozen baseline;
- issue-day paired-bootstrap upper 95% confidence bound for
  `Brier(direct) - Brier(best baseline)` below zero;
- ECE no greater than 0.03 and no more than 0.005 worse than the best baseline;
- no supported band with at least 10,000 opportunities regresses by more than
  5% relative Brier;
- source, leakage, checksum, parity, fallback, and M5 resource gates pass;
- the paired P.533 forecast-input diagnostic exists and passes integrity gates;
- all reportable uncertainty and failure slices are published.

Partial release is permitted: passing horizons may be packaged while failed
horizons remain visibly withheld. Synthetic fixtures can validate code and
privacy boundaries but carry immutable `data_scope: synthetic_fixture`; the
production-evidence gate then permanently records `release_approved: false`.
The paired bootstrap resamples whole issue days and recomputes the
opportunity-weighted Brier difference inside every replicate; it does not
average unweighted daily Brier values.

## Stop and invalidation rules

Stop and preserve the negative result when the 90-day window is incomplete,
issuance or availability time is ambiguous, WSPR authorization no longer
permits internal research, an input was available after issue time, a gate
block was read before freeze, P.533 cannot consume equivalent forecast inputs,
or scoring exceeds 96 GiB RSS, or either parallel fit exceeds 48 GiB RSS.

Any post-gate correction creates a new protocol/model version and requires a
new untouched time block. Compute availability is not permission to weaken a
gate or tune on the held-out result.
