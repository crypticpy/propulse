# Home elevation plan

Date: 2026-09-05.
Status: implementation complete; review, deployment, and live verification are tracked in [PR #162](https://github.com/crypticpy/propulse/pull/162).
Scope: Home (`/`) on desktop and mobile, plus focused handoffs to existing operating tools.

## Outcome

Home is the operator's personal briefing: **What is happening, what matters for my station, and where should I go next?** The first screen should give a supported summary and a useful next action. Solar Pulse owns detailed space weather; PropSphere owns map-based operating; the DX Wizard and planner own target-specific advice.

Follow the existing visual system and the accepted [Solar Pulse plan](SOLAR-PULSE-ELEVATION-PLAN.md), [Shack/Profile plan](SHACK-PROFILE-ELEVATION.md), and [Operating Logger plan](PROPSPHERE-OPERATING-LOGGER-PLAN.md). The primary audience is home-station tinkerers, with portable operation represented through the active station setup. Preserve the [Solar Data Truth ADR](../docs/decisions/ADR-SOLAR-DATA-TRUTH.md).

## Accepted execution update

During implementation the operator clarified that the old table felt like a forecast. Home now leads with **recent observed band reports**, especially on phones. Modeled Band Health remains in the existing operating tools. A reported solar impact takes priority on phones. The three passes below are being delivered together as one coherent Home release, with shared verification.

## Review basis

The September 5 review checked Home-related source against `origin/main` at `3564c9d36a97526bac8a253634a78472d1fcc984`, and inspected local desktop and phone layouts in a disposable development session. Those captures included development data and unavailable-source fixtures; their values are not evidence of current production conditions. Refresh the baseline before implementation: the shared checkout contains unrelated work and differs from main.

The page currently repeats global guidance through a band table, a score gauge, solar metrics, and predictions. Band Health, Nearby Activity, and tool shortcuts are farther down. The expanded contest card dominates the phone's first screen. Two concrete status problems need correction: an empty active-alert list produces “All Quiet” without a coverage check, and the dashboard uses one five-minute freshness threshold for differently paced feeds.

## Target composition

| Order | Desktop | Phone |
| --- | --- | --- |
| 1 | Compact Home title, station context, source status, standalone refresh at right | Compact title/context and accessible refresh |
| 2 | Recent band activity beside a compact solar briefing and operating actions | Recent reports lead; significant solar impacts take priority |
| 3 | Scoped counts and matching activity bars, modes, reporter counts, and server snapshot time | Three most-reported bands first; remaining bands and bars expand on demand |
| 4 | Recent session, relevant contest/DXpedition context, and QTH daylight | Compact session/event summaries |
| 5 | Optional sky, environment, clocks, history, and news widgets | Explicitly expanded or pinned widgets |

Use the existing dark surfaces, amber identity, cyan data, semantic status colors, and fonts. Reduce empty vertical bands, competing card headers, and tiny explanatory text. Current/Stale/Error belongs in the top-right of its source-backed module, with text available alongside color. Refresh gets a hover/focus explanation of its actual scope. Source freshness and operating conditions remain separate concepts.

## Release 1 — Useful briefing and trustworthy status

- [x] Recompose `Home.tsx` and `MobileHome.tsx` around the hierarchy above, sharing presentation/model logic so the two layouts tell the same story.
- [x] Reuse the existing Solar briefing selector and its required source contracts. Avoid mounting the full Solar page or fetching its optional imagery/history just to render Home. Qualify partial coverage and elevate supported impact warnings.
- [x] Replace the page-wide five-minute LIVE/STALE decision with source-specific state. An empty alert list or dismissed notification must not establish quiet conditions. Unknown, delayed, and failed sources get plain explanations; hard-expired inputs cannot drive current advice.
- [x] Explain recovery accurately: provider delays say what is missing and whether the app will retry. Offer setup actions only when an operator-controlled setting is actually missing. Preserve usable independent data during an outage.
- [x] Remove the Global Conditions Score gauge and its redundant summary from Home. Keep a compact solar context with a link to Solar Pulse. Audit other callers before changing or removing shared components/modals.
- [x] Promote current band observations and a concise Nearby Activity entry point; leave modeled Band Health in the operating tools. Show the actual geographic scope, modes, report age/window, and availability. Missing reports mean insufficient evidence, not a closed band; reports do not guarantee a contact from this station.
- [x] Move operating actions beside the briefing. Use working ordinary navigation initially; preserve the station and existing destination state. Add context parameters only when receiving behavior is implemented and tested.
- [x] Condense contests to a brief happening-now/coming-next summary with details on demand. Label participation-derived activity as estimated; distinguish scheduled events from measured activity. Keep legitimate contest-assistance restrictions intact.
- [x] Move optional widgets behind a discoverable disclosure and defer their mounting/fetching until opened. Retain access to existing functions.

**Acceptance:** at 390 × 844 and 1440 × 900 with default text size, the initial viewport leads with recent band reports and an operating action at default size, or an impact briefing when warranted. Supported warnings remain prominent. A delayed source cannot produce an unqualified “all quiet” or favorable headline. The first release works with no configured station, no contacts, or an unavailable activity feed. Global navigation remains stable and opening Home does not alter the map projection or Ops Console state.

## Release 2 — Visuals that explain activity and timing

- [x] Add compact activity-by-band bars using the existing observation source. Declare scope, reporting window, count definition/deduplication, and coverage. Use the same aggregate dataset for counts and chart. Label the separate nearby explorer with its setup location and range/time filters; its population differs from the regional aggregate. Preserve the server snapshot timestamp through cached delivery. Show unavailable data distinctly from a measured zero.
- [x] Add a QTH daylight strip with the active location, sunrise, sunset, current-time marker, and explicit timezone. Reuse existing astronomical utilities. Handle missing location, date rollover, and polar day/night. Endpoint daylight is context, not a path-opening prediction.
- [x] Combine recent-contact totals and a small activity trend into a useful session summary using the existing log source and an explicit UTC/local day boundary. Preserve honest empty and loading states.
- [x] Give every chart readable units/time labels, an accessible text equivalent, and reduced-motion behavior. Phone activity bars and optional widgets mount only when requested; the lightweight QTH daylight strip remains with station context. Do not add a chart framework for these compact visuals.

**Acceptance:** an operator can identify the data's scope and time window without a tooltip. Chart and detail counts agree. Sparse coverage stays visible. Daylight displays remain correct across timezone/date boundaries. Layout stays readable on tablet and large monitors with increased text size.

## Release 3 — Station context and personal favorites

- [x] Surface the existing active location, rig/antenna setup, and operating mode through shared station/operating stores. Reuse the current station context rather than introducing another setup form or parallel defaults.
- [x] Make band/activity actions open the matching existing tool context where destination contracts support it. Verify selected band, target when known, mode, and time at the destination. Unknown targets remain explicit; navigation never tunes hardware automatically.
- [x] Provide a compact recent-session entry point where persisted session data supports resumption. Do not claim an active radio connection or resumable session from log totals alone.
- [x] Add simple pin/unpin preferences for optional widgets using existing preference patterns. Keep the initial default focused; a saved desktop preference must not force expensive widgets into the phone's initial render.
- [x] Update Dashboard help and remove obsolete Home score/interaction descriptions.

**Acceptance:** switching Home/POTA setup updates displayed context and supported handoffs consistently. Browser back/forward and repeated navigation do not overwrite newer destination choices or reopen the console unexpectedly. Favorites persist; first-visit and missing-setup journeys remain usable.

## Implementation and release checks

1. Start from current main in an isolated worktree. Read `AGENTS.md` and the [local testing guide](../docs/guides/LOCAL-AGENT-TESTING.md); use an owned server and disposable browser fixtures. Do not absorb unrelated shared-checkout changes.
2. Audit the existing Home/mobile composition, `DashboardHeader`, `AlertsSummary`, Solar briefing/model, Band Health, Nearby Activity, station context, and destination handoffs before introducing new abstractions. Nearby Activity is present on reviewed main even if missing from the dirty checkout.
3. Record the current Home bundle/request/DOM baseline, then keep the first-screen work bounded. Existing executable budgets remain authoritative. Collapsing widgets must defer work, not just hide it with CSS.
4. Add meaningful unit/component coverage for summary precedence, source expiry, alert dismissal versus conditions, unavailable activity, chart aggregation, and handoff behavior as each release introduces them.
5. Run lint, relevant Vitest suites, build, and bundle checks. Broaden tests when shared modules change. Verify production-build browser journeys at 390, 834, 1440, and 2560 pixels, large text, keyboard/touch, and reduced motion.
6. Cover quiet conditions, a reported radio-blackout event with quiet Kp, stale/missing/expired sources, conflicting source times, zero versus unavailable reports, no station/log, active contest restrictions, location/setup switching, and restored preferences. Explicit fixtures must control development seeds as well as network responses.
7. Ship each release through a focused PR with desktop/phone screenshots and validation evidence. Watch bot feedback and CI, address findings, merge, wait for the production deployment, and verify the public alias and served assets. Check available live journeys for console/preload errors; record any authenticated checks that could not be performed.

Completion means all three releases are merged and verified in production, with links and evidence recorded here or in a linked completion report. The first release must stand on its own while the remaining work follows.

## Deferred scope

New propagation engines, replacement readiness/contact scores, new paid data feeds, AI chat, a full draggable dashboard builder, global navigation redesign, and a dedicated wall-display layout are separate projects. This elevation uses the app's existing data, station model, and operating tools.
