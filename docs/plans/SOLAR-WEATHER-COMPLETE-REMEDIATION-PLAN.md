# Solar Weather Complete Remediation Plan

**Status:** Implemented and verified  
**Primary evidence:** [Solar weather audit register](../../SOLAR_WEATHER_AUDIT_FINDINGS.json)  
**Completion evidence:** [Solar Weather Remediation Completion Evidence](../solar/REMEDIATION-COMPLETION-EVIDENCE.md)  
**Related feature backlog:** [Solar Data Quality & Sources Improvement Plan](./SOLAR-DATA-IMPROVEMENTS.md)  
**Scope:** Solar Pulse desktop and mobile experiences, all solar widgets and imagery, solar data clients and caches, Vercel-style solar endpoints, development parity, product language, testing, and operational monitoring.

## Planning Policy

This plan intentionally contains no calendar dates, delivery-duration estimates, or deadline-based phases. Work advances only when the entry criteria, acceptance criteria, and exit gate for the current stage are satisfied.

The order below is a dependency order:

1. Establish contracts and reproducible tests.
2. Restore scientific and timestamp correctness.
3. Make failure behavior durable and truthful.
4. Repair imagery, interaction, and accessibility mechanics.
5. Simplify the page architecture and responsive experience.
6. Calibrate the language and decision-support claims.
7. Prove the complete system under failure, performance, and production-like conditions.

## Mission

The finished solar weather experience must:

- Display the correct observation or forecast for the correct product, timestamp, and energy channel.
- Never turn missing, failed, or expired data into a valid zero, quiet condition, or all-clear message.
- Continue displaying a bounded last-good observation during temporary provider, network, edge, or browser-cache failures.
- Tell the user exactly when the displayed observation was made, whether it is stale, and which source supplied it.
- Degrade each widget independently so that one provider or product failure does not break unrelated widgets.
- Avoid unnecessary upstream requests, cache fragmentation, oversized payloads, and hidden mobile work.
- Give desktop and mobile users the same data truth without duplicating fetch and derivation logic.
- Clearly distinguish observed data, official forecasts, derived estimates, global heuristics, and path-specific predictions.
- Be supported by automated provider-contract, cache-state, component-state, accessibility, browser-journey, and performance checks.
- Remain inexpensive to operate by using the existing edge CDN and bounded browser storage before considering a paid shared cache.

## Definition of Complete

The remediation program is complete only when all of the following are true:

- All 30 audit findings, SW-001 through SW-030, have an implemented fix or an explicitly approved replacement behavior.
- Every solar provider adapter selects records by validated timestamps and product identity rather than array position.
- Every widget consumes the shared data-state contract and renders fresh, refreshing, stale, partial, empty, unavailable, and error states correctly.
- Every source has an approved freshness policy, request deadline, retry policy, hard usability limit, and payload budget.
- A simulated provider outage retains last-good data until its hard usability limit and then changes to unavailable without presenting false certainty.
- Development and production routes return the same media type and compatible response contract.
- Desktop-only work does not execute on mobile until the user requests the feature.
- Closed mobile panels do not mount expensive charts, tables, or image players before first expansion.
- Images use stable cache keys, recover after transient failures, preserve scientific legends, and show observation age.
- Global propagation guidance is labeled as general and heuristic unless station and target inputs support a path-aware result.
- Solar tests cover provider ordering, product channels, schema drift, stale-on-error, false-zero prevention, partial failure, imagery recovery, keyboard behavior, and the primary desktop/mobile journeys.
- Lint, tests, build, bundle checks, endpoint contract checks, accessibility checks, and failure drills pass.
- Operational metrics can identify provider staleness, schema failures, cache outcomes, widget unavailability, response size, and endpoint latency.

## Non-Negotiable Engineering Rules

1. **Timestamp beats position.** No adapter or widget may use the first or last array element as current without first validating and ordering timestamps.
2. **Filter the product before selecting the record.** Energy channel, wavelength, forecast horizon, and measurement type must be explicit.
3. **Null is not zero.** Unknown, failed, expired, and empty-success states remain distinct values throughout the stack.
4. **Forecast is a protected word.** Only an official forecast product may be labeled a forecast. Local calculations are estimates or heuristics.
5. **Observation time is the freshness authority.** Query resolution time, cache-read time, and component render time are not substitutes.
6. **Last-good data is preserved.** A soft TTL triggers revalidation; it does not destroy a valid cached observation.
7. **Hard TTL is a product decision.** Data beyond the approved usability limit becomes unavailable even if it is still physically cached.
8. **One source policy registry.** Polling, stale thresholds, deadlines, retries, payload limits, criticality, and refresh ownership must not be scattered.
9. **One data model, multiple layouts.** Desktop and mobile may arrange widgets differently but must not own separate fetch or science logic.
10. **Independent sources fail independently.** Partial success is retained and displayed.
11. **Stable URLs are the default.** Time-based query-string cache busting is prohibited unless it represents a real immutable asset version.
12. **No paid cache without evidence.** A shared persistent cache is considered only after edge-cache, client-cache, rate-limit, and failure metrics show a concrete need.
13. **Tests use fixtures, not live providers.** Scheduled synthetic checks may call providers, but the deterministic test suite must not.
14. **No big-bang page rewrite.** Data truth and contracts land before major layout refactoring.

## Target Architecture

The desired flow is:

    NOAA / NASA product
        -> edge endpoint handler
        -> provider-specific schema validation
        -> timestamp, product, channel, and ordering normalization
        -> compact versioned response envelope
        -> edge CDN with source-specific cache policy
        -> shared solar query client
        -> bounded IndexedDB last-good cache
        -> executable source status and freshness policy
        -> useSolarModel selectors and derived values
        -> WidgetShell state contract
        -> desktop and mobile layouts

Cross-cutting operational data flows from the edge handler, query client, cache, and WidgetShell into source-health metrics and synthetic checks.

### Proposed Module Boundaries

Create or evolve the following boundaries. Exact names may change during implementation, but ownership must remain clear.

| Boundary | Proposed location | Responsibility |
| --- | --- | --- |
| Solar contracts | **src/lib/solar/contracts.ts** | Versioned envelopes, source state, product identity, timestamp types, and widget state |
| Source policies | **src/lib/solar/sourcePolicies.ts** or the existing **src/lib/dataSourceRegistry.ts** | Soft/hard TTL, request deadline, retry, criticality, refresh, byte budget, and source metadata |
| Provider adapters | **src/lib/solar/adapters/** | Schema validation, product/channel filtering, timestamp normalization, sorting, de-duplication, and bounding |
| Edge handler factory | **api/_lib/solarHandler.ts** | GET/OPTIONS enforcement, CORS, timeout, response limits, cache headers, validation-error mapping, and observability |
| Browser cache | **src/lib/utils/idbCache.ts** | Preserve fresh and stale last-good envelopes with soft and hard expiry metadata |
| Solar query client | **src/lib/api/noaa.ts** or **src/lib/api/solarClient.ts** | Network/cache orchestration and normalized typed responses |
| Solar model | **src/hooks/useSolarModel.ts** plus **src/lib/solar/selectors.ts** | One query graph and one derivation layer for all layouts |
| Widget state shell | **src/components/solar/WidgetShell.tsx** | Consistent loading, refreshing, stale, partial, empty, unavailable, error, age, and refresh UI |
| Image card | **src/components/solar/SolarImageCard.tsx** | Stable image URLs, recovery, age, source, fit, and fallback |
| Modal host | **src/components/solar/SolarModalHost.tsx** | Mount only the selected chart, metric, image, or animation detail |
| Desktop/mobile views | **src/components/solar/layouts/** | Layout only; no independent provider hooks or science derivation |
| Test fixtures | **src/test/fixtures/solar/** | Captured and hand-crafted provider responses, including malformed and reordered variants |

## Canonical Data Contracts

### Provider Response Envelope

Every same-origin solar endpoint should return a versioned envelope with:

| Field | Meaning |
| --- | --- |
| schemaVersion | Contract version used for safe evolution |
| sourceId | Stable key from the source policy registry |
| provider | NOAA SWPC, NASA DONKI, or another named provider |
| product | Exact product identity, including energy or wavelength where relevant |
| data | Validated, normalized, compact payload |
| observedAt | Most recent observation or forecast issue time represented by data |
| fetchedAt | Time the edge successfully fetched the provider |
| sourceUrl | Non-secret canonical provider product URL |
| warnings | Optional validation or partial-data warnings that do not invalidate the response |

The edge response must not claim success when a required series is empty, a required channel is missing, timestamps are invalid, a parsed forecast contains no usable days, or a grid has inconsistent dimensions.

### Cached Envelope

The browser cache must retain:

| Field | Meaning |
| --- | --- |
| envelope | The last validated provider response |
| storedAt | Time the browser stored the response |
| softExpiresAt | Time background revalidation becomes necessary |
| hardExpiresAt | Time the data is no longer usable for display |
| lastAttemptAt | Most recent network attempt |
| lastAttemptError | Safe classified error metadata, never credentials or full provider payloads |

Reading an entry after soft expiry must not delete it. Cleanup may remove it only after hard expiry plus a bounded housekeeping margin.

### Widget State

Every solar widget must receive one of these states:

| State | Required behavior |
| --- | --- |
| fresh | Render data and observation age normally |
| refreshing | Keep current data visible and show quiet refresh activity |
| stale | Keep last-good data visible, show age and stale explanation, allow retry |
| partial | Render available inputs, identify missing inputs, reduce or suppress derived claims |
| empty | Confirm the request succeeded and the product is legitimately empty, such as no current alerts |
| unavailable | No usable data exists or hard expiry has passed |
| error | The current attempt failed and there is no usable last-good data |

Widgets may not infer these states from data truthiness. The query/model layer supplies the state explicitly.

### Normalized Time-Series Rules

Every time-series adapter must perform these operations in this order:

1. Validate the outer response shape and required fields.
2. Filter to the exact product, energy channel, wavelength, or forecast horizon.
3. Parse timestamps as explicit UTC instants.
4. Reject or quarantine invalid and implausibly future timestamps.
5. Sort ascending by parsed timestamp.
6. De-duplicate identical timestamps using a documented winner rule.
7. Bound by a time window and maximum row count at the edge.
8. Set observedAt from the maximum retained timestamp.
9. Return an error for an unusable empty result instead of a successful empty series.

UI components may then safely use the final normalized row as latest, because the adapter contract guarantees the order.

## Data Freshness Policy

The source registry becomes executable policy rather than documentation. The table below contains initial policy candidates based on product cadence and the existing registry. These are data-freshness windows, not project-delivery estimates. A science/product review must approve them before the contract is locked.

| Source group | Soft freshness candidate | Hard usability candidate | Required stale behavior |
| --- | --- | --- | --- |
| Official alerts | 1 minute | 10 minutes | Show last official alert set with age and failed-refresh notice |
| Kp, Bz, wind, X-ray, proton | 2–5 minutes | 30 minutes | Preserve last observation; suppress live badge when soft-expired |
| D-RAP | 15 minutes | 1 hour | Preserve last valid grid/image with timestamp |
| Dst | 30 minutes | 2 hours | Preserve last value with age |
| SFI | 4 hours | 24 hours | Preserve last issued value with observation timestamp |
| Flare probabilities | 6 hours | 24 hours | Preserve forecast with issue date |
| SFI forecast | 4 hours | 24 hours | Preserve last forecast with issue date; never call it current |
| CME analysis | 1 hour | 6 hours | Preserve event set with retrieval and event timestamps |
| Monthly sunspots/cycle context | Provider-cadence review required | Multi-day hard limit based on monthly cadence | Show as-of month; never imply minute-level freshness |
| Solar imagery | Product-cadence review required | Product-specific hard limit | Stable URL, visible image timestamp, stale badge, recoverable retry |

### Cache Decision Algorithm

1. Read the cached envelope even if soft-expired.
2. If it is before softExpiresAt, return it as fresh.
3. If it is between softExpiresAt and hardExpiresAt, return it as stale or refreshing and start one de-duplicated network request.
4. On network success, validate, normalize, store, and return the new envelope.
5. On timeout, rate limit, network failure, or provider error, keep the last-good envelope until hardExpiresAt.
6. After hardExpiresAt, return unavailable and retain only safe error/provenance metadata.
7. If IndexedDB is unavailable, continue with network and TanStack Query memory state without crashing.
8. The service worker may provide transport fallback, but it must not redefine semantic freshness.

### Conditions for Considering a Paid Shared Cache

Do not add one by default. Reconsider only if measured evidence shows one or more of the following:

- Edge cache hit rates remain inadequate despite stable URLs and correct CDN headers.
- Provider rate limits are reached under expected traffic.
- Provider outages outlast browser hard TTLs and a centrally retained snapshot is a product requirement.
- Cross-device consistency or longer historical retention becomes a defined requirement.
- Synthetic monitoring shows unacceptable edge cold-fetch failure or latency.

If that threshold is crossed, evaluate the existing collector/Supabase path before introducing another service. Historical storage and operational last-good caching are separate concerns and should not be conflated.

## Stage A — Contracts, Fixtures, and Safety Net

### Entry Criteria

- The audit register is accepted as the remediation baseline.
- No new solar feature work bypasses this plan.

### Work Package A1 — Freeze Product and Provider Contracts

**Actions**

- Inventory every solar JSON, text, grid, and image product used by desktop and mobile.
- Record the exact product identity, expected ordering, timestamp field, channel field, unit, provider cadence, and empty-response rules.
- Confirm the official NOAA products for observed three-hour Kp, predicted Kp, and daily A-index before implementing SW-004.
- Decide whether A-index should be sourced officially or removed in favor of clearly labeled estimated ap-equivalent values.
- Record whether each endpoint is authoritative, fallback, derived, or display-only.
- Reconcile the current source registry with actual query keys, routes, and widget consumers.

**Deliverables**

- A checked-in provider-contract document or typed contract map.
- An approved source policy entry for every product.
- A decision record for Kp forecast and A-index semantics.

### Work Package A2 — Build Deterministic Fixtures

**Actions**

- Capture sanitized representative responses for every provider product.
- Add explicit newest-first, oldest-first, duplicate-timestamp, malformed-row, missing-channel, empty-array, header-only, future-timestamp, and schema-change fixtures.
- Add multi-energy proton and dual-wavelength X-ray fixtures.
- Add valid and invalid forecast-text fixtures.
- Add valid, empty, and inconsistent D-RAP grid fixtures.
- Add image 200, 404, timeout, wrong content type, and recovery test cases at the component/endpoint level.
- Keep live provider requests out of deterministic tests.

### Work Package A3 — Establish the Test Layers

**Actions**

- Continue using Vitest for pure adapters, cache logic, selectors, and endpoint utilities.
- Add a DOM-capable Vitest environment and React Testing Library for WidgetShell, image, modal, and refresh-state behavior.
- Add user-event support for keyboard and pointer behavior.
- Add a browser test layer for two primary journeys: desktop Solar Pulse and narrow mobile Solar Pulse.
- Add endpoint contract tests that exercise method handling, content type, envelope shape, cache headers, and failure mapping.
- Add a scheduled synthetic provider check separate from the merge-blocking deterministic suite.

**Minimum merge checks**

- **npm run lint**
- **npm run test**
- **npm run build**
- **npm run check:bundles**
- New solar endpoint-contract test command
- New solar browser-journey command for changes that affect the page, images, dialogs, or responsive behavior

### Exit Gate A

- Every provider has at least one valid and one failure fixture.
- Ordering and channel behavior is explicit.
- Test infrastructure can exercise pure logic, DOM state, endpoints, and desktop/mobile journeys.
- The current application still builds before production behavior changes begin.

## Stage B — Restore Data Correctness and User Trust

This stage closes SW-001 through SW-006, SW-009, SW-012, SW-014, and the first required portion of SW-027.

### Work Package B1 — Shared Normalization Primitives

**Actions**

- Implement reusable timestamp parsing, ascending sort, de-duplication, bounded-window, latest-observation, and exact-channel helpers.
- Make invalid timestamps and missing required product channels typed validation errors.
- Prohibit direct array-position selection in solar adapters through code review and focused lint/search checks.
- Ensure transformations work identically with newest-first and oldest-first fixtures.

### Work Package B2 — Correct SFI, Probability, and Bz Selection

**SFI / SW-001**

- Normalize the NOAA SFI feed ascending.
- Select the current value by maximum valid timestamp.
- Return only the history needed by the chart.
- Ensure the chart reads chronologically and its period label matches retained observations.

**Flare probabilities / SW-002**

- Select the forecast with the maximum valid issue date.
- Validate required 0–100 fields.
- Display the forecast issue date and horizon.
- Treat a missing current forecast as unavailable, not zero.

**Magnetometer / SW-003**

- Normalize RTSW and fallback feeds ascending.
- Retain a true last-hour window based on timestamps rather than the last 60 source rows.
- Select the latest valid Bz after normalization.
- Preserve independent By/Bt nullability without invalidating usable Bz.
- Verify the primary and fallback adapters produce the same normalized contract.

### Work Package B3 — Correct Kp and A-Index Semantics

**Actions**

- Remove the existing two-sample “3hr Forecast” immediately.
- Stop labeling eight one-minute values as a 24-hour series.
- Use the approved official three-hour observed/predicted Kp product, or aggregate one-minute estimates into honestly labeled intervals if the official product is temporarily unavailable.
- Make observed and forecast series visually and semantically distinct.
- Source daily A-index from an approved product or replace it with “estimated ap-equivalent” language.
- Ensure chart axes, aria labels, tooltips, modal text, and help content all use the same grain and terminology.
- Add fixtures proving one-minute data cannot silently enter a three-hour or daily display.

### Work Package B4 — Correct Proton Product Selection

**Actions**

- Filter the integral proton response to the exact >=10 MeV product before sorting and bounding.
- Normalize energy labels safely while rejecting ambiguous or missing channels.
- Apply S-scale thresholds only to the validated >=10 MeV series.
- Return the selected product identity and unit in the envelope.
- Add multi-channel regression tests that place >=60 MeV last in the provider array.

### Work Package B5 — Make Freshness Truthful

**Actions**

- Replace query dataUpdatedAt as the displayed freshness source.
- Make every widget display observedAt or forecast issue time.
- For aggregate widgets, calculate freshness from the oldest required input, not the newest cache read.
- Show the number and identity of stale or missing inputs for derived scores.
- Remove or suppress “Live” whenever the required input is soft-expired, partial, or failed.
- Update page-level health from all critical visible sources instead of K-index alone.

### Work Package B6 — Eliminate False Quiet and False All-Clear States

**Actions**

- Change A-index props and internal state to preserve null instead of defaulting to zero.
- Change flare-probability props to nullable or state-aware values; zero is displayed only when the provider explicitly reports zero.
- Give alerts explicit loading, empty-success, stale, and error states.
- Use “No recent alerts reported” only after a successful current response.
- Audit every numeric widget for null-coalescing to zero.
- Audit every array widget for failed-query-to-empty-array conversion.
- Ensure derived summaries do not run when a required input is unavailable.

### Work Package B7 — Repair Development/Production Parity

**Actions**

- Replace prefix-sensitive solar proxy matching with exact route middleware, or order longest routes before shorter prefixes and cover the order with tests.
- Ensure /api/solar/flux-forecast cannot be captured by /api/solar/flux.
- Add a valid development implementation for /api/solar/sdo-image.
- Reject SPA HTML/JavaScript fallbacks and wrong content types at the client and endpoint boundary.
- Create one smoke test that checks every /api/solar route for expected status, content type, and top-level shape in both development and serverless-compatible execution.
- Document unavoidable local/production differences explicitly.

### Work Package B8 — Make Refresh Honest

**Actions**

- Drive refresh from the visible widget/source registry.
- Refresh all visible core, expanded, direct, alert, forecast, CME, and image products within their rate-limit policy.
- Show per-source refresh progress and partial failures.
- Prevent duplicate simultaneous refreshes.
- If a global refresh is not desirable, rename the control and provide scoped refresh actions whose labels match behavior.

### Exit Gate B

- SW-001 through SW-005 have regression tests and verified UI timestamps.
- No widget converts unknown or failed data to a valid zero or all-clear state.
- Freshness labels use observation/issue times.
- Kp, A/ap, and forecast terminology is scientifically honest.
- All development solar routes match their intended production contracts.
- Refresh behavior matches its label.
- Lint, tests, build, bundle checks, endpoint contracts, and the two core browser journeys pass.

## Stage C — Build the Durable, Low-Cost Data Plane

This stage closes SW-007, SW-008, SW-011, SW-016, SW-017, SW-024, SW-025, SW-028, and the operational portions of SW-027.

### Work Package C1 — Implement the Shared Edge Handler

**Actions**

- Add explicit GET and OPTIONS handling; reject unsupported methods.
- Apply a reviewed same-origin/CORS policy that supports production, approved previews, and custom domains without a hardcoded accidental lockout.
- Add request deadlines to every provider call.
- Clear timeout resources in a finally path.
- Validate response content type and enforce reasonable response-size limits.
- Map timeout, rate limit, provider 4xx/5xx, schema failure, empty-required-data, and internal errors to stable typed error bodies.
- Apply source-specific s-maxage, stale-while-revalidate, and stale-if-error headers.
- Emit safe structured telemetry for source ID, outcome, duration, provider status, payload bytes, observation age, and validation result.
- Preserve the existing per-isolate rate limiter as a best-effort guard only; document that it is not distributed protection.

### Work Package C2 — Migrate and Harden Every Solar Endpoint

Each endpoint must use the shared handler and pass its checklist:

| Endpoint | Required hardening |
| --- | --- |
| k-index | Approved product, validated timestamps, correct grain, compact window |
| flux | Newest-by-time selection, chronological history, compact fields/window |
| probabilities | Current forecast by maximum issue date, range validation |
| sunspots | Bound response for actual UI needs or serve a documented historical endpoint separately |
| magnetometer | Primary/fallback adapter parity, chronological last-hour window, timeout |
| protons | Exact >=10 MeV filter before bounding |
| xray | Exact required wavelength channel, chronological window, compact response |
| dst | Validate header/rows, timestamp order, nonempty output |
| drap | Validate timestamp, coordinates, row widths, grid dimensions, and nonempty cells |
| cme | Configure NASA key safely, add deadline and schema validation, bound event period and fields |
| flux-forecast | Reject parse-empty or format-changed responses instead of returning a misleading 200 |
| sdo-image | Clear deadline reliably, validate image content type, preserve safe stale-if-error behavior |

Do not cache provider error bodies as successful product responses.

### Work Package C3 — Proxy the Five Direct Operational Feeds

**Actions**

- Add same-origin endpoints for NOAA scales, official alerts, latest X-ray flare classification, solar-wind magnetic data, and solar-wind plasma data.
- Give each product its own adapter, query key, source policy, and independent state.
- Fetch wind magnetic and plasma products independently or in parallel without a shared failure outcome.
- Migrate them from page-level effects to TanStack Query through the common solar client.
- Preserve partial success if one wind source fails.
- Remove cache:no-store browser behavior unless the approved source policy requires it.
- Stop all desktop-only direct polling on mobile unless the user reveals a dependent feature.

### Work Package C4 — Upgrade IndexedDB to Soft/Hard TTL

**Actions**

- Store the full cached-envelope metadata.
- Return soft-expired entries with a stale marker instead of null.
- Revalidate in a de-duplicated request.
- Serve last-good data after network, timeout, provider, rate-limit, or validation failure until hard expiry.
- Keep schema-version migration and invalidation explicit.
- Bound entries by source, rows, age, and approximate bytes.
- Handle private browsing, quota exceeded, blocked IndexedDB, and corrupted entries without crashing.
- Add cache inspection and targeted source invalidation for diagnostics.

### Work Package C5 — Make the Registry Executable

**Actions**

- Consolidate source ID, provider, product, query key, endpoint, criticality, soft TTL, hard TTL, request deadline, refetch cadence, retry policy, max rows, max bytes, and affected widgets.
- Derive staleness continuously from observedAt and the policy; remove the currently unused staleness action path or wire it completely.
- Track last success, last attempt, last error, recovery, current cache tier, and observation age.
- Persist last-good provenance with data while keeping transient UI error state lightweight.
- Add selectors for visible-source health, aggregate-widget health, and global page health.
- Make all refresh behavior and mobile query enablement registry-driven.

### Work Package C6 — Support Partial Input Models

**Actions**

- Replace the global OR loading state with per-widget required/optional input declarations.
- Keep available metrics visible while another source loads or fails.
- Make derived scores declare which inputs are present, missing, stale, or substituted.
- Prohibit hidden neutral-value substitution for missing Bz or other inputs.
- Compute page health from source criticality and visible dependencies.

### Work Package C7 — Reduce Payloads at the Edge

**Actions**

- Filter unused fields, channels, and history before serialization.
- Separate current-value products from historical-series products where their payload needs differ.
- Enforce max rows and max bytes in source policy.
- Use compression-friendly stable shapes.
- Record response bytes and validation-drop counts.
- Add bundle-independent endpoint byte-budget checks.
- Ensure the development proxy exercises the same compact transforms instead of returning oversized raw provider payloads.

### Work Package C8 — Clarify Service Worker Ownership

**Actions**

- Treat the service worker as a transport cache, not the authority for data freshness.
- Replace the single five-minute API policy with source-aware same-origin behavior or allow the query/IndexedDB layer to own solar semantics.
- Include proxied operational data and selected images only when their source policy supports offline use.
- Bound runtime cache entries by count, bytes where practical, and hard TTL.
- Verify an application update does not retain contract-incompatible cached responses.
- Document cache clearing and migration behavior.

### Work Package C9 — Add Source Observability

**Record**

- Provider fetch duration and status.
- Response content type and bytes.
- Validation success/failure and reason.
- Latest observation age at fetch time.
- Edge cache outcome when available.
- Browser cache outcome: fresh hit, stale hit, revalidated, stale served on error, hard expired, miss.
- Widget state counts: fresh, stale, partial, unavailable, error.
- Recovery duration and consecutive failures.

Do not log complete provider payloads, credentials, user location, or personal data.

### Exit Gate C

- Every solar JSON/text feed uses the same normalized query/cache/status path.
- A forced outage serves last-good data until hard expiry and displays its age.
- Independent products degrade independently.
- Every endpoint has a deadline, schema check, method policy, and bounded payload.
- Registry staleness is active and visible.
- Mobile no longer performs unused direct operational polling.
- PWA and IndexedDB responsibilities are documented and tested.
- Source-health telemetry can identify stale data, schema drift, cache behavior, and endpoint cost.

## Stage D — Rebuild Image, Animation, Modal, and Accessibility Mechanics

This stage closes SW-010, SW-019, SW-026, SW-029, and SW-030.

### Work Package D1 — Create SolarImageCard

**Actions**

- Replace six duplicated image figures and imperative onError handlers with one declarative component.
- Use a stable same-origin proxy URL or a provider version derived from ETag/Last-Modified, never a minute counter.
- Preserve cacheability across refreshes and sessions.
- Track loading, fresh, stale, unavailable, error, and retrying states.
- Restore the image automatically after a transient error.
- Ensure only one fallback is rendered.
- Show product observation time, age, source, and state.
- Use object-contain for scientific maps and retain legends/edges.
- Remove “Live” when the product is stale or unavailable.
- Provide meaningful alt text and a concise visible caption.

### Work Package D2 — Proxy and Revalidate Images Correctly

**Actions**

- Define product-specific image policies.
- Forward or derive ETag, Last-Modified, content type, and safe cache headers.
- Validate that image endpoints never return SPA HTML/JavaScript as a successful image.
- Use stale-if-error for a bounded product-specific period.
- Avoid unbounded query-string cache keys.
- Add a manual and automated recovery case: image fails, provider recovers, the same tile becomes visible again.

### Work Package D3 — Harden AnimationModal

**Actions**

- Fetch the manifest only when the modal opens.
- Add abort behavior for manifest and frame requests.
- Preload a small adjacent-frame buffer with bounded concurrency.
- Do not mark failed frames as successfully preloaded.
- Add retry/backoff for transient frame failures.
- Cap the image cache and clear it on close or product change as appropriate.
- Eliminate mutable-Set callback races.
- Stop playback and requests when hidden or closed.
- Preserve a usable static thumbnail when animation is unavailable.
- Display the frame timestamp in UTC with a clear date.

### Work Package D4 — Standardize Dialog and Keyboard Behavior

**Actions**

- Use the shared accessible dialog primitive for focus entry, focus trap, Escape, labelled title, and focus restoration.
- Do not globally intercept Space while a button, link, input, slider, or editable control owns it.
- Use native buttons for map/image activation where possible.
- Support Enter and Space consistently for remaining role=button elements.
- Make chart aria labels use unique full timestamps rather than repeated rounded hours.
- Verify visible focus, zoom, reduced motion, screen-reader names, and touch targets.

### Work Package D5 — Consolidate Modal and Image Implementations

**Actions**

- Select one image/animation viewer contract.
- Migrate active use cases.
- Remove unused AnimatedImagePlayer and ImageModal exports after confirming no consumers.
- Replace the many page-level booleans with one discriminated active-modal state.
- Mount only the active detail modal.
- Remove duplicated component-local style blocks when shared styles exist.

### Exit Gate D

- Stable image URLs achieve repeat cache hits.
- A transient image failure recovers without reload.
- All scientific images retain full legends/edges and show timestamps.
- Animation loading is bounded, abortable, and memory-capped.
- Dialog focus and keyboard behavior pass automated and manual accessibility checks.
- Only one maintained image/modal path remains.

## Stage E — Simplify Page Architecture and Responsive Performance

This stage closes SW-013, SW-015, SW-018, and SW-020 while completing relevant portions of SW-024 and SW-030.

### Work Package E1 — Introduce useSolarModel

**Actions**

- Move all provider hooks out of SolarPulse page layout branches.
- Create one query graph shared by desktop and mobile.
- Centralize current-value selection, derived classifications, widget dependencies, and refresh commands.
- Memoize derived series and scores from normalized inputs.
- Expose view-ready resources, not raw query objects, to layouts.
- Remove duplicated proton, Dst, forecast, and chart transformations from MobileSolarPulse.

### Work Package E2 — Create a Widget Registry and WidgetShell

Each widget definition should declare:

- Stable ID and title.
- Source dependencies and which are required/optional.
- Desktop and mobile placement.
- Whether it is essential above the fold.
- Query enablement rule.
- Render-on-expand policy.
- Help/copy key.
- Detail modal type.
- Refresh behavior.
- Error/stale/empty policy.

WidgetShell owns shared header, age, source, state, retry, and accessible status behavior.

### Work Package E3 — Make SolarPulse Declarative

**Actions**

- Reduce SolarPulse to model orchestration, responsive layout selection, and modal host.
- Move provider parsing and polling out of the page.
- Move scientific derivation into selectors with unit tests.
- Move image state into SolarImageCard.
- Replace repeated status/color calculations with shared tested utilities.
- Keep desktop and mobile components focused on order and presentation.

### Work Package E4 — Defer Mobile Work

**Actions**

- Replace always-mounted details children with render-on-first-open panels.
- Use query enabled rules so nonessential data is not fetched before its widget is visible.
- Ensure closing a panel does not destroy useful cached data but can stop animation and expensive live work.
- Remove the duplicate mobile metric block or make the compact strip the single above-the-fold summary.
- Preserve native disclosure semantics and keyboard behavior.
- Remember expansion state only if doing so improves return visits without forcing expensive work on initial load.

### Work Package E5 — Reframe the Information Architecture

Use the following decision hierarchy:

1. **Now:** overall source health, key current observations, observation ages, and important changes.
2. **Impacts:** global HF implications, active alerts, absorption, radiation/geomagnetic effects.
3. **Forecast:** official forecast products with issue dates and horizons.
4. **Details:** historical charts, cycle context, model details, and raw values.
5. **Imagery:** maps and animations with timestamps and source status.

Desktop may show more groups concurrently. Mobile should expose the same hierarchy progressively rather than hide features after paying their cost.

### Work Package E6 — Establish Performance Budgets

**Actions**

- Record a reproducible baseline for route JS, CSS, PWA precache, request count, payload bytes, main-thread time, DOM/SVG count, image bytes, and mobile memory.
- Set reviewed budgets for the Solar Pulse route and application shell.
- Fail CI on unapproved budget regressions.
- Lazy-load secondary panels, image/animation code, and modal content.
- Investigate why the main index chunk exceeds the warning limit and whether solar dependencies leak into the shell.
- Remove nonessential assets from install-time precache and use bounded runtime caching.
- Verify the collapsed mobile page does not contain hidden chart SVGs and tables.
- Verify mobile initial load does not request desktop-only operational feeds or images.

### Exit Gate E

- Desktop and mobile consume one model and one set of derived values.
- SolarPulse no longer owns provider parsing, multiple polling effects, image lifecycle, and numerous modal booleans.
- Closed mobile panels do not mount expensive widget contents.
- Initial mobile requests are limited to approved essential sources.
- The first viewport answers current conditions, source trust, and important impacts without duplicate metrics.
- Bundle, PWA, request, payload, DOM, and interaction budgets pass.

## Stage F — Correct Writing, Heuristics, and Decision-Support Claims

This stage closes SW-021, SW-022, and SW-023 and standardizes the writing suggestions across the audit.

### Work Package F1 — Establish Solar Content Rules

**Required terminology**

- Use “observed” for measured data.
- Use “forecast” only for an official forecast product.
- Use “estimated” for derived values.
- Use “global indicator” or “general guidance” when station/path context is absent.
- Use “as of” with an explicit UTC timestamp or issue date.
- Use “unavailable” rather than zero when data is missing.
- Use “no alerts reported” only for a successful current empty response.
- Use consistent sentence case, unit formatting, UTC formatting, and product names.

**Prohibited unsupported claims**

- “Live” without a fresh observation.
- “Should be open” without path and illumination context.
- “Confidence” expressed as a precise probability without calibration.
- “Analytical models” when the displayed number is a fixed constant.
- A generic good/excellent condition that hides missing required inputs.

### Work Package F2 — Reframe Propagation Guidance

**Actions**

- Label current global SFI/Kp/Bz output as a general conditions heuristic.
- State that results are not path-specific when station and target are absent.
- Remove the fixed 06:00–18:00 UTC day/night assumption.
- When station location exists, use local solar illumination.
- When station and target both exist, route users to the path-aware model and include path, time, season, mode, and relevant noise inputs.
- Keep polar-path and regional caveats visible where they materially affect the recommendation.

### Work Package F3 — Rework Propagation Index and Confidence

**Actions**

- Rename Propagation Index to a clearly heuristic “Global Conditions Score” unless it is formally validated.
- Publish its inputs, weighting, missing-input behavior, and intended use.
- Do not grant hidden neutral points for missing Bz.
- Reduce precision to the level supported by the model.
- Replace the fixed 30% Propagation Confidence with an evidence-coverage concept or remove it outside calibrated contest/spot evidence.
- If confidence terminology remains, define a calibration dataset, outcome, window, and reliability test before shipping a percentage.
- Ensure model accuracy and confidence panels do not make conflicting claims.

### Work Package F4 — Make Solar Cycle Context Current

**Actions**

- Derive Cycle 25 context from the validated monthly sunspot product where possible.
- Version and label any provisional forecast baseline.
- Show the as-of month and provider.
- Keep embedded historical data only as an explicit fallback.
- Mark fallback data stale and disclose the last included month.
- Ensure percent-of-peak compares like-for-like measures and does not mix SFI and SSN without explanation.
- Update help and modal copy that still describes an outdated expected peak period.

### Work Package F5 — Rationalize Help and Labels

**Actions**

- Remove redundant tooltip/help-button combinations where one accessible affordance is sufficient.
- Keep concise card copy; put deeper science and formulas in one consistent detail surface.
- Format all raw ISO timestamps into consistent UTC date/time text.
- Use product-specific units and define abbreviations on first use.
- Review all empty, stale, error, and recovery messages for calm, actionable language.

### Exit Gate F

- Every decision-support claim states whether it is observed, forecast, estimated, global, or path-specific.
- No fixed UTC daytime assumption remains.
- Scores disclose inputs and missing-data behavior.
- Confidence percentages are calibrated or removed/reframed.
- Cycle context has a live or explicitly stale as-of source.
- A content review finds no false live, forecast, quiet, or all-clear language.

## Stage G — Verification, Rollout, Observability, and Cleanup

### Work Package G1 — Provider Contract Test Matrix

Every adapter must pass:

- Newest-first and oldest-first ordering.
- Duplicate timestamps.
- Invalid and future timestamps.
- Missing required fields.
- Missing required product/channel.
- Mixed proton energies and mixed X-ray wavelengths.
- Empty and header-only responses.
- Malformed JSON or forecast text.
- Wrong content type.
- Oversized payload.
- Provider 400, 404, 429, 500, and 503.
- Network error and deadline timeout.
- Primary-source failure with valid fallback.
- Both primary and fallback failure.

### Work Package G2 — Cache and State Test Matrix

Verify:

- Fresh cache hit without network.
- Soft-expired entry shown while one background request runs.
- Successful revalidation replaces stale data.
- Failed revalidation preserves last-good data before hard expiry.
- Hard-expired data becomes unavailable.
- Corrupted cache entry is discarded safely.
- IndexedDB unavailable and quota exceeded.
- Service worker cache contains an older contract version.
- Empty-success remains distinct from error.
- Partial widget inputs remain visible and suppress unsupported derived claims.
- Global refresh reports per-source success/failure.

### Work Package G3 — UI and Accessibility Matrix

Verify:

- Loading, refreshing, stale, partial, empty, unavailable, error, and recovery for every widget family.
- Correct observation timestamp and source affordance.
- No missing value renders as zero.
- No failed alerts request renders as all clear.
- Keyboard activation with Enter and Space.
- Modal focus entry, trap, Escape, and restoration.
- Screen-reader titles and unique chart timestamp labels.
- 200% zoom, reduced motion, color-independent status, and touch target size.
- Image failure followed by successful recovery.

### Work Package G4 — Browser Journeys

**Desktop journey**

- Load Solar Pulse from a cold application state.
- Verify current observations, source health, and timestamps.
- Refresh all visible products and inspect partial failure.
- Open chart, image, and animation details.
- Simulate stale-on-error and recovery.

**Mobile journey**

- Load at a narrow viewport with no prior accordion state.
- Verify only essential requests and mounted content.
- Expand each group and confirm on-demand fetch/render.
- Verify no duplicate top metrics.
- Exercise refresh, stale data, image failure, keyboard/touch disclosure, and modal close.

### Work Package G5 — Performance and Cost Verification

Measure and compare:

- Initial request count by viewport.
- Endpoint response bytes and compressed bytes.
- Edge/provider request ratio and cache hit behavior.
- Stale-served-on-error count.
- Solar route JS/CSS and main-shell contribution.
- PWA install/update precache size.
- DOM nodes and SVGs before and after mobile expansion.
- Image and animation bytes.
- Main-thread work, interaction responsiveness, and layout stability.
- IndexedDB entry count and approximate storage.

No performance improvement is accepted if it weakens freshness, error truth, accessibility, or science correctness.

### Work Package G6 — Evidence-Based Rollout

Use reversible change sets and feature flags where old/new behavior must coexist:

1. Land contracts, fixtures, and tests.
2. Land corrected adapters and compare old/new values in development diagnostics.
3. Promote corrected current values and truthful states.
4. Migrate handlers and direct feeds to the unified data plane.
5. Enable soft/hard TTL and stale-on-error.
6. Migrate images and modals.
7. Switch layouts to useSolarModel and WidgetShell.
8. Promote revised writing and decision-support labels.
9. Remove old effects, cache paths, modal implementations, and compatibility code only after production-like verification.

Rollback must preserve the last validated data contract and must not re-enable known incorrect selection logic.

### Work Package G7 — Operational Readiness

Create source-health views or alerts for:

- Observation age beyond soft and hard limits.
- Schema-validation failures.
- Repeated provider failure or rate limiting.
- Endpoint deadline and payload-budget breaches.
- Cache miss and stale-served-on-error patterns.
- Widget unavailable/error rates.
- Development/production contract drift.
- Solar route bundle or PWA budget regression.

Document the operator response for provider outage, schema drift, wrong product values, image outage, and cache corruption.

### Exit Gate G

- All deterministic, endpoint, component, browser, accessibility, and performance checks pass.
- Failure drills prove graceful stale, unavailable, partial, and recovery behavior.
- Production-like telemetry shows observation age and cache outcomes correctly.
- Old duplicated data effects, direct fetches, modal paths, and dead image components are removed.
- The coverage matrix below is signed off with evidence links.

## Endpoint-Specific Backend Checklist

Apply this checklist during C2 so smaller backend findings are not lost:

- [x] All handlers explicitly support GET and OPTIONS and reject other methods.
- [x] CORS behavior is correct for same-origin production and approved preview/custom domains.
- [x] Every upstream call has a deadline and clears its timer.
- [x] Every response validates content type before parsing.
- [x] Every structured response is runtime-validated.
- [x] Required-empty data returns a typed failure, not a misleading 200.
- [x] Forecast parsing fails visibly when provider format changes.
- [x] D-RAP validates nonempty, rectangular grid data.
- [x] Magnetometer primary and fallback outputs have one contract.
- [x] Proton and X-ray responses filter the exact required channel before bounding.
- [x] CME uses a configured NASA key where available, bounds the event window, and does not depend silently on DEMO_KEY capacity.
- [x] Unified solar media routes validate image media types and use bounded stale-if-error.
- [x] Error responses are not CDN-cached as successful data.
- [x] Provider statuses and 429 responses remain classifiable by the client.
- [x] Cache headers come from source policy, not copy-pasted literals.
- [x] Rate limiting is documented as per-isolate best effort unless a distributed control is intentionally added.

## Failure-Injection Acceptance Matrix

| Failure | Expected product behavior |
| --- | --- |
| One provider times out | Dependent widget shows stale last-good data or unavailable; unrelated widgets remain fresh |
| Solar wind plasma fails, magnetometer succeeds | Bz remains usable; speed/density show stale or unavailable independently |
| Provider returns malformed JSON | Validation error recorded; last-good data preserved; no partial corrupt overwrite |
| Provider reverses array order | Display remains correct because adapter sorts timestamps |
| Provider adds another energy channel | Exact product filter prevents channel substitution |
| Forecast parser finds no valid days | Forecast widget shows unavailable/format problem, not an empty normal state |
| Alerts request fails | UI never says no alerts; it shows stale alerts or unavailable |
| Image returns 404 then recovers | Declarative fallback changes back to the image without reload or duplicate fallback nodes |
| IndexedDB is blocked | Network path continues; status explains reduced offline resilience only if user-actionable |
| Cached data passes soft TTL | Data remains visible with refreshing/stale state |
| Cached data passes hard TTL | Data is removed from decision claims and shown unavailable |
| User presses global refresh | Every visible registered source reports success or failure; no silent omissions |
| Mobile panel remains closed | Its expensive content and nonessential data requests do not start |
| Service worker has old response shape | Contract version rejects or migrates it safely |

## Audit Finding Coverage Matrix

| Audit ID | Primary closure package | Required proof |
| --- | --- | --- |
| SW-001 | B1, B2 | Newest-first SFI fixture selects maximum timestamp; current card and chart show current chronological data |
| SW-002 | B2 | July/current forecast wins over older array entries; issue date is visible; fields range-validated |
| SW-003 | B2 | Newest-first RTSW fixture returns a true latest-hour series and latest Bz |
| SW-004 | A1, B3 | No pseudo forecast; Kp/A or ap products have correct grain, terminology, labels, and fixtures |
| SW-005 | B4 | Mixed-energy fixture selects >=10 MeV and applies S-scale only to that channel |
| SW-006 | B5 | Widget/page freshness is based on observedAt and oldest required input, never cache-read time |
| SW-007 | C4 | Soft-expired data survives failed revalidation until hard expiry with a stale badge |
| SW-008 | C3 | Five direct feeds use independent same-origin queries, shared validation/cache, and partial success |
| SW-009 | B6 | Null/error/empty component tests prevent false zero, quiet, and all-clear states |
| SW-010 | D1, D2 | Stable image URLs cache correctly; transient failure recovers declaratively |
| SW-011 | C1, C2 | All handlers have deadlines, response limits, runtime schemas, and typed failures |
| SW-012 | B7 | Flux forecast and SDO development routes match production content type and contract |
| SW-013 | E4 | Closed mobile panels do not mount hidden SVG/table trees or start nonessential requests |
| SW-014 | B8 | Refresh covers all visible registered sources or is explicitly scoped and relabeled |
| SW-015 | E1, E2, E3 | SolarPulse becomes declarative; duplicated fetch, derivation, image, and modal state is removed |
| SW-016 | C1, C2 | Twelve handlers share method, CORS, cache, timeout, validation, error, and telemetry mechanics |
| SW-017 | C7 | Edge responses meet approved row/byte budgets; development no longer caches oversized raw feeds |
| SW-018 | E4, E5 | Mobile removes duplicate metrics; desktop/mobile hierarchy answers the primary decision first |
| SW-019 | D3, D4 | Animation preload is bounded/abortable/retryable; cache is capped; focus behavior passes |
| SW-020 | E6 | Solar route, main shell, and PWA have approved CI budgets and intentional lazy/precache boundaries |
| SW-021 | F1, F2 | Global guidance is labeled general; fixed UTC daytime is removed; path-aware route used when possible |
| SW-022 | F3 | Heuristic score is transparent/reframed; fixed 30% confidence is calibrated, replaced, or removed |
| SW-023 | F4 | Cycle card uses current monthly data or visibly dated fallback with like-for-like comparisons |
| SW-024 | C6, E1 | Widgets load independently, retain partial data, and page health uses all critical visible sources |
| SW-025 | C5 | Registry actively computes staleness and drives query, refresh, health, and widget state |
| SW-026 | D1, D2 | Images use object-contain, preserve legends, display product time, and never show false Live |
| SW-027 | A2, A3, G1–G7 | Solar unit, contract, cache, component, browser, failure, accessibility, performance, and synthetic checks exist |
| SW-028 | C8 | PWA and IndexedDB ownership is explicit, source-aware, bounded, migrated, and tested offline |
| SW-029 | D5 | Unused image/modal exports and duplicate implementations are removed after migration |
| SW-030 | D4, G3 | Native controls or complete keyboard semantics, unique chart labels, and accessible dialogs pass |

## Recommended Change-Set Sequence

Each change set should be independently reviewable and leave the application buildable:

1. Provider contracts, policies, fixtures, and test infrastructure.
2. Shared normalization helpers and the five critical correctness fixes.
3. Truthful freshness, missing/empty/error states, development parity, and refresh scope.
4. Shared edge handler and endpoint-by-endpoint migration.
5. Same-origin migration for direct operational feeds.
6. Soft/hard TTL cache, executable status registry, and partial-input models.
7. Payload bounding, service-worker ownership, and source telemetry.
8. SolarImageCard, stable image proxies, AnimationModal hardening, and accessible modal host.
9. useSolarModel, widget registry, declarative page, and render-on-expand mobile.
10. Information architecture, bundle/PWA budgets, and responsive performance work.
11. Content rules, heuristic reframing, path-aware guidance, and current solar-cycle context.
12. Failure drills, production-like rollout, operational runbooks, and legacy cleanup.

Later change sets may be prepared in parallel after their contract dependencies are stable, but they should not be promoted before their entry gate is satisfied.

## Relationship to the Existing Solar Feature Plan

The older [Solar Data Quality & Sources Improvement Plan](./SOLAR-DATA-IMPROVEMENTS.md) remains useful as a feature backlog. This remediation plan is authoritative for data contracts, caching, failure states, testing, and widget mechanics.

Rules for reconciling the two:

- Do not add another solar product through a one-off hook or page effect.
- Every new product must have a provider adapter, source policy, envelope, last-good behavior, WidgetShell state, fixtures, and endpoint contract tests.
- X-ray, proton, Dst, D-RAP, CME, and flux-forecast work already present in the repository must be hardened through this plan rather than reimplemented independently.
- The collector/Supabase path may support history or a future shared fallback, but it should not become the primary source merely to mask current edge/client contract problems.
- New historical charts must consume normalized stored observations and state their aggregation grain.
- New alerts must distinguish observed triggers, official warnings, estimates, and stale inputs.
- New prediction features must not use forecast/confidence language without an official product or validation evidence.

## Approved Decisions

All nine decisions are accepted in [ADR: Solar Data Truth and Resilience](../decisions/ADR-SOLAR-DATA-TRUTH.md):

1. Which official NOAA products are authoritative for three-hour observed Kp, predicted Kp, and daily A-index?
2. Should A-index remain a headline metric, become estimated ap-equivalent, or be removed?
3. What hard usability limit is acceptable for each product during an outage?
4. Which solar products are essential on initial mobile load?
5. Should the existing collector/Supabase data be historical-only, a fallback, or eventually authoritative?
6. What calibrated outcome would justify retaining a Propagation Confidence percentage?
7. What station/target context is required before the UI may offer path-specific band guidance?
8. Which shared dialog primitive will own accessibility behavior across metric, chart, image, and animation details?
9. Which source-health metrics and thresholds are operationally actionable enough to alert on?

The ADR records the approved product identities, semantics, cache limits, mobile source set, historical-storage role, evidence language, path boundary, dialog primitive, and operational telemetry.

## Final Program Checklist

- [x] Provider contracts and policies approved.
- [x] Fixtures cover every product and failure family.
- [x] All five critical correctness defects fixed and regression-tested.
- [x] Freshness uses observation/issue timestamps.
- [x] Null, empty, stale, unavailable, and error remain distinct.
- [x] Every endpoint uses shared timeout, validation, method, cache, error, and telemetry mechanics.
- [x] All direct operational feeds migrated to the shared path.
- [x] Soft/hard TTL and stale-on-error verified.
- [x] Source registry actively drives status, refresh, and mobile enablement.
- [x] Payload budgets enforced.
- [x] Images use stable URLs, recover, retain legends, and show age.
- [x] Animation and dialogs are bounded and accessible.
- [x] Desktop and mobile share useSolarModel.
- [x] Closed mobile panels defer rendering and nonessential fetching.
- [x] Page hierarchy is decision-first and non-duplicative.
- [x] Bundle and PWA budgets pass.
- [x] Propagation copy is honest about global/path-specific scope.
- [x] Scores and confidence are transparent, calibrated, or reframed.
- [x] Solar-cycle context has a current or explicitly stale source.
- [x] All solar unit, contract, component, browser, accessibility, failure, performance, and synthetic checks pass.
- [x] Operational metrics and runbooks exist.
- [x] Legacy effects, duplicate hooks, dead image/modal paths, and compatibility code are removed.
- [x] SW-001 through SW-030 each have linked completion evidence.
