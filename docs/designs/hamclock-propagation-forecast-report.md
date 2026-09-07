# HamClock Propagation Forecast report — B18 / HW-59

The Forecast Matrix tile opens a dedicated, pinnable report. Its summary shows the highest physics-scoring band six hours ahead and its relative score. The chart covers the current and next UTC calendar day with six physics band scores and a now marker. This is two UTC days, not a promise of 48 future hours from the current moment.

MATRIX provides a day selector and 24 hourly columns per day. Both days retain all six bands (288 values in the screen-reader table); visible cells remain at least 44 × 44 pixels. Cell selection and the chart's keyboard/pointer control update the selected-hour readout. The dialog fits within 90vw × 88vh without a scrolling region.

HORIZONS always includes +3, +6, +12 and +24 hours, with MODEL OFF and the applicable reason. The presentation supports probabilities/confidence/metadata when a real horizon scorer becomes available, but the current service cannot provide those values. Scoped spot counts remain evidence and are excluded from path-agreement classification.

## Serving dependency — HW-59 remains partial

Review identified that `ml/service/app.py` selects only `nowcast` or `physics` in `ModelRegistry.predict_many`; the path endpoint calls that scorer without a horizon-specific model. A future `valid_time` does not make the resulting score FutureCast. The service also advertises `futurecast.internal_available` as false.

The report therefore sends no future-time path requests, reads no cached future-time NowCast results, and reports FUTURECAST SCORER NOT AVAILABLE even if activation metadata advertises horizons. A horizon-aware endpoint/scorer and a response contract identifying its model/horizon are required before this adapter can supply future evidence. That serving work belongs to the model owner; no modeling or activation code changed here. The removed request builder must not be restored against the generic path API.

Current-hour NowCast remains available through the existing validated Reliability adapter. The best-in-six-hours summary stays PHYSICS ONLY while future evidence is unavailable. Historical model/observed series and hop count remain the separate HW-58 gaps.

## Kp and physics

Physics uses the existing two-day computation and current Kp/SFI observations. The separate Kp FORECAST fact reuses the full NOAA K-index resource, accepts only predicted points covering the selected three-hour interval, and marks stale values. It does not substitute observations for missing forecasts or alter physics inputs.

## Validation

The new scorer-boundary regression failed against the original implementation and passes after removal of future-time path requests. Six focused tests cover that boundary, capability revocation, core/personalized presentation consistency, stale metadata, matrix day selection, and Kp bucket boundaries. Earlier full verification passed 3,219 app tests; final review-fix verification is recorded in PR #502.

The review browser matrix passed 24 cases with advertised horizons but no supported scorer: all horizon rows show the reason, zero future-time path requests are sent, and no model points appear on the future chart. It also checks QTH/target, three themes, 1080p/4K, both tabs, all 288 cell labels, 44px minimum hit targets, report size, overflow, selection and focus return. No page errors occurred. Fixtures were isolated and synthetic. Earlier populated-row fixtures proved presentation only and did not establish an available FutureCast service.

![Forecast horizons at 1080p](../images/hamclock-b18/forecast-horizons-1080p.png)
