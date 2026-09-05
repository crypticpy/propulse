# Solar Pulse elevation — implementation and verification

Implemented 2026-09-04; final verification continued into 2026-09-05 UTC.
Scope: all three implementation passes in [the elevation plan](../../plans/SOLAR-PULSE-ELEVATION-PLAN.md).

## Delivered behavior

| Plan area | Implementation and evidence |
| --- | --- |
| HF briefing | `briefing.ts` reconciles all six essential products. Current R/S/G and X-ray impacts take priority over supportive background readings. Simultaneous impacts remain separate. Source identities, observation times, missing coverage, and delayed evidence are inspectable. Unit scenarios include quiet, R/S/G events, contradictory timestamps, future watches, null Bz, predicted-only Kp, and hard expiry. |
| Upstream versus observed | A southward Bz sample is explicitly upstream context; it does not declare a storm. Recent bulletins are never represented as an active-event registry. |
| Composition | Briefing first, compact readings, measured changes, official forecasts, bulletins, impacts, and optional history/imagery. Desktop features provider imagery without duplicate mounted copies. Metric help describes meaning, geography, and next steps. |
| Changes | Adjacent comparable samples with exact comparison times; non-predicted Kp with record status, like SFI schedules, bounded Bz/X-ray gaps. Sparse history remains unknown. UTC parsing handles NOAA timestamps without a zone suffix. |
| Charts | Visible axes, units and UTC ticks; observed/estimated/predicted styles; interval Kp bars; signed Bz with zero line; logarithmic X-ray with class thresholds; gap breaks; current-time marker; keyboard/touch inspection and optional accessible values tables. |
| Forecasts | Three daily SFI/A cards, predicted Kp horizon, one-day event probabilities, issued versus valid times. Kp snapshot retrieval is labeled Checked because it has no separate issuance contract. Forecasts never claim QSO probabilities. |
| Impacts and imagery | D-RAP and aurora sit beside geographic explanations. D-RAP global maximum is explicitly not local tuning advice. Full product legends, image enlargement, playback and failure/recovery remain available. |
| Bulletins | Three-item summary plus access to every returned bulletin and full messages. Product type, issue time and dialog focus behavior are verified. |
| Station handoff | Actual links transfer exact target coordinates, active mode, and optional planning instant through a validated router-state contract. Desktop/mobile DX Wizard and Band Planner tests assert actual calculation inputs including active-chain location. Map tests preserve projection/layers and verify no pending radio commands. Unsupported physics modes are visibly mapped to supported models. Missing station/target remains navigable. |
| Preferences and mobile | Separate saved desktop/mobile disclosures; shared Text Size; no resolution-based wall-display mode. Cold mobile retains six essential products, fewer than 250 main descendants, no charts/images/tables before expansion, and 44px button targets. |

## Release verification

The release branch is based on current main (`20b47e34`, after Shack PR #148). It retains the newer shared DX Wizard session and map clock. Solar target/mode/time hydration is applied to that session, including recommendation, path geometry, and opening-window calculations. URL synchronization preserves the router handoff state. Future-time advice does not display a live-band correlation as if it applied to the selected date.

- `npm run lint`: passed.
- `npm test -- --reporter=dot --silent`: 248 files, 1,490 tests passed, including Solar, destination, and existing DX Wizard tests. The old local radar test mismatch is absent on current main.
- `npm run build` and `npm run check:bundles`: passed against the unchanged budgets on main, including a build with the configured public client environment. App entry 805.94/216.60 KiB raw/gzip (850/240 budget); SolarPulse 57.37/16.92 KiB (60/18); precache 17 entries / 2510.60 KiB (17/2700).
- Deterministic Playwright: 18 passed; 4 intentional viewport-specific skips. The isolated managed server ran from this release checkout at 127.0.0.1:5182 and stopped afterward.
- Browser fixtures use America/Chicago, blocked service workers, large shared text, and reduced motion. Checked 390×844, 834×1194, 1440×1000, and 2560×1440. Provider images and charts were loaded before captures.
- Cold mobile gates retain six essential feeds, fewer than 250 main descendants, zero charts/tables/images until expanded, 44px buttons, and no horizontal page overflow.

[Desktop screenshot](elevation/desktop.png) · [Phone screenshot](elevation/phone.png). These show deterministic solar envelopes and provider imagery; they are layout evidence, not a live weather report.

## Release boundaries

Only Solar changes were extracted from the earlier dirty snapshot. Unrelated build repairs are already handled by main and are excluded. BandModeModal is loaded on demand to preserve the app-entry budget. Cache authority, source policies, radio commands, and map presentation remain owned by their existing modules.

The browser runner accepts an optional `PROPULSE_E2E_SERVER_COMMAND` for agent-owned server coordination, supports an explicit port, and refuses to reuse an unknown listener. The default runner remains portable and uses Vite with `--strictPort`.

## Review limitations and follow-up target

Screenshots use deterministic solar envelopes and downloaded NOAA/NASA imagery for visual review. They do not establish live-provider availability, authenticated cloud behavior, or actual radio interaction. The local Playwright server is separately owned and stops after verification.

The pre-release production synthetic passed 23/24 checks. The probability product failed the probe's 24-hour freshness check; its retained envelope was still within the existing three-day data policy. The UI now explicitly labels the ended one-day forecast window without changing cache limits.

Review fixes preserve FT4/RTTY in DX Wizard, evaluate contest context at the planning instant, and give both planners an explicit analysis-mode control. Planner mode is seeded from the handoff and remains editable under CAT, WSJT-X, or contest precedence without mutating radio-follow state. Subsequent shared-mode changes are also reflected. Regression tests cover all three precedence cases on both layouts.

The five-second comprehension check remains an unmeasured usability target, not a claimed study result. A newcomer and experienced operator should inspect a quiet and an impact fixture and identify the current concern/geography, what changed, and the next action. Record confusion between data freshness, event severity, and predictions. No human research outcome is asserted here.

The plan's explicitly deferred scope remains deferred: active-event lifecycle parsing, notifications, new CME arrival predictions, new propagation models, paid infrastructure, and a dedicated wall-display system.
