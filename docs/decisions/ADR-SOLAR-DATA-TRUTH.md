# ADR: Solar Data Truth and Resilience

**Status:** Accepted  
**Decision scope:** Solar Pulse data, caching, imagery, decision-support language, and operations.

## Context

The audit found scientifically incorrect record selection, incompatible route behavior, false-zero fallbacks, duplicated polling, cache deletion at the moment of failure, and model-like claims unsupported by path or calibration evidence. The remediation needed one durable set of rules that future feature work cannot quietly bypass.

## Decisions

1. **Official Kp identity.** Planetary Kp comes from NOAA’s `noaa-planetary-k-index-forecast.json`. Its observed, estimated, and predicted three-hour rows stay explicitly labeled; no minute sample is relabeled as a forecast.
2. **Planetary A semantics.** Propulse does not publish a pseudo-current A-index derived from the latest Kp. The only planetary A shown as such is NOAA’s official prediction inside the labeled three-day forecast. A Kp conversion used elsewhere is labeled “ap equivalent (estimated).”
3. **Hard usability limits are product policy.** Soft expiry starts revalidation while retaining last-good data. Hard expiry makes the product unavailable even if bytes remain cached. The approved values live in `sourcePolicies.ts` and are summarized in the provider-contract record.
4. **Mobile essentials are intentionally bounded.** A cold narrow Solar Pulse load may request only Kp, observed flux, magnetometer, long-channel X-ray, NOAA scales, and official alerts. Impacts, forecast, details, and imagery load only when revealed.
5. **Historical storage is not operational authority.** A collector or Supabase history may support analytics, but it does not silently become the source of current operational truth or last-good semantics. The same-origin edge plus bounded browser cache remains authoritative unless a separately approved product requirement changes that.
6. **Uncalibrated confidence is removed.** Global solar guidance reports evidence coverage and missing inputs, not a fixed probability. “Confidence” may return only with a named outcome, calibration data/window, and demonstrated reliability.
7. **Global and path guidance stay distinct.** Solar Pulse offers general global context and states that it is not a station-to-station forecast. Path-aware recommendations belong in PropSphere/Band Planner once station, target, time, path, band/mode, and illumination inputs are available.
8. **One dialog behavior.** All solar details use `AccessibleDialog` (directly or through `DetailModal`) for labelled titles, initial focus, focus trapping, Escape, background isolation, and focus restoration.
9. **Observability must be actionable and private.** Edge events record source, outcome, duration, response bytes, observation age, and validation. Browser events record cache outcome, source failure/recovery, and widget state. No payloads, credentials, user position, or personal data are logged. Alerting thresholds are the executable hard TTL, repeated failure, schema failure, payload/deadline breach, and checked bundle/PWA budgets.

## Consequences

- Missing is represented as null/unavailable, never quiet zero.
- One product failure cannot erase unrelated widgets.
- CDN and IndexedDB provide low-cost resilience; a paid shared cache requires measured need.
- Product changes require policy, adapter, fixture, test, documentation, and synthetic-monitor changes together.
- Compatibility routes and duplicated active UI paths are removed after production-like verification instead of being maintained indefinitely.
