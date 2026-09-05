# Home elevation evidence

Implemented 2026-09-05. Plan: [Home elevation](../plans/HOME-ELEVATION-PLAN.md).

## Delivered

- Current regional band observations lead Home; phones begin with the three most-reported bands. Counts, reporter coverage, modes, and the 20-minute window are explicit. Modeled Band Health remains in the existing operating tools, following the operator's implementation clarification.
- Server snapshot time survives cached HTTP 200 responses. Expired, missing-time, future-time, and failed responses cannot become green Current counts. A measured zero does not claim a closed band.
- Home shares Solar Pulse's briefing selector and six essential source contracts. Reported impacts lead on phones. Source labels, provenance, delayed-feed explanation, and a standalone scoped refresh replace the old global score and empty-alert all-clear.
- Current reports and forecasts are visually distinct. Solar remains the destination for detailed forecasts and imagery.
- Active station chains, legacy presets, linked QTH, daylight, and configured power are shown consistently. Nearby report queries and distances follow the selected setup's location. Existing map and radio state remain under their established controls.
- Path/planner links reuse the validated operating handoff with an explicit Home origin. Missing targets remain editable at the destination.
- Recent contacts and a seven-day trend use UTC boundaries, subscribe to local log changes, and have manual refresh. Only an actual stored contest session offers resume. Calendar events are labeled scheduled; participation-derived levels in optional details are labeled estimated.
- Optional sky/environment/news/time/history widgets mount on demand. Favorites persist separately for phone and desktop; phone favorites require opening. Existing history detail remains accessible.

## Review and verification

Two independent read-only reviews agreed on three findings: cached snapshot age, portable QTH consistency, and legacy-preset selector accuracy. All were fixed with regression coverage; follow-up code review found no remaining findings.

Production-build Home browser tests: 15 passed, one intentionally skipped duplicate viewport sweep. Coverage includes current versus unavailable observations, expired HTTP 200 snapshots, solar impacts and expired evidence, keyboard refresh help, distinct linked station locations, nearby queries, planner handoff and back navigation, operating-policy filtering, saved favorites, and 390/834/1440/2560-pixel layouts with large text and reduced motion. Initial main controls meet 44-pixel targets and Home has no horizontal overflow in those checks.

Screenshots use disposable station and feed fixtures, not live conditions: [desktop](screenshots/home-elevation/desktop.png), [phone](screenshots/home-elevation/phone.png).

The full repository suite passed: 265 files / 1,563 tests. Solar production-build browser regressions also passed: 20 checks, four intentional platform skips. Focused regression tests, build and all bundle budgets passed. Lint passed. The owned development-server smoke check also passed all navigation/console/fallback checks with no page errors: fixed header positions across five widths, minimized console startup, explicit open/collapse, assisted contest controls, and WebGL failure/retry. Its old decorative-canvas selector was corrected to target the interactive map. Production release verification is recorded with the PR report. The Home route decreased from 136.31 kB raw / 36.06 kB gzip to approximately 22 kB / 7.6 kB, with activity and optional widgets in separate lazy chunks; this is a route-chunk comparison, not a measurement of total transferred page bytes.

## Boundaries

The shared app alert monitor owns separate PSK/RBN requests; the Home activity policy gate does not redesign that pre-existing monitor. Home does withhold its activity component and aggregate requests when public spotting is excluded.

Automated usability and source fixtures establish behavior, not a human five-second comprehension study. Production sign-in and hardware interactions require an authorized session; no authentication bypass or radio commands are part of these fixtures. No new data feeds or propagation models were introduced.
