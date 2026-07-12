# Model Card: Propulse Archive V3

## Status

Research model, not product-approved. Run ID: `archive_v3_eight_month`.

## Intended use

Estimate a single WSPR decode probability conditional on an observed-active
transmitter and receiver, path geometry, band, transmit-power bin, legal
prediction-time space weather, and optionally prior path state.

Suitable uses are research ranking, calibration experiments, prospective
collector comparison, and error analysis. It must not be presented as a
universal probability of completing an amateur-radio contact, emergency link
guarantee, or station-specific performance promise.

## Models

- HF geometry/weather: XGBoost, 60 features, per-band isotonic calibration.
- HF nowcast: XGBoost, 64 features including H-1/H-2/H-3/H-24 path state,
  per-band isotonic calibration.
- Independent 6m geometry/weather and nowcast models; never pooled with HF.

Calls, station IDs, and exact path IDs are excluded. Training uses fractional
success with inferred opportunities as sample weight.

## Evaluation

The frozen test is October 2024. HF nowcast weighted Brier is `0.043738`, Brier
skill over train-only band-hour climatology is `0.4352`, PR-AUC is `0.9685`,
and ROC-AUC is `0.9500`. It beats climatology on all 31 test days with a
day-block interval of `[-0.034318, -0.032340]`.

Rolling-origin nowcast skill is `0.4332` within 2019 and `0.4217` when
transferring from 2019 to April 2024. Unseen endpoint-grid Brier is `0.036225`;
unseen grid-pair Brier is `0.021884`.

## Important limitations

- Exposure is inferred; transmissions heard nowhere do not exist in the data.
- WSPR participation and equipment produce geographic and station-selection
  bias that sample weights do not remove.
- The nowcast is partly a persistence/detection model, not pure propagation.
- Short-path Brier is materially worse than long-path Brier.
- P.533/VOACAP and the prospective Propulse collector test are incomplete.
- The model was calibrated on July 2024 and tested once on October 2024; it is
  not a multi-year or live-feed calibration guarantee.
- 6m is event-selected and lacks sporadic-E-specific diagnostics.

## Release decision

Code, configs, manifests, aggregate metrics, cards, and report may be published
subject to the repository's chosen open-source license. Raw WSPR data and
derived callsign-level data must not be redistributed without a separate terms
review. Model binaries remain held back until P.533, station-holdout,
prospective-feed, privacy, and licensing checks are complete.

See [`../../../ARCHIVE-MULTIMONTH-V3-RESULTS.md`](../../../ARCHIVE-MULTIMONTH-V3-RESULTS.md)
for full methodology and caveats.
