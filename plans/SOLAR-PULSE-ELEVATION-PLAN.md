# Solar Pulse elevation plan

Status: all three implementation passes delivered; see [verification evidence](../docs/solar/ELEVATION-COMPLETION-EVIDENCE.md).
Date: 2026-09-04.
Scope: `/solar`, its presentation and interpretation, and focused handoffs to existing operating tools.

Solar Pulse should be the space-weather briefing an operator checks before a session and returns to when the bands change. In a few seconds, it should explain what is happening, what changed, which kinds of HF paths may be affected, and what to inspect next.

## Product context

The September Shack/Profile plan chooses home-station tinkerers aged 30–50 as the primary audience, with portable operators supported through their field kits. The Operating Logger plan emphasizes a connected radio desk, predictable interactions, and less repeated setup. The DX Wizard plan assigns target-specific band, power, and timing advice to the path advisor. These are product decisions in the planning documents, not newly validated demographic research.

For Solar Pulse, that implies three depths in one page:

| Operator need | Page response |
| --- | --- |
| Quick check before operating | A concise HF briefing, significant current conditions, and a next action |
| Understand why the bands changed | Trends, relevant events, affected geography, and readable explanations |
| Inspect the evidence | Exact values, observation/issue times, provider products, charts, and full bulletins |

Preserve the [Solar Data Truth ADR](../docs/decisions/ADR-SOLAR-DATA-TRUTH.md). Global space weather remains global context. Actual band selection requires station, target, path, time, mode, and equipment inputs in the tools that own them.

## What the current implementation tells us

This review inspected the current working tree, including `SolarPulse.tsx`, `useSolarModel.ts`, solar selectors/adapters/policies, chart and widget components, help, routes, and browser tests. It also read the solar remediation record and the newer HamClock experience plan. Historical PRDs inform intent; current code and the accepted solar ADR take precedence where they differ.

The code already provides a useful foundation: shared queries, source-specific expiry, independent failures, official forecasts, accessible dialogs, lazy mobile sections, and scientific imagery with provenance. The remediation record documents earlier verification; this planning task did not rerun those tests.

| Finding | Why it matters | Proposed response |
| --- | --- | --- |
| The introductory header and four large readings precede the HF guidance | The operator has to assemble the meaning before reaching the explanation | Make the briefing the first meaningful content |
| `generalHfGuidance()` uses only SFI, Kp, and the latest Bz | Favorable background inputs can coexist with an elevated X-ray reading or an official R/S event that the summary does not consider | Reconcile current impact evidence before issuing a favorable headline |
| One Bz sample at or below −10 nT can select “Globally disturbed” | The headline treats a coupling indicator as sufficient evidence of disturbance already occurring | Separate upstream conditions worth watching from observed disturbance |
| Several labels describe implementation: “independent NOAA summary,” “cache-stable scientific maps,” and failure isolation | These consume attention without helping someone operate | Write what the measurement or map means for radio; retain technical detail in source/help views |
| `SolarSeriesChart` draws axes without visible tick labels; observed and estimated Kp share a visual treatment | Time, magnitude, and record status are harder to read quickly | Add readable scales, distinct record styles, and accessible inspection |
| Bulletins show the newest five; the normalized type has no validity, cancellation, or event-link fields | “Recent bulletin” cannot safely become “active threat” through a cosmetic change | Improve the list now; gate active-event classification on a validated product contract |
| Imagery is a six-product gallery at the bottom | Absorption and aurora imagery are separated from the impacts they explain | Feature relevant existing imagery alongside its explanation on desktop; keep the complete gallery available |
| `/solar` has a general `/map` link; `/dx` and `/planner` have their own target state | A stronger CTA needs a working receiving-side contract | Add simple navigation first, then tested context-preserving handoffs |

No browser was available through the session's UI tools. A dedicated local server was started and stopped, but the rendered page was not visually reviewed. Layout criticisms above are structural findings from source; density, contrast, wrapping, and physical-display fit must be checked in the first implementation pass.

## Proposed page composition

Keep the Solar Pulse name visible. Use a compact masthead such as “Solar Pulse — space weather for your next session,” followed by this order:

| Order | Content | Presentation |
| --- | --- | --- |
| 1 | HF briefing | One clear headline, two short explanations, current event indicators, qualified evidence state, and a next action |
| 2 | Key readings | Kp, SFI, Bz, and X-ray in a compact strip; value, meaning, age, and detail access |
| 3 | What changed / what is expected | Recent measured changes alongside a clearly separate official outlook |
| 4 | Impacts and recent bulletins | Explain the affected geography; offer the relevant absorption/aurora image and full official message |
| 5 | Explore the Sun | History, solar cycle, wind detail, CME analyses, and the full image collection |

The visual direction is an industrial instrument panel using the established ProPulse design system: dark neutral surfaces, restrained solar amber for identity, cyan for data, and existing semantic warning colors. Retain the app's Orbitron headings, Inter body text, and JetBrains Mono readings. Existing brand consistency takes precedence over introducing new fonts.

Use a deliberate grid with one dominant briefing and quieter supporting modules. Reduce repeated borders, oversized empty headers, gradient numerals, and uppercase microcopy. Keep provenance readable beside each product; a source-details disclosure can hold cadence and implementation explanations. Label source freshness separately from weather severity so “data current” cannot look like “conditions quiet.”

Use actual provider imagery as the visual anchor, with complete legends and timestamps. On desktop, feature an existing solar or impact image instead of repeating it in multiple mounted cards. Imagery must never displace the briefing. Mobile keeps images and charts behind explicit disclosure.

## Pass 1 — A coherent, polished briefing

This is the recommended first release and must be useful on its own. It uses the existing feeds and requires no new service or propagation model.

1. Extract a pure briefing selector behind `useSolarModel`. It returns supported statements, cited input identities/times, coverage, and presentation priority. Components render those outputs; they do not introduce a second set of scientific thresholds.
2. Use the six existing essential products: Kp, observed flux, Bz, long-channel X-ray, official scales, and bulletins. Distinguish background ionization, observed/reported impacts, upstream indicators, and forecast notices. An elevated current impact must qualify the briefing even when SFI/Kp background inputs look supportive.
3. Present simultaneous impacts separately when appropriate. Do not average a radio blackout and geomagnetic conditions into a new score. Where current X-ray and the official scale snapshot differ in timing, show the difference and their ages rather than silently overwriting either.
4. Keep recent bulletins labeled as recent. A watch is forward-looking; a summary may describe an ended event. Without parsed validity, neither is proof of an active event. Use current measurements/scales for the initial current-condition summary.
5. Treat southward Bz as an upstream condition to watch. A latest sample does not establish a global storm. Any duration statement requires a declared time window, sufficient chronological coverage, and gap handling.
6. Derive the briefing's freshness and missing-input state from the actual inputs each claim requires. Unknown impact inputs qualify otherwise supportive background conditions. Retain visible last-good data only within the existing hard limits.
7. Recompose the page around that briefing, compact the readings and NOAA scales, and shorten routine bulletin presentation while retaining access to all returned items.
8. Replace implementation language with operator language. For example, “Solar-wind speed summary” becomes “Solar-wind speed”; the description explains its relevance. “Refresh visible data feeds” becomes “Refresh,” with scope and partial-failure feedback available beside the control.
9. Upgrade “Explain” content to answer what the measurement represents, which paths it can affect, and what to check next. Keep units/channel identity in readable secondary detail.

Illustrative fixture copy, not a statement about live conditions: “Radio-blackout conditions reported. Sunlit HF paths may be affected; geomagnetic conditions remain quiet.” NOAA describes flare-related HF impacts on the sunlit side and proton-related impacts near the poles, which supports keeping these impact types and geographic explanations distinct. See [NOAA HF communications](https://www.spaceweather.gov/impacts/hf-radio-communications) and [NOAA scales](https://www.spaceweather.gov/noaa-scales-explanation).

**Acceptance:** a high-SFI, low-Kp fixture with a reported R event cannot produce an unqualified favorable briefing; a lone southward Bz sample cannot declare a geomagnetic storm. Partial and unavailable data remain explicit. A new operator can identify the current concern, its general geographic relevance, and a next action without opening a modal.

## Pass 2 — Change and timing become useful

1. Add a small “What changed” summary from validated existing series: Kp versus the preceding comparable non-predicted interval, SFI versus a comparable prior observation, and Bz/X-ray changes within their retained coverage. Show the comparison times. Insufficient samples produce “Not enough history,” not a flat trend.
2. Improve the existing chart component rather than adding a chart framework. Include visible time/value ticks, units, gap breaks, a current-time marker where relevant, touch/keyboard inspection, and an accessible values view. Show observed, estimated, and predicted records distinctly.
3. Use Kp interval bars or steps for three-hour records, a signed Bz chart with a zero line, and an appropriately labeled logarithmic X-ray chart with class thresholds. Derive available ranges from the actual product; do not offer 24-hour controls over a latest-hour dataset.
4. Promote the existing official forecast into an understandable outlook: three-day cards for predicted SFI and planetary A, plus the official predicted Kp intervals. Show issue time separately from valid time. An “Issued” label must replace the generic widget's “Observed” wording for forecast products.
5. Summarize forecast disturbances only over the supplied valid horizon and keep them explicitly predicted. Event probabilities remain one-day provider probabilities; never transform them into chances of completing a QSO.
6. Connect each impact explanation to its existing scientific image. D-RAP remains a modeled absorption product: the global maximum is not the operator's local affected frequency or a recommendation to tune above it. See [NOAA D-RAP documentation](https://www.spaceweather.gov/products/d-region-absorption-predictions-d-rap).
7. Improve bulletin scanning with product type, issue time, clear titles, and access to the entire retained list. A later active-event view requires typed event identity, validity, cancellation/supersession, provider fixtures, and tests before it can filter or label events as active.

**Acceptance:** an operator can tell whether a displayed change was measured or forecast, identify the comparison window, read exact chart values on touch/keyboard, and see gaps. Forecast content must never acquire an observation label merely because it shares a widget shell.

## Pass 3 — Connect the briefing to the station

1. Offer clear next actions to PropSphere (`/map`), DX Wizard (`/dx`), and Band Planner (`/planner`). Labels should describe the destination: “Inspect a path,” “Find a band for a target,” and “Plan a session.” Use one primary action and quieter alternatives.
2. Reuse active station identity and existing location state. If useful, display the selected station and its daylight context without implying that endpoint daylight describes the whole path. No second QTH form or silent request for geolocation.
3. Coordinate with the DX Wizard and station plans to define and test receiving-side handoffs for target, mode, and time. The existing map share hook can reset presentation state, so reuse must be deliberate. A solar handoff should not reset the operator's projection or layers unexpectedly.
4. Until destination hydration exists, use honest ordinary navigation. Do not ship a query string that the destination ignores or claim that an unresolved target has been transferred.
5. Support missing station/target context gracefully. The global briefing still works; the destination asks for the missing operating input. Navigation never tunes a radio automatically.
6. Respect the shared Text Size preference and saved disclosure choices. Follow the HamClock plan's distinction between a close-up large monitor and a distant display; resolution alone must not switch to a simplified layout. A dedicated wall-display composition can follow after the primary page is validated.

**Acceptance:** navigating from Solar Pulse retains the intended station and any explicitly supplied operating context, with destination assertions for target/mode/time and no unexpected map or radio changes. The page remains useful before a shack or target is configured.

## Implementation boundaries and verification

Likely ownership:

- `src/pages/SolarPulse.tsx`: composition and disclosure state.
- `src/hooks/useSolarModel.ts` and `src/lib/solar/`: pure briefing/trend derivation, input provenance, and any later bulletin contracts.
- `src/components/solar/`: focused briefing/reading/outlook components, chart inspection, scientific image presentation, and timestamp semantics.
- `src/components/help/sections/SolarPulseSection.tsx`: corresponding operator explanations.
- `tests/solar/solarPulse.spec.ts` and existing solar unit/component tests: meaningful scenarios and regression coverage.
- Destination pages and shared handoff utilities: only in Pass 3, coordinated with their active workstreams.

Do not change cache authority, approved product expiry, official Kp/A semantics, or source identity as part of a cosmetic refactor. Audit callers before changing any shared selector or widget API. Preserve current contracts and update fixtures with any intentional contract extension.

The first release should retain the existing cold-mobile budget: six essential sources, no mounted charts/tables/images until revealed, and the existing DOM/touch/overflow gates. Show textual change summaries on the collapsed mobile page; sparklines stay on desktop or behind disclosure. Use the executable bundle budgets as the current authority; the July [performance baseline](../docs/solar/PERFORMANCE-BASELINE.md) is historical evidence, not a fresh measurement.

Before shipping code, run lint, the solar suite, build, bundle checks, and solar browser journeys. Run broader tests where shared modules change. Keep deterministic scenarios independent of live NOAA availability and use a separately owned dev session for visual review.

The fixture matrix should cover quiet conditions, a radio-blackout event with quiet Kp, a radiation event, a geomagnetic event, southward Bz without observed disturbance, a future watch, missing/stale/hard-expired inputs, conflicting observation times, sparse/gapped history, and image failure/recovery. Assert meaning and state behavior, not just revised heading text.

Visually verify 390-pixel mobile, tablet, ordinary desktop, and a larger display with increased text size. Include a first visit, returning disclosure state, keyboard-only operation, reduced motion, and chart inspection. Keep current mobile work gating when saved desktop preferences exist.

The usability target is a five-second briefing: ask a newcomer and an experienced operator to identify what matters now, what changed, and what to do next. Treat this as a validation target, not a measured outcome. Record any confusion between source freshness, event severity, and predicted conditions.

## Scope recommendation

Start with Pass 1. It addresses the clearest product issue and creates a visibly stronger page using the infrastructure already present. Pass 2 provides analytical depth; Pass 3 connects it to the station without duplicating the path tools.

Park custom alert subscriptions, automatic event notifications, new CME arrival predictions, new accuracy percentages, a standalone wall-display system, new paid infrastructure, and a new propagation engine. Those require separate contracts or evidence and are unnecessary for this elevation. Keep new work isolated from the many concurrent changes already present in this checkout.
