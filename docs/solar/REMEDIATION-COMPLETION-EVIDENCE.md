# Solar Weather Remediation Completion Evidence

**Status:** Implemented and verified
**Audit baseline:** [Solar weather audit register](../../SOLAR_WEATHER_AUDIT_FINDINGS.json)
**Authoritative program:** [Solar Weather Complete Remediation Plan](../plans/SOLAR-WEATHER-COMPLETE-REMEDIATION-PLAN.md)
**Completed:** 2026-07-15

## Outcome

All 30 audit findings, SW-001 through SW-030, have implemented closure behavior. Solar weather now uses one versioned data contract, one executable policy registry, one edge-handler family, one browser last-good cache, one query/model graph, and shared state-aware widgets across desktop and mobile.

The durability design deliberately avoids a paid shared cache:

    provider -> bounded edge fetch -> validation and normalization
             -> source-specific CDN policy -> versioned envelope
             -> soft/hard-TTL IndexedDB last-good cache
             -> shared query/model -> independent widget state

An outage keeps a validated last-good observation visible only until its product-specific hard usability limit. The UI shows the observation age and stale state, while unrelated sources continue independently. Once the hard limit passes, the dependent claim becomes unavailable rather than zero, quiet, or all-clear.

## Audit Finding Closure Matrix

| ID | Implemented closure | Verification evidence |
| --- | --- | --- |
| SW-001 | Solar-flux rows are validated, UTC-normalized, sorted, de-duplicated, and bounded before the newest observation is selected. | `src/lib/solar/adapters.ts`; newest-first and oldest-first fixtures in `src/lib/solar/adapters.test.ts` |
| SW-002 | Flare probabilities select the maximum valid issue time, validate the one-day horizon and 0–100 ranges, and expose the issue time. | `src/lib/solar/adapters.ts`; probability ordering/range tests; `src/pages/SolarPulse.tsx` |
| SW-003 | Magnetometer data is sorted once, constrained to a true latest-hour window, and selected by timestamp with a normalized fallback contract. | `src/lib/solar/adapters.ts`; adapter and primary/fallback endpoint tests in `api/_lib/solarHandler.test.ts` |
| SW-004 | The UI uses NOAA’s official three-hour observed/estimated/predicted Kp product. Pseudo three-hour forecasts and A-index history were removed; conversions are labeled estimated ap-equivalent, while official planetary A appears only in forecast context. | `src/lib/solar/sourcePolicies.ts`; `docs/decisions/ADR-SOLAR-DATA-TRUTH.md`; `src/pages/SolarPulse.tsx`; `src/pages/BandPlanner.tsx` |
| SW-005 | Proton data is filtered to the exact `>=10 MeV` integral channel before sorting, bounding, and S-scale interpretation. | Mixed-channel tests in `src/lib/solar/adapters.test.ts`; `src/lib/solar/selectors.test.ts` |
| SW-006 | Observation or issue time is the freshness authority. Aggregate freshness uses the oldest required input, never query resolution or cache-read time. | `src/hooks/useSolarResource.ts`; `src/hooks/projectSolarResource.ts`; `src/pages/Home.tsx`; `src/pages/SolarPulse.tsx` |
| SW-007 | IndexedDB retains soft-expired last-good envelopes, serves them on failed revalidation until hard expiry, and survives corruption, quota errors, and unavailable storage. | `src/lib/utils/idbCache.ts`; `src/lib/utils/idbCache.test.ts`; `src/lib/api/solarClient.test.ts` |
| SW-008 | Scales, alerts, latest X-ray flare, wind magnetic field, and wind plasma now use independent same-origin endpoints and the shared query/cache policy. | `api/solar/scales.ts`, `alerts.ts`, `xray-latest.ts`, `wind-mag.ts`, `wind-plasma.ts`; `src/hooks/useSolarModel.ts` |
| SW-009 | Null, successful-empty, stale, unavailable, and error are distinct. Missing values never become a valid zero; failed alerts never become “no alerts.” | `src/lib/solar/contracts.ts`; `src/components/solar/WidgetShell.tsx`; component/selector contract tests |
| SW-010 | Images use stable product URLs, declarative error/retry/backoff, metadata age, and recovery without DOM mutation or cache-busting timestamps. | `src/components/solar/SolarImageCard.tsx`; `src/components/solar/SolarImageCard.test.tsx`; `api/solar/image.ts` |
| SW-011 | Upstream calls enforce deadlines, media type, byte limits, runtime adapters, nonempty requirements, classified failures, and non-cacheable errors. | `api/_lib/solarHandler.ts`; `api/_lib/solarHandler.test.ts` |
| SW-012 | Vite exact-route middleware and deployed handlers share the same route map and contracts. The broken SDO compatibility route was replaced by the unified stable image, metadata, animation, and frame contract. | `api/_lib/solarRoutes.ts`; `vite.config.ts`; endpoint route-parity tests |
| SW-013 | Mobile starts only the six approved summary sources. Closed groups do not request nonessential products or mount charts, tables, or images. | `src/pages/SolarPulse.tsx`; deterministic mobile journey in `tests/solar/solarPulse.spec.ts` |
| SW-014 | Refresh is registry-driven over visible structured sources, reports partial success/failure, and explicitly states that imagery self-checks. | `src/hooks/useSolarModel.ts`; `src/lib/solar/widgetRegistry.ts`; desktop browser outage journey |
| SW-015 | The 1,854-line page was reduced to a 603-line declarative view. Provider parsing, derivation, refresh ownership, media lifecycle, and duplicate mobile logic moved to owned modules; one modal state remains. | `src/pages/SolarPulse.tsx`; `src/hooks/useSolarModel.ts`; `src/lib/solar/widgetRegistry.ts`; deleted `MobileSolarPulse.tsx` |
| SW-016 | Every structured solar endpoint is a thin route over shared method, CORS, timeout, validation, cache, error, and telemetry mechanics. | `api/_lib/solarHandler.ts`; `api/_lib/solarRoutes.ts`; endpoint contract suite |
| SW-017 | All series and grids have row, upstream-byte, and normalized-response ceilings. Development invokes the same adapters as deployed execution. | `src/lib/solar/sourcePolicies.ts`; `api/_lib/solarHandler.test.ts`; `docs/solar/PERFORMANCE-BASELINE.md` |
| SW-018 | Desktop and mobile use one decision-first hierarchy: current truth first, then lazy impacts, official forecasts, details, and imagery. Duplicate mobile metric ownership was removed. | `src/pages/SolarPulse.tsx`; desktop/mobile Playwright journeys |
| SW-019 | Animation manifests are bounded and validated; frames are same-origin and preloaded only around the active frame. Playback pauses when hidden and dialogs own focus, Escape, and retry behavior. | `src/components/solar/SolarAnimationPlayer.tsx`; `api/solar/animation.ts`; `src/components/ui/AccessibleDialog.test.tsx` |
| SW-020 | Solar-route, shell/vendor, CSS, and exact Workbox-precache budgets are enforced. Solar animation is lazy and route assets cache after use. | `bundle-budgets.json`; `scripts/check-bundles.mjs`; `vite.config.ts`; performance baseline |
| SW-021 | Global guidance is explicitly heuristic and path-independent. The fixed UTC day/night assumption was removed; users are routed to station/target-aware tools. | `src/lib/solar/selectors.ts`; `src/pages/SolarPulse.tsx`; `src/components/help/sections/SolarPulseSection.tsx` |
| SW-022 | Propagation Index became Global Conditions Score with disclosed 40/40/20 inputs, no hidden Bz points, reduced precision, and qualitative evidence coverage instead of an uncalibrated probability. | `src/components/solar/PropagationIndex.tsx`; `src/components/solar/modals/PropagationIndexModal.tsx`; `src/constants/tooltips.ts` |
| SW-023 | Cycle context uses the validated current monthly NOAA sunspot series, provider provenance, and an explicit as-of month. | Sunspot adapter tests; `src/pages/SolarPulse.tsx`; `src/components/solar/modals/SunspotModal.tsx` |
| SW-024 | Each resource owns its loading/refresh/stale/error state. Partial inputs remain visible, and page health derives from every critical visible source. | `src/hooks/useSolarModel.ts`; `src/components/solar/WidgetShell.tsx`; independent loading states in `src/pages/Home.tsx` |
| SW-025 | The source registry actively drives query keys, polling, soft/hard expiry, deadlines, retries, payloads, criticality, grouping, refresh, and health. | `src/lib/solar/sourcePolicies.ts`; registry tests; `src/lib/dataSourceRegistry.ts` |
| SW-026 | Scientific images use `object-contain`, preserve legends/edges, display provider time or “Age unknown,” and hide hard-expired media rather than claiming Current. | `src/components/solar/SolarImageCard.tsx`; `src/components/solar/SolarImageDetail.tsx`; their tests |
| SW-027 | Deterministic adapter, normalization, selector, policy, cache, endpoint, component, accessibility, browser, and bundle tests now cover the solar surface. An hourly provider synthetic monitor validates live deployment contracts. | 114 solar tests; `tests/solar/solarPulse.spec.ts`; `scripts/check-solar-providers.mjs`; `.github/workflows/solar-provider-synthetic.yml` |
| SW-028 | React Query plus versioned IndexedDB owns semantic freshness; Workbox uses NetworkOnly for solar JSON/text and a bounded media cache for stable images/frames. Contract mismatch is rejected safely. | `vite.config.ts`; `src/lib/api/solarClient.ts`; cache/client tests |
| SW-029 | Duplicate image, animation, modal, chart, alert, summary, mobile-page, store, and direct NOAA client paths were removed after migration. | Deleted legacy files in the program diff; consolidated exports in `src/components/solar/index.ts` and `src/components/solar/modals/index.ts` |
| SW-030 | Shared dialogs implement focus entry/return, Escape, backdrop, semantics, and scroll lock. Charts have unique labels; native controls and 44 px mobile targets are enforced. | `src/components/ui/AccessibleDialog.tsx`; accessibility/component tests; browser journey touch-target gate |

## Failure-Injection Proof

| Injected failure | Verified result |
| --- | --- |
| Reordered and duplicate time series | Latest valid timestamp still wins after sorting/de-duplication. |
| Mixed proton energy / X-ray wavelength | Exact required channel is retained; missing channel is a typed schema failure. |
| Provider 400, 404, 429, 500, or 503 | Client receives a classified retryable/non-retryable error; error responses are not cached as success. |
| Network failure or deadline | Last-good data remains stale until hard expiry; unrelated sources remain independent. |
| Wrong content type, invalid JSON, malformed forecast, invalid grid | Runtime validation rejects the response and does not overwrite last-good data. |
| Oversized structured, image, or animation response | Request is stopped or rejected at its policy budget. |
| Primary magnetometer failure | Normalized fallback succeeds; failure of both products preserves the primary classification. |
| Alerts failure | UI shows stale/unavailable state, never a false empty all-clear. |
| Image 404 followed by recovery | One declarative fallback appears and the image recovers on retry without reload. |
| Image timestamp unavailable or hard-expired | UI says Age unknown or hides expired media; it never says Current without evidence. |
| IndexedDB blocked, corrupt, or quota-limited | Network and in-memory query behavior continue without a page crash. |
| Old cached schema version | Contract guard rejects it rather than rendering incompatible data. |
| Closed mobile group | No nonessential request, SVG, table, or image starts before expansion. |
| Visible-source refresh with one outage | Successful sources refresh, failed source retains last-good data, and the result reports both outcomes. |

## Verification Record

| Gate | Result |
| --- | --- |
| `npm run lint` | Passed with zero warnings |
| `npm run test:solar -- --reporter=dot` | 15 files passed; 114 tests passed |
| `npm test -- --reporter=dot` | 16 files passed; 121 tests passed |
| `npm run build` | TypeScript and production Vite/PWA build passed |
| `npm run check:bundles` | All route, vendor, CSS, and PWA budgets passed |
| `npm run test:solar:browser` | Desktop and mobile journeys passed; two intentionally nonmatching project cases skipped |
| `node --check scripts/check-solar-providers.mjs` | Passed |
| `SOLAR_SYNTHETIC_BASE_URL=http://127.0.0.1:5173 npm run check:solar:synthetic` | 24/24 live NOAA, NASA, image-metadata, and animation contracts passed through exact local routes |
| `git diff --check` | Passed |

The live synthetic command is `npm run check:solar:synthetic`. It requires `SOLAR_SYNTHETIC_BASE_URL`; the scheduled workflow reads that value from the repository variable of the same name. This makes deployment monitoring explicit and prevents deterministic merge tests from depending on live NOAA/NASA availability.

## Operational Handoff

- Product contracts and source policy: [Provider Contracts](./PROVIDER-CONTRACTS.md)
- Scientific and product decisions: [ADR: Solar Data Truth](../decisions/ADR-SOLAR-DATA-TRUTH.md)
- Incident response and alert thresholds: [Solar Weather Operations Runbook](../runbooks/SOLAR-WEATHER-OPERATIONS.md)
- Measured bundle/mobile/payload budgets: [Performance Baseline](./PERFORMANCE-BASELINE.md)
- Live monitor configuration: set the repository variable `SOLAR_SYNTHETIC_BASE_URL` to the deployed origin. Configure `NASA_API_KEY` in the deployment to avoid DEMO_KEY capacity; telemetry emits a safe warning if it is absent.

## Residual Operating Constraint

The edge request limiter is intentionally per-isolate best effort. Edge CDN caching, browser last-good retention, payload bounds, retries, and synthetic monitoring should be measured before paying for distributed rate limiting or a shared operational cache. The runbook defines the evidence that would justify that later decision.
