# Implementation Plan: Logbook Competitive Parity + Contest Awareness

Created: 2026-02-15
Status: PENDING APPROVAL

## Summary

Combined implementation of two PRDs — **Logbook Competitive Parity** (10 features, 5 phases) and **Contest Awareness & Community** (10 features, 4 phases) — yielding ~73 new files and ~40 modified files across 7 implementation waves. The plan maximizes parallel agent execution while respecting file ownership boundaries and cross-PRD dependencies.

## Scope

### In Scope

- All 10 Logbook features (6.1-6.11): DXCC status, awards, LoTW, band map, sync, POTA/SOTA, eQSL, QRZ, alerts, credential wiring, log filters
- All 10 Contest features (7.1-7.10): calendar engine, dashboard weather, band map awareness, alert intelligence, quiet bands, explorer, propagation intel, award integration, QSL batch, DX wizard
- Quality gates after every wave (tsc + vite build at final wave)
- Review agents (final-review-completeness + principal-code-reviewer) at end

### Out of Scope

- N1MM-level exotic contest support
- CW keyer / rotator control
- WSJT-X bidirectional integration
- Cloudlog/Wavelog/HRDLog/ClubLog full integration
- Test framework setup (project has none)
- Supabase migration application (plan creates SQL files but doesn't push them)

## Prerequisites

- Both PRDs reviewed and approved: `docs/PRD-LOGBOOK-COMPETITIVE-PARITY.md` (v1.1) and `docs/PRD-CONTEST-AWARENESS-COMMUNITY.md` (v1.0)
- Existing credential vault at `src/lib/db/credentialStore.ts` (407 lines, fully functional)
- Existing contest engine at `src/lib/contest/` (20 files, ~10,310 lines)
- Existing QSO infrastructure at `src/stores/qsoStore.ts`, `src/lib/db/logStore.ts`, `src/components/qso/`
- Existing sync infrastructure at `src/lib/sync/` (SyncManager, 15 modules, writeQueue)

## Dependency Graph

```
Wave 1:  [Logbook Phase 1] ──┐     [Contest Phase A] ──────────────────────┐
                              │                                            │
Wave 2:  [Logbook Phase 2] ◄─┘                                            │
                              │                                            │
Wave 3:  [Logbook Phase 3] ◄─┤  [Contest Phase C-Explorer] ◄──────────────┤
                              │                                            │
Wave 4:  [Logbook Phase 4] ◄─┤  [Contest Phase C-Awards/QSL] ◄── Wave 2   │
                              │                                            │
Wave 5:  [Logbook Phase 5] ◄─┘                                            │
                              │                                            │
Wave 6:  [Contest Phase B] ◄──┴──────── needs Phase 3 band map + Phase 5   │
                              │                  alerts from Logbook PRD   │
Wave 7:  [Contest Phase D] ◄──┴──────── needs Phase A + B + C              │
```

## Parallel Execution Strategy

Each wave contains 2-4 independent sub-agents that can run simultaneously. File ownership is enforced to prevent conflicts.

### Wave Summary

| Wave      | Agents            | Total Files              | Key Deliverables                                             |
| --------- | ----------------- | ------------------------ | ------------------------------------------------------------ |
| 1         | 4                 | 17                       | DXCC status, credentials, calendar engine, dashboard weather |
| 2         | 2                 | 13                       | Award dashboard, LoTW sync                                   |
| 3         | 3                 | 19                       | Band map, sync engine, contest explorer                      |
| 4         | 2                 | 20                       | POTA/SOTA activation, contest awards/QSL batch               |
| 5         | 2                 | 12                       | eQSL, QRZ, alert engine, log filters                         |
| 6         | 2                 | 12                       | Band map contest awareness, alert intelligence               |
| 7         | 2                 | 8                        | Propagation intelligence, DX wizard contest notes            |
| **Total** | **17 agent runs** | **~101 file operations** |                                                              |

---

## Implementation Phases

### Wave 1: Foundation + Contest Context (Logbook Phase 1 + Contest Phase A)

**Objective:** Lay DXCC status groundwork and credential wiring (blocks all QSL features). Simultaneously build the contest calendar engine and dashboard weather (no dependencies).

**Parallel Tasks** (4 agents):

#### W1-A: DXCC Status System (Logbook 6.1)

**Owns exclusively:**

- `src/hooks/useDxccStatus.ts` (NEW) — Hook: takes callsign/band/mode, returns DXCCStatus enum (new_entity | new_band | new_mode | worked | dupe)
- `src/components/qso/DxccStatusBadge.tsx` (NEW) — 5-color badge using project palette (alert-red, signal-green, nebula-blue, plasma-orange, void)
- `src/lib/db/logStore.ts` (MODIFY) — Add `getWorkedDxccSlots(dxccId)` query using `by-dxcc` index
- `src/components/qso/QSOEntryForm.tsx` (MODIFY) — Render DxccStatusBadge next to callsign input
- `src/hooks/useQSOEntry.ts` (MODIFY) — Re-evaluate DXCC status on rig frequency/mode change

**Context for agent:** Read `src/lib/data/dxccEntities.ts` for `lookupEntity()`. Read `src/lib/db/types.ts` for `LogEntry` shape. Read `src/stores/qsoStore.ts` for form state. The badge color palette is in PRD Appendix B. Five states: New DXCC Entity (alert-red), New Band Slot (signal-green), New Mode Slot (nebula-blue), Already Worked (plasma-orange), Duplicate (void/dimmed).

#### W1-B: Credential Wiring (Logbook 6.10)

**Owns exclusively:**

- `src/components/settings/CredentialUnlockDialog.tsx` (NEW) — Centered modal (NOT flyout), passphrase input, setup vs unlock modes, auto-lock countdown display
- `src/stores/profileStore.ts` (MODIFY) — Add `credentialStoreSetup: boolean` flag, `lastCredentialUnlock: number` timestamp
- `src/pages/SettingsPage.tsx` (MODIFY) — Add "QSL Service Credentials" section with passphrase setup prompt

**Context for agent:** The vault is ALREADY built at `src/lib/db/credentialStore.ts` (407 lines). Read it fully. It exports: `setupPassphrase()`, `unlock()`, `lock()`, `isUnlocked()`, `isSetup()`, `saveCredential()`, `getCredential()`, `deleteCredential()`, `getState()`. Services: "lotw", "clublog", "eqsl", "qrz". This task wires the existing vault into the UI — NO new crypto code needed. UX rule: centered modal, NOT flyout.

#### W1-C: Contest Calendar Engine (Contest 7.1)

**Owns exclusively:**

- `src/lib/data/contestCalendar.ts` (NEW) — Static dataset of 30+ contests from PRD Appendix A with concrete 2026 dates, lookup functions: `getContestsInRange()`, `getActiveContests()`, `getUpcomingContests()`
- `src/lib/contest/contestCalendarTypes.ts` (NEW) — `ContestCalendarEntry` interface: id, name, sponsor, startUtc, endUtc, bands, modes, exchange, difficulty, estimatedParticipants, tags, warcExempt
- `src/hooks/useContestContext.ts` (NEW) — Core reactive hook: returns `{ activeContests, upcomingContests, isContestWeekend, contestBands, quietBands, nextContest }`
- `src/lib/contest/contestCalendarSync.ts` (NEW) — Optional Supabase overlay for mid-cycle calendar updates (stub with `fetchRemoteCalendar()`)
- `src/components/contest/ContestCalendar.tsx` (NEW) — Calendar list/timeline view component

**Context for agent:** Read `src/lib/data/contests.ts` (1,641 lines) for existing CONTEST_DATABASE structure. The new calendar is a SEPARATE dataset — not replacing the contest definitions. Read PRD Appendix A for 30 entries. WARC bands (30m, 17m, 12m) are always quiet — include in quietBands computation. Read `src/types/contest.ts` for existing contest types to ensure compatibility.

#### W1-D: Dashboard Weather + Quiet Bands (Contest 7.2, 7.5)

**Owns exclusively:**

- `src/components/dashboard/ContestWeatherCard.tsx` (NEW) — Dashboard card: shows active/upcoming contest with name, countdown timer, affected bands, participant estimate. 3 states: active (amber), upcoming <48h (blue), quiet (collapsed)
- `src/components/dashboard/ContestCountdown.tsx` (NEW) — Countdown timer sub-component (days/hours/minutes to start or end)
- `src/components/contest/QuietBandNav.tsx` (NEW) — Shows WARC + contest-free bands, links to band planner
- `src/stores/settingsStore.ts` (MODIFY) — Add `contestWeatherDismissedUntil?: string`, `showQuietBandNav: boolean` preferences
- `src/pages/Logbook.tsx` (MODIFY) — Conditionally render QuietBandNav in sidebar when contest active

**Context for agent:** Read `src/pages/Home.tsx` to understand dashboard layout. This agent depends on W1-C's `useContestContext` hook for data — import from `@/hooks/useContestContext`. For the dashboard card, follow the visual style of existing cards in `src/components/dashboard/`. Read `src/stores/settingsStore.ts` to understand existing settings shape. QuietBandNav should be a simple pill list of available bands.

**Note:** W1-D should not add to Dashboard.tsx. Instead, integrate into `src/pages/Home.tsx` since that's the actual dashboard page. Agent should read the file first and find the right integration point.

**Wave 1 Quality Gate:**

- [ ] `tsc --noEmit` clean
- [ ] DXCC badge renders with all 5 color states
- [ ] CredentialUnlockDialog wires to existing credentialStore.ts
- [ ] useContestContext returns correct data for simulated CQ WW weekend
- [ ] QuietBandNav shows correct bands

---

### Wave 2: Awards + LoTW (Logbook Phase 2)

**Objective:** Build award tracking dashboard (DXCC/WAS/WAZ grids) and LoTW upload/download. Both need Phase 1 DXCC status and credential wiring.

**Parallel Tasks** (2 agents):

#### W2-A: Award Tracking Dashboard (Logbook 6.2)

**Owns exclusively:**

- `src/lib/awards/awardEngine.ts` (NEW) — Compute DXCC/WAS/WAZ progress from IndexedDB log entries. Functions: `computeDxccProgress()`, `computeWasProgress()`, `computeWazProgress()`. Use `by-dxcc` index for DXCC, scan for WAS (US states from `state` field), scan for WAZ (CQ zones from DXCC entities)
- `src/lib/awards/types.ts` (NEW) — `AwardProgress`, `DxccSlot`, `WasState`, `WazZone`, `SlotStatus` (needed | worked_unconfirmed | confirmed)
- `src/lib/awards/usStateMap.ts` (NEW) — US state mapping + SVG paths for WAS map visualization
- `src/hooks/useAwardProgress.ts` (MODIFY) — Extend existing hook to use new awardEngine. Note: this file already exists at `src/hooks/useAwardProgress.ts` — READ IT FIRST and enhance, don't replace
- `src/pages/AwardsPage.tsx` (NEW) — Tabbed page: DXCC | WAS | WAZ. Route: `/awards`. Add to App.tsx lazy route
- `src/components/awards/DxccGrid.tsx` (NEW) — Grid of DXCC entities with color-coded cells (needed/worked/confirmed). Filterable by band, mode, continent
- `src/components/awards/WasMap.tsx` (NEW) — SVG US map with state coloring (needed/worked/confirmed)
- `src/components/awards/WazGrid.tsx` (NEW) — 40-zone grid with status coloring
- `src/lib/db/types.ts` (MODIFY) — Add `state?: string` field to LogEntry interface
- `src/lib/db/config.ts` (MODIFY) — Add `by-state` index, bump DB version to 5

**Context for agent:** Read `src/lib/data/dxccEntities.ts` for entity structure. Read `src/hooks/useAwardProgress.ts` — it already derives WAS/WAZ/DXCC progress. Read `src/stores/dxccStore.ts` for existing DXCC tracking. The awards page should follow PRD color palette: confirmed = signal-green, worked_unconfirmed = caution-yellow, needed = gray. Performance: <500ms for 10K entries, <2s for 50K entries per QG-2.

#### W2-B: LoTW Integration (Logbook 6.3)

**Owns exclusively:**

- `src/lib/sync/lotwSync.ts` (NEW) — LoTW upload (TQSL-ready ADIF export) + download (parse confirmations via `api/log/lotw.ts`). Functions: `uploadToLotw()`, `downloadLotwConfirmations()`, `matchLotwConfirmations()`
- `src/hooks/useLotwSync.ts` (NEW) — Hook: `{ upload, download, uploading, downloading, lastSync, error }`
- `src/components/qso/LotwSyncButton.tsx` (NEW) — Upload/download button with progress indicator
- `src/components/qso/QslStatusIcons.tsx` (NEW) — Shared icon set for LoTW/eQSL/QRZ status display (reused across log table and detail modal)
- `api/log/lotw.ts` (MODIFY) — Verify/update upload + download proxy
- `src/lib/adif/import.ts` (MODIFY) — Add field mapping for QSL status fields (LOTW_QSL_SENT, LOTW_QSL_RCVD, EQSL_QSL_SENT, EQSL_QSL_RCVD)
- `src/components/qso/QSOLogTable.tsx` (MODIFY) — Add QSL status columns using QslStatusIcons
- `src/lib/db/logStore.ts` (MODIFY) — Add batch QSL status update function

**Context for agent:** Read `src/lib/api/logUpload.ts` for existing upload functions. Read `api/log/lotw.ts` for existing edge function. Read `src/lib/db/credentialStore.ts` for credential retrieval. LoTW upload path: generate ADIF → user signs with TQSL externally → upload signed file. Download path: call LoTW API with username/password from credential store → parse QSL confirmations → match against local log → update statuses. The QSL status fields already exist on LogEntry (qslSent/Rcvd, lotw, eqsl, lotwQslSent/Rcvd, clublogStatus, qrzcomStatus).

**Wave 2 Quality Gate:**

- [ ] `tsc --noEmit` clean
- [ ] Awards page loads with DXCC grid rendering mock data
- [ ] WAS map renders with state coloring
- [ ] LoTW upload generates valid ADIF
- [ ] LoTW download matches confirmations against local log
- [ ] QSL status columns visible in log table

---

### Wave 3: Band Map + Sync + Contest Explorer (Logbook Phase 3 + Contest Phase C part 1)

**Objective:** Build the band map widget and sync engine (core Logbook PRD), plus the contest explorer page (independent new files from Contest PRD). These workstreams have zero file overlap.

**Parallel Tasks** (3 agents):

#### W3-A: Band Map Widget (Logbook 6.4)

**Owns exclusively:**

- `src/components/qso/BandMap.tsx` (NEW) — SVG/canvas band map: horizontal frequency axis, vertical time axis, colored pips for spots. Uses DXCC status colors from useDxccStatus
- `src/components/qso/BandMapSpot.tsx` (NEW) — Individual spot pip component with tooltip (callsign, frequency, mode, DXCC status)
- `src/components/qso/BandMapControls.tsx` (NEW) — Band selector, time range, source toggle (bridge vs Supabase)
- `src/hooks/useBandMapSpots.ts` (NEW) — Poll Supabase `spot_history` or bridge for live spots. Functions: `useBandMapSpots(band, options)` returns `{ spots, loading, source }`
- `src/lib/data/bandRanges.ts` (NEW) — Band frequency ranges for band map rendering (start/end kHz per band)
- `src/components/qso/QSOEntryForm.tsx` (MODIFY) — Add band map auto-fill: click spot → populate form
- `src/pages/Logbook.tsx` (MODIFY) — Render band map in sidebar (desktop) or collapsible panel (mobile)

**Context for agent:** Read `src/hooks/useLiveSpots.ts` and `src/hooks/useSpotHistory.ts` for existing spot data patterns. Read `src/lib/data/bandplans.ts` for band plan structure. The band map should support both bridge (live, ~0s latency) and Supabase (2-5 min delay) data sources with a badge indicating which is active. Read the PRD feature 6.4 for full technical spec. UX: NOT horizontal scroll — use zoom (wheel/pinch) + pan.

#### W3-B: Supabase Sync Engine (Logbook 6.5)

**Owns exclusively:**

- `src/lib/sync/syncEngine.ts` (NEW) — Core sync orchestrator: delta sync with version vectors, conflict detection, batch operations. Uses existing SyncManager patterns
- `src/lib/sync/syncQueue.ts` (NEW) — Offline queue: enqueue changes while offline, flush when online. Max 2000 entries
- `src/hooks/useSyncEngine.ts` (NEW) — Lifecycle hook: start/stop sync, handle visibility changes, online/offline events
- `src/components/qso/SyncStatusIndicator.tsx` (NEW) — Header widget: syncing spinner, pending count, last sync time, error state
- `supabase/migrations/20260215000000_qso_sync.sql` (NEW) — `qso_log` table with RLS, version column, soft deletes, device_id
- `api/sync/qso.ts` (NEW) — Batch sync edge function: accept/return QSO deltas
- `src/lib/supabase.ts` (MODIFY) — Add spot query helpers
- `src/stores/authStore.ts` (MODIFY) — Trigger sync start/stop on auth state change
- `src/stores/rigStore.ts` (MODIFY) — Add `setFrequency()` action for click-to-tune from band map
- `src/stores/profileStore.ts` (MODIFY) — Add last sync timestamps
- `src/components/layout/Header.tsx` (MODIFY) — Render SyncStatusIndicator

**Context for agent:** Read `src/lib/sync/SyncManager.ts`, `src/lib/sync/writeQueue.ts`, `src/lib/sync/conflict.ts` for existing sync patterns. Read `src/lib/sync/modules/logbookSync.ts` for the existing logbook sync module (Tier 2 incremental). The new syncEngine should integrate with the existing SyncManager, not replace it. Read `src/lib/sync/types.ts` for `SyncableTable`, `SyncTier`, etc. The existing writeQueue in localStorage has 2000 max entries. The new sync engine uses version vectors for delta sync. Supabase project: `gideehcdegcadtzujpun`.

#### W3-C: Contest Explorer Page (Contest 7.6)

**Owns exclusively:**

- `src/pages/ContestExplorerPage.tsx` (NEW) — Full-page contest discovery: search, filter by difficulty/mode/month, card grid. Route: `/contests`
- `src/components/contest/ContestExplorerCard.tsx` (NEW) — Expandable card: contest name, dates, bands, modes, difficulty badge, participant estimate, expandable section with exchange format, tips, rules link
- `src/components/contest/StationEstimate.tsx` (NEW) — "Your station could make X-Y contacts" estimate based on shack profile (radio + antenna + power)
- `src/components/contest/ContestQuickStart.tsx` (NEW) — Contextual quick-start guide: what to say, how exchanges work, common mistakes
- `src/lib/contest/stationEstimator.ts` (NEW) — Algorithm: tier-based estimate (QRP/LP/HP × wire/yagi/beam → expected contacts range). Uses shackStore data
- `src/lib/contest/contestQuickStart.ts` (NEW) — Template engine for generating contest quick-start guides per contest type
- `src/lib/data/contestGlossary.ts` (NEW) — 20+ contest terms from PRD Appendix C (CQ Zone, exchange, mult, rate, run, S&P, etc.)
- `src/components/ui/GlossaryTooltip.tsx` (NEW) — Shared tooltip that shows definition when hovering glossary terms

**Context for agent:** Read `src/lib/data/contestCalendar.ts` (created in Wave 1) for calendar data. Read `src/stores/shackStore.ts` for equipment data used in station estimation. Read `src/lib/data/contests.ts` for existing contest database (28 entries). Read PRD feature 7.6 for full spec. The explorer should be beginner-friendly — plain language, difficulty ratings, encouraging tone. Add route to App.tsx.

**Wave 3 Quality Gate:**

- [ ] `tsc --noEmit` clean
- [ ] Band map renders with colored pips from Supabase spot data
- [ ] Sync engine round-trips between two browser tabs
- [ ] Contest Explorer renders all 30+ calendar entries
- [ ] Station estimate produces reasonable range for test station profile

---

### Wave 4: Activation Workflow + Contest Award Integration (Logbook Phase 4 + Contest Phase C part 2)

**Objective:** Build POTA/SOTA activation workflow (fastest-growing ham segment) and wire contest QSOs into award tracking and QSL batch workflows. No file conflicts between these.

**Parallel Tasks** (2 agents):

#### W4-A: POTA/SOTA Activation Workflow (Logbook 6.6)

**Owns exclusively:**

- `src/components/activation/ActivationPanel.tsx` (NEW) — Main activation UI: park/summit selector, QSO counter ring, quick log form, timer, ADIF export
- `src/components/activation/ParkSearch.tsx` (NEW) — Autocomplete search for POTA parks and SOTA summits via API
- `src/components/activation/ActivationCounter.tsx` (NEW) — Circular progress ring showing QSO count toward activation threshold (10 for POTA, 4 for SOTA)
- `src/components/activation/QuickLogForm.tsx` (NEW) — Stripped-down entry form optimized for mobile activation: callsign, RST, band/mode (auto from rig)
- `src/hooks/useActivation.ts` (NEW) — Activation state: active park/summit ref, QSO count, timer, threshold tracking
- `api/activation/pota.ts` (NEW) — POTA API proxy: park search, activation lookup
- `api/activation/sota.ts` (NEW) — SOTA API proxy: summit search, activation lookup
- `src/hooks/useCallsignLookup.ts` (MODIFY) — POTA/SOTA spot cross-reference: show if callsign is on an activation
- `src/lib/adif/export.ts` (MODIFY) — Filtered activation export with MY_SIG/MY_SIG_INFO fields

**Context for agent:** Read `src/stores/qsoStore.ts` for existing POTA/SOTA operating modes. The qsoStore already has `operatingMode: "pota" | "sota"` with corresponding `mySig`/`mySigInfo` fields. Read `src/components/qso/QSOEntryForm.tsx` for existing POTA/SOTA context fields. The activation workflow should integrate with the existing operating mode, not create a parallel system. POTA threshold: 10 QSOs. SOTA threshold: 4 QSOs. Mobile-first design for field use.

#### W4-B: Contest Award & QSL Integration (Contest 7.8, 7.9)

**Owns exclusively:**

- `src/lib/awards/contestAwardIntegration.ts` (NEW) — Bridge: compute how contest QSOs contribute to DXCC/WAS/WAZ progress. Functions: `getContestContributions(contestSessionId)`, `mergeContestQsosToAwards()`
- `src/components/awards/ContestContributions.tsx` (NEW) — Section in Awards page: "From CQ WW SSB 2026: +12 new DXCC, +5 new WAS states"
- `src/lib/contest/postContestBatch.ts` (NEW) — Post-contest QSL batch coordinator: select contest session → filter QSOs → upload to LoTW/eQSL/QRZ in batch
- `src/lib/contest/contestConfirmationTracker.ts` (NEW) — Track QSL confirmation rate for contest QSOs: X/Y confirmed on LoTW, X/Y on eQSL
- `src/components/qso/ContestQslBatch.tsx` (NEW) — Batch upload UI: session picker, service checkboxes, progress bars, error log
- `src/hooks/useDxccStatus.ts` (MODIFY) — Add optional `multiplierCheck` parameter for contest context
- `src/components/qso/DxccStatusBadge.tsx` (MODIFY) — Show dual status (DXCC + multiplier) during active contests
- `src/lib/awards/awardEngine.ts` (MODIFY) — Support `contestId` filter, operating mode filter
- `src/lib/db/types.ts` (MODIFY) — Add `contestId?: string` to LogEntry interface
- `src/stores/qsoStore.ts` (MODIFY) — Set contestId in contest mode
- `src/pages/AwardsPage.tsx` (MODIFY) — Insert ContestContributions section
- `src/components/qso/QslSyncPanel.tsx` (MODIFY) — Add contest batch tab
- `src/lib/db/logStore.ts` (MODIFY) — Add `getEntriesByContestId()` query

**Context for agent:** Read `src/stores/contestStore.ts` for ContestSession and ContestQSO shapes. Read `src/lib/awards/awardEngine.ts` (from Wave 2) for award computation. Read `src/lib/sync/lotwSync.ts` (from Wave 2) for LoTW upload pattern. The batch workflow should support LoTW + eQSL + QRZ services (eQSL/QRZ will be wired in Wave 5, so stub the calls for now). Read `src/components/qso/QslSyncPanel.tsx` (from Wave 2, if it exists; otherwise create integration point for Wave 5's QSL panel).

**Wave 4 Quality Gate:**

- [ ] `tsc --noEmit` clean
- [ ] Park/summit search returns results from POTA/SOTA APIs
- [ ] Activation counter increments and shows threshold ring
- [ ] ADIF export produces valid POTA-formatted file
- [ ] Contest contributions section shows correct counts from test contest data
- [ ] QSL batch UI correctly identifies contest QSOs for upload
- [ ] DXCC badge shows multiplier indicator during simulated contest

---

### Wave 5: eQSL + QRZ + Alerts + Filters (Logbook Phase 5)

**Objective:** Complete QSL service integrations (eQSL, QRZ), build the spot alert rules engine, and add log filter/export capabilities.

**Parallel Tasks** (2 agents):

#### W5-A: eQSL + QRZ + Log Filters (Logbook 6.7, 6.8, 6.11)

**Owns exclusively:**

- `src/lib/sync/eqslSync.ts` (NEW) — eQSL upload/download/match. Functions: `uploadToEqsl()`, `downloadEqslInbox()`, `matchEqslConfirmations()`
- `src/hooks/useEqslSync.ts` (NEW) — Hook: `{ upload, download, uploading, downloading, lastSync, error }`
- `src/components/qso/QslSyncPanel.tsx` (MODIFY) — Unified QSL panel: tabs for LoTW/eQSL/QRZ with per-service sync controls
- `src/lib/sync/qrzSync.ts` (NEW) — QRZ.com logbook sync: upload ADIF, download status
- `src/hooks/useQrzSync.ts` (NEW) — Hook: `{ upload, downloading, lastSync, error }`
- `api/log/qrz.ts` (NEW) — QRZ.com logbook API edge function
- `src/components/qso/FilterChips.tsx` (NEW) — Active filter chip bar with clear buttons. Shows active filters from QSOFilters with dismissible chips
- `api/log/eqsl.ts` (MODIFY) — Verify/update upload proxy
- `api/log/eqsl-inbox.ts` (MODIFY) — Verify/update inbox download proxy
- `src/components/qso/QSOLogTable.tsx` (MODIFY) — Integrate FilterChips, add QSL filter columns
- `src/lib/adif/export.ts` (MODIFY) — Support filtered export (export only visible/selected entries)

**Context for agent:** Read `src/lib/api/logUpload.ts` for existing `uploadToEqsl()`, `uploadToClublog()` patterns. Read `api/log/eqsl.ts` and `api/log/eqsl-inbox.ts` for existing edge functions. Read `src/lib/db/credentialStore.ts` for credential retrieval. Follow the same sync pattern established by LoTW in Wave 2. For QRZ, read the QRZ.com XML API docs — it uses an API key, not username/password. For FilterChips, read `src/types/qso.ts` for `QSOFilters` interface. Chips should show: band, mode, date range, callsign search, QSL status, DXCC, park/summit ref.

#### W5-B: Spot Alert Rules Engine (Logbook 6.9)

**Owns exclusively:**

- `src/lib/alerts/alertEngine.ts` (NEW) — Rule evaluation engine: evaluate spot against alert rules, dispatch notifications. Functions: `evaluateSpot()`, `matchesRule()`, `dispatchAlert()`
- `src/hooks/useSpotAlerts.ts` (NEW) — Supabase realtime subscription to `spot_history` table, pipe through alertEngine
- `src/components/alerts/AlertRuleBuilder.tsx` (NEW) — Rule creation form: callsign pattern, entity/continent, band/mode, SNR threshold, notification type
- `src/components/alerts/AlertToast.tsx` (NEW) — In-app toast notification for triggered alerts (NOT the existing AlertToast — check if name conflicts, may need different name)
- `src/components/alerts/AlertHistory.tsx` (NEW) — Alert history list: recent triggered alerts with dismiss/mute
- `src/stores/settingsStore.ts` (MODIFY) — Add alert sound preferences
- `src/lib/supabase.ts` (MODIFY) — Add realtime subscription helper for spots

**Context for agent:** Read `src/lib/db/alertStore.ts` for existing AlertRule and AlertHistoryEntry interfaces. Read `src/lib/db/types.ts` for AlertRule shape (conditions: callsignPattern, entityPattern, bands, modes, minSnr; notification: sound, browser, highlight). Read `src/stores/alertsStore.ts` for existing alert state management. Read `src/lib/contest/alerts.ts` for existing contest alert system pattern. The new alertEngine should use IndexedDB alertRules from the existing alertStore. Check for name conflicts with existing `src/components/alerts/AlertToast.tsx`.

**Wave 5 Quality Gate:**

- [ ] `tsc --noEmit` clean
- [ ] eQSL upload/download functional via edge function
- [ ] QRZ sync uploads ADIF
- [ ] Alert fires within 5s of matching spot
- [ ] Filter chips render and clear correctly
- [ ] ADIF export respects active filters
- [ ] QSL sync panel shows tabs for all 3 services

---

### Wave 6: Contest Band Map & Alert Intelligence (Contest Phase B)

**Objective:** Extend the band map (from Wave 3) with contest awareness, and extend the alert engine (from Wave 5) with contest intelligence. Requires both band map and alert engine to be stable.

**Parallel Tasks** (2 agents):

#### W6-A: Band Map Contest Awareness (Contest 7.3)

**Owns exclusively:**

- `src/lib/contest/spotContestClassifier.ts` (NEW) — Classify spots as contest-related using heuristics: time + band + mode + exchange pattern + SCP database match. Functions: `classifySpot()`, `isContestSpot()`, `getContestForSpot()`
- `src/lib/data/contestSubBands.ts` (NEW) — Sub-band frequency ranges from PRD Appendix B (CW/SSB/digital contest segments per band)
- `src/components/qso/BandMapContestMarker.tsx` (NEW) — Sub-band boundary overlay: shaded regions showing contest vs non-contest spectrum. Draggable boundary markers
- `src/components/qso/BandMapControls.tsx` (MODIFY) — Add contest filter toggle: "Hide contest spots"
- `src/components/qso/BandMapSpot.tsx` (MODIFY) — Contest visual differentiation: dim/gray contest spots when filter active, different pip shape for classified contest spots
- `src/components/qso/BandMap.tsx` (MODIFY) — Render sub-band markers, pipe spots through classifier, support contest filter
- `src/hooks/useBandMapSpots.ts` (MODIFY) — Pipe spots through `spotContestClassifier` before rendering

**Context for agent:** Read `src/components/qso/BandMap.tsx` (from Wave 3) for band map structure. Read `src/hooks/useContestContext.ts` (from Wave 1) for active contest data. Read PRD Appendix B for sub-band conventions. The classifier should use `useContestContext()` to know what contests are active, then match spots against sub-band ranges + exchange patterns. False positive rate should be < 10%.

#### W6-B: Alert Contest Intelligence (Contest 7.4)

**Owns exclusively:**

- `src/lib/alerts/contestAlertLogic.ts` (NEW) — Contest throttle middleware: reduce alert volume during contests by configurable multiplier (default 4x). Auto-switch alert profiles. Functions: `applyContestThrottle()`, `getActiveAlertProfile()`, `shouldThrottleAlert()`
- `src/components/alerts/ContestAlertProfiles.tsx` (NEW) — UI for managing contest-specific alert profiles: "During contests, only alert for new DXCC" presets
- `src/lib/alerts/alertEngine.ts` (MODIFY) — Inject contest middleware into evaluation pipeline
- `src/components/alerts/AlertRuleBuilder.tsx` (MODIFY) — Add contest filter field: "Only during contests" / "Only outside contests" / "Always"
- `src/stores/settingsStore.ts` (MODIFY) — Add alert throttle multiplier, contest alert profile preferences, auto-profile switching flag

**Context for agent:** Read `src/lib/alerts/alertEngine.ts` (from Wave 5) for alert engine structure. Read `src/hooks/useContestContext.ts` (from Wave 1) for contest detection. Read `src/stores/settingsStore.ts` for existing settings shape. The throttle middleware wraps the existing alert evaluation — it doesn't replace it. Contest alert profiles are named configurations (e.g., "Contest Mode: DX Only", "Contest Mode: New Band Only").

**Wave 6 Quality Gate:**

- [ ] `tsc --noEmit` clean
- [ ] Band map correctly hides contest-classified spots when filter active
- [ ] Sub-band markers render during simulated contest
- [ ] Alert throttling reduces alert frequency by configured multiplier
- [ ] Contest filter field visible in rule builder
- [ ] Alert profiles switchable

---

### Wave 7: Propagation Intelligence + DX Wizard (Contest Phase D)

**Objective:** The capstone features — use contest spot density as propagation intelligence signal, and make the DX Wizard contest-aware with recommendations for both contesters and non-contesters.

**Parallel Tasks** (2 agents):

#### W7-A: Contest Propagation Intelligence (Contest 7.7)

**Owns exclusively:**

- `src/lib/contest/contestPropIntel.ts` (NEW) — Analyze contest spot density for propagation signals. Functions: `computeContestDensity()`, `extractPropagationSignal()`, `getEnhancedConfidence()`. Uses spot_history volume spikes during contests as high-confidence propagation data
- `src/components/map/ContestHeatmapOverlay.tsx` (NEW) — Globe overlay: propagation path density heatmap during contests using Three.js. Color intensity = spot density between grid squares
- `src/hooks/useContestPropIntel.ts` (NEW) — Hook: `{ density, confidence, enhancedPaths, loading }`. Provides processed data for consumers
- `src/lib/services/bandOpeningService.ts` (MODIFY) — Accept sensitivity parameter from contest intel for enhanced band opening detection
- `src/components/solar/PropagationConfidence.tsx` (MODIFY) — Display enhanced confidence indicator during contests (e.g., "Confidence: HIGH — 45,000 active contest stations confirming 20m propagation to EU")

**Context for agent:** Read `src/lib/services/bandOpeningService.ts` for existing band opening detection. Read `src/lib/services/bandOpeningDetector.ts` for detection algorithm. Read `src/components/map/` for existing globe overlays — follow the same Three.js patterns. Read `src/hooks/useSpotHistory.ts` for spot data access. The key insight: during major contests, 10K-50K stations are effectively probing propagation paths. This volume provides much higher confidence for propagation predictions than normal spot density.

#### W7-B: DX Wizard Contest Awareness (Contest 7.10)

**Owns exclusively:**

- `src/lib/contest/contestCongestionModel.ts` (NEW) — Model QRM impact during contests: estimate congestion per band/mode, recommend alternatives for non-contesters. Functions: `estimateCongestion()`, `getAlternatives()`, `getClearFrequency()`
- `src/components/dx/DxWizardContestNote.tsx` (NEW) — Inline callout in DX Wizard results: "CQ WW SSB is active — 20m is congested. Consider 30m or 17m for your QSO." Includes link to QuietBandNav
- `src/components/dx/DxWizard.tsx` (MODIFY) — Inject contest context into recommendations: add contest notes, adjust band recommendations based on congestion model

**Context for agent:** Read `src/pages/DXWizard.tsx` and `src/components/dx/` for existing DX Wizard structure. Read `src/hooks/useContestContext.ts` for contest state. The DX Wizard should surface contest context without being preachy — it's informational, not judgmental. Show alternatives, not warnings. For non-contesters: "Here's where to find clear spectrum." For contesters: "20m is your best bet for EU multipliers right now."

**Wave 7 Quality Gate:**

- [ ] `tsc --noEmit` clean
- [ ] Full `vite build` clean (this is the final build gate)
- [ ] Propagation confidence indicator shows enhanced value during simulated contest
- [ ] Heatmap renders on globe with test spot data
- [ ] DX Wizard shows contest notes during simulated contest
- [ ] DX Wizard shows alternatives for non-contesters
- [ ] Congestion model produces reasonable estimates

---

## Final Deliverable Review

**MANDATORY:** After Wave 7 completes:

1. **`final-review-completeness`** agent — Full codebase scan for:
   - Incomplete implementations (TODOs, placeholders, stubs)
   - Missing imports or exports
   - Unreferenced files (created but never imported)
   - Route registration for new pages (/awards, /contests)
   - Navigation integration (Header, BottomTabBar, ToolsDrawer)

2. **`principal-code-reviewer`** agent — Comprehensive quality assessment:
   - Security: credential handling, XSS in user-generated content, API key exposure
   - Performance: IndexedDB query efficiency, unnecessary re-renders, bundle size impact
   - Architecture: store design, hook patterns, component composition
   - UX: no flyout panels, centered modals, keyboard navigation

---

## File Ownership Matrix

This matrix prevents parallel agent conflicts. Each file is owned by exactly one agent in each wave.

### Wave 1

| File                                                 | Owner |
| ---------------------------------------------------- | ----- |
| `src/hooks/useDxccStatus.ts`                         | W1-A  |
| `src/components/qso/DxccStatusBadge.tsx`             | W1-A  |
| `src/lib/db/logStore.ts`                             | W1-A  |
| `src/components/qso/QSOEntryForm.tsx`                | W1-A  |
| `src/hooks/useQSOEntry.ts`                           | W1-A  |
| `src/components/settings/CredentialUnlockDialog.tsx` | W1-B  |
| `src/stores/profileStore.ts`                         | W1-B  |
| `src/pages/SettingsPage.tsx`                         | W1-B  |
| `src/lib/data/contestCalendar.ts`                    | W1-C  |
| `src/lib/contest/contestCalendarTypes.ts`            | W1-C  |
| `src/hooks/useContestContext.ts`                     | W1-C  |
| `src/lib/contest/contestCalendarSync.ts`             | W1-C  |
| `src/components/contest/ContestCalendar.tsx`         | W1-C  |
| `src/components/dashboard/ContestWeatherCard.tsx`    | W1-D  |
| `src/components/dashboard/ContestCountdown.tsx`      | W1-D  |
| `src/components/contest/QuietBandNav.tsx`            | W1-D  |
| `src/stores/settingsStore.ts`                        | W1-D  |
| `src/pages/Logbook.tsx`                              | W1-D  |

### Wave 2

| File                                    | Owner |
| --------------------------------------- | ----- |
| `src/lib/awards/*` (3 new files)        | W2-A  |
| `src/hooks/useAwardProgress.ts`         | W2-A  |
| `src/pages/AwardsPage.tsx`              | W2-A  |
| `src/components/awards/*` (3 new files) | W2-A  |
| `src/lib/db/types.ts`                   | W2-A  |
| `src/lib/db/config.ts`                  | W2-A  |
| `src/lib/sync/lotwSync.ts`              | W2-B  |
| `src/hooks/useLotwSync.ts`              | W2-B  |
| `src/components/qso/LotwSyncButton.tsx` | W2-B  |
| `src/components/qso/QslStatusIcons.tsx` | W2-B  |
| `api/log/lotw.ts`                       | W2-B  |
| `src/lib/adif/import.ts`                | W2-B  |
| `src/components/qso/QSOLogTable.tsx`    | W2-B  |
| `src/lib/db/logStore.ts`                | W2-B  |

### Wave 3

| File                                                  | Owner |
| ----------------------------------------------------- | ----- |
| `src/components/qso/BandMap*.tsx` (3 new)             | W3-A  |
| `src/hooks/useBandMapSpots.ts`                        | W3-A  |
| `src/lib/data/bandRanges.ts`                          | W3-A  |
| `src/components/qso/QSOEntryForm.tsx`                 | W3-A  |
| `src/pages/Logbook.tsx`                               | W3-A  |
| `src/lib/sync/syncEngine.ts`                          | W3-B  |
| `src/lib/sync/syncQueue.ts`                           | W3-B  |
| `src/hooks/useSyncEngine.ts`                          | W3-B  |
| `src/components/qso/SyncStatusIndicator.tsx`          | W3-B  |
| `supabase/migrations/*`                               | W3-B  |
| `api/sync/qso.ts`                                     | W3-B  |
| `src/lib/supabase.ts`                                 | W3-B  |
| `src/stores/authStore.ts`                             | W3-B  |
| `src/stores/rigStore.ts`                              | W3-B  |
| `src/stores/profileStore.ts`                          | W3-B  |
| `src/components/layout/Header.tsx`                    | W3-B  |
| `src/pages/ContestExplorerPage.tsx`                   | W3-C  |
| `src/components/contest/ContestExplorer*.tsx` (2 new) | W3-C  |
| `src/components/contest/StationEstimate.tsx`          | W3-C  |
| `src/components/contest/ContestQuickStart.tsx`        | W3-C  |
| `src/lib/contest/stationEstimator.ts`                 | W3-C  |
| `src/lib/contest/contestQuickStart.ts`                | W3-C  |
| `src/lib/data/contestGlossary.ts`                     | W3-C  |
| `src/components/ui/GlossaryTooltip.tsx`               | W3-C  |

### Wave 4

| File                                             | Owner |
| ------------------------------------------------ | ----- |
| `src/components/activation/*` (4 new)            | W4-A  |
| `src/hooks/useActivation.ts`                     | W4-A  |
| `api/activation/*` (2 new)                       | W4-A  |
| `src/hooks/useCallsignLookup.ts`                 | W4-A  |
| `src/lib/adif/export.ts`                         | W4-A  |
| `src/lib/awards/contestAwardIntegration.ts`      | W4-B  |
| `src/components/awards/ContestContributions.tsx` | W4-B  |
| `src/lib/contest/postContestBatch.ts`            | W4-B  |
| `src/lib/contest/contestConfirmationTracker.ts`  | W4-B  |
| `src/components/qso/ContestQslBatch.tsx`         | W4-B  |
| `src/hooks/useDxccStatus.ts`                     | W4-B  |
| `src/components/qso/DxccStatusBadge.tsx`         | W4-B  |
| `src/lib/awards/awardEngine.ts`                  | W4-B  |
| `src/lib/db/types.ts`                            | W4-B  |
| `src/stores/qsoStore.ts`                         | W4-B  |
| `src/pages/AwardsPage.tsx`                       | W4-B  |
| `src/components/qso/QslSyncPanel.tsx`            | W4-B  |
| `src/lib/db/logStore.ts`                         | W4-B  |

### Wave 5

| File                                         | Owner |
| -------------------------------------------- | ----- |
| `src/lib/sync/eqslSync.ts`                   | W5-A  |
| `src/hooks/useEqslSync.ts`                   | W5-A  |
| `src/components/qso/QslSyncPanel.tsx`        | W5-A  |
| `src/lib/sync/qrzSync.ts`                    | W5-A  |
| `src/hooks/useQrzSync.ts`                    | W5-A  |
| `api/log/qrz.ts`                             | W5-A  |
| `src/components/qso/FilterChips.tsx`         | W5-A  |
| `api/log/eqsl.ts`                            | W5-A  |
| `api/log/eqsl-inbox.ts`                      | W5-A  |
| `src/components/qso/QSOLogTable.tsx`         | W5-A  |
| `src/lib/adif/export.ts`                     | W5-A  |
| `src/lib/alerts/alertEngine.ts`              | W5-B  |
| `src/hooks/useSpotAlerts.ts`                 | W5-B  |
| `src/components/alerts/AlertRuleBuilder.tsx` | W5-B  |
| `src/components/alerts/AlertToast.tsx`       | W5-B  |
| `src/components/alerts/AlertHistory.tsx`     | W5-B  |
| `src/stores/settingsStore.ts`                | W5-B  |
| `src/lib/supabase.ts`                        | W5-B  |

### Wave 6

| File                                             | Owner |
| ------------------------------------------------ | ----- |
| `src/lib/contest/spotContestClassifier.ts`       | W6-A  |
| `src/lib/data/contestSubBands.ts`                | W6-A  |
| `src/components/qso/BandMapContestMarker.tsx`    | W6-A  |
| `src/components/qso/BandMapControls.tsx`         | W6-A  |
| `src/components/qso/BandMapSpot.tsx`             | W6-A  |
| `src/components/qso/BandMap.tsx`                 | W6-A  |
| `src/hooks/useBandMapSpots.ts`                   | W6-A  |
| `src/lib/alerts/contestAlertLogic.ts`            | W6-B  |
| `src/components/alerts/ContestAlertProfiles.tsx` | W6-B  |
| `src/lib/alerts/alertEngine.ts`                  | W6-B  |
| `src/components/alerts/AlertRuleBuilder.tsx`     | W6-B  |
| `src/stores/settingsStore.ts`                    | W6-B  |

### Wave 7

| File                                             | Owner |
| ------------------------------------------------ | ----- |
| `src/lib/contest/contestPropIntel.ts`            | W7-A  |
| `src/components/map/ContestHeatmapOverlay.tsx`   | W7-A  |
| `src/hooks/useContestPropIntel.ts`               | W7-A  |
| `src/lib/services/bandOpeningService.ts`         | W7-A  |
| `src/components/solar/PropagationConfidence.tsx` | W7-A  |
| `src/lib/contest/contestCongestionModel.ts`      | W7-B  |
| `src/components/dx/DxWizardContestNote.tsx`      | W7-B  |
| `src/components/dx/DxWizard.tsx`                 | W7-B  |

---

## Navigation & Route Integration

New routes to add to `src/App.tsx` (handle from main thread after agent waves):

| Route       | Component             | Page                         | Wave |
| ----------- | --------------------- | ---------------------------- | ---- |
| `/awards`   | `AwardsPage`          | Award tracking dashboard     | 2    |
| `/contests` | `ContestExplorerPage` | Contest discovery/onboarding | 3    |

Navigation updates (handle from main thread after agent waves):

- `src/components/layout/Header.tsx` — Add "Awards" nav link
- `src/components/layout/BottomTabBar.tsx` — Consider adding Awards tab (or keep in ToolsDrawer)
- `src/components/layout/ToolsDrawer.tsx` — Add Awards and Contest Explorer links

Barrel index updates (handle from main thread after each wave):

- `src/components/qso/index.ts` — Export new QSO components
- `src/components/alerts/index.ts` — Export new alert components (if barrel exists)
- `src/components/awards/index.ts` — Create barrel for awards components
- `src/components/activation/index.ts` — Create barrel for activation components

---

## Rollback Plan

Each wave produces independently verifiable output. If a wave fails:

1. `git stash` or `git reset --soft` to the last passing wave commit
2. Diagnose the failure using `tsc --noEmit` errors
3. Re-run only the failing agent with corrections
4. The wave structure ensures no forward dependencies are broken

---

## Risks and Mitigations

| Risk                                        | Likelihood | Impact | Mitigation                                                               |
| ------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------ |
| File conflict between parallel agents       | Med        | High   | Strict file ownership matrix, verified before each wave                  |
| LoTW API changes or authentication issues   | Med        | Med    | Edge function proxy insulates frontend; credential store handles auth    |
| IndexedDB 50K limit hit during award scan   | Low        | High   | useAwardProgress already works with IDB; paginate if needed              |
| Band map performance with 1000+ spots       | Med        | Med    | Virtual rendering, throttled updates, time-window filtering              |
| Contest classifier false positives          | Med        | Low    | Tunable threshold, user can disable filter, SCP database cross-reference |
| Sync engine race conditions                 | Med        | High   | Version vectors, idempotent operations, existing conflict resolution     |
| Bundle size increase (~73 new files)        | Low        | Med    | All pages already lazy-loaded; new components follow same pattern        |
| stale TypeScript diagnostics between agents | High       | Low    | Run `tsc --noEmit` after each wave from main thread, never trust IDE     |

## Open Questions

Both PRDs have open questions that should be answered before implementation:

**Before Wave 1:**

- Color palette conflict: "New Band" (signal-green) vs "Confirmed" (signal-green) — PRD Q9
- WARC band definition: include 60m? — Contest PRD Q6

**Before Wave 3:**

- Sync: Supabase Realtime vs polling? — Logbook PRD Q3
- Contest calendar: static bundle vs external API? — Contest PRD Q1 (recommended: static + Supabase overlay)

**Before Wave 4:**

- POTA API: direct frontend or edge function? — Logbook PRD Q6

**Before Wave 5:**

- Alert audio: Web Audio API or HTML5 Audio? — Logbook PRD Q7
- Auto-profile switching: opt-in or opt-out? — Contest PRD Q5

**Before Wave 6:**

- Spot classification: heuristic vs definitive? — Contest PRD Q2

**Before Wave 7:**

- Contest heatmap: client-side vs server-side aggregation? — Contest PRD Q4
- Station estimate: simple tiers vs full simulation? — Contest PRD Q3

---

**USER: Please review this plan. Edit any section directly, then confirm to proceed.**
