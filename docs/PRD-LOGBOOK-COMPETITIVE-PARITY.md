# PRD: Logbook Competitive Parity & Differentiation

**Version:** 1.1
**Date:** 2026-02-15
**Status:** Draft (post-review revision)
**Reference:** `docs/research/QLOG-COMPETITIVE-ANALYSIS.md`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [What Exists Today](#3-what-exists-today)
4. [What This Plan Adds](#4-what-this-plan-adds)
5. [User Personas](#5-user-personas)
6. [Feature Specifications](#6-feature-specifications)
   - 6.1 Callsign DXCC Status System
   - 6.2 Award Tracking Dashboard
   - 6.3 LoTW Integration
   - 6.4 Band Map Widget
   - 6.5 Supabase Sync Engine
   - 6.6 POTA/SOTA Activation Workflow
   - 6.7 eQSL Integration
   - 6.8 QRZ.com Logbook Sync
   - 6.8.1 Cross-Cutting: Auto-Upload QSL Workflow
   - 6.9 Spot Alert Rules Engine
   - 6.10 QSL Credential Wiring
   - 6.11 Cross-Cutting: Log Filter & Export Capabilities
7. [Integration Points Map](#7-integration-points-map)
8. [Implementation Phases](#8-implementation-phases)
9. [File Inventory](#9-file-inventory)
10. [Quality Gates](#10-quality-gates)
11. [Open Questions](#11-open-questions)

---

## 1. Executive Summary

The QLog competitive analysis revealed 5 critical gaps blocking adoption by serious operators and 6 high-value differentiators that would drive switching. This PRD specifies 10 features across two tiers that transform Propulse from a propagation dashboard with logging into a complete operating platform.

**The thesis:** Match DXer table stakes (DXCC coloring, awards, LoTW, band map, sync) then leapfrog with intelligence-powered features no desktop app can deliver (propagation-aware alerts, mobile activation mode, globe-integrated award tracking).

**Estimated scope:** ~45 new files, ~22 modified files, ~8,000-12,000 new lines across 5 implementation phases.

---

## 2. Goals & Non-Goals

### Goals

1. Achieve feature parity on the 5 features that cause immediate dismissal by DXers
2. Deliver multi-device sync -- QLog's #1 user-requested feature they can never build
3. Build a POTA/SOTA activation workflow that wins the fastest-growing ham segment
4. Integrate LoTW, eQSL, and QRZ.com -- the 3 QSL services that cover 95% of operators
5. Create a spot-aware band map that bridges our collector pipeline to the logbook

### Non-Goals

- Contest scoring engine expansion beyond existing 19 definitions (N1MM parity for exotic contest types is not a goal for this PRD -- the existing contest scoring engine with real-time scoring, multiplier tracking, rate sheets, and SCP is sufficient)
- CW keyer / rotator control (hardware integration via bridge is future work)
- WSJT-X bidirectional integration (depends on bridge protocol extensions, separate PRD)
- Cloudlog/Wavelog/HRDLog sync (niche, post-launch)
- Club Log integration (existing `api/log/clublog.ts` edge function and `clublogStatus` field provide the foundation; full integration follows the same pattern as 6.7/6.8 and is deferred to post-launch)
- Column drag-reorder in log table (polish, not strategic)
- Internationalization (English market focus)

> **Scope note — Log statistics:** Live rate, efficiency percentage, time-to-completion, and peak rate window are valuable session metrics but belong to the existing contest scoring / QSO log table infrastructure, not a new feature in this PRD. Implementation may surface as polish during Phase 2 (award dashboard) or Phase 4 (activation counter). No separate feature spec is needed.

---

## 3. What Exists Today

| Component           | Location                                                    | State                                                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QSO Entry Form      | `src/components/qso/QSOEntryForm.tsx`                       | Full -- flat form, mode pills, Enter-to-log, rig auto-fill                                                                                                                                                               |
| QSO Log Table       | `src/components/qso/QSOLogTable.tsx`                        | Full -- sort, filter, inline edit, selection                                                                                                                                                                             |
| QSO Store           | `src/stores/qsoStore.ts` (~800 lines)                       | Full -- 22 form fields, 5 operating modes, dupe check, lookup                                                                                                                                                            |
| IndexedDB LogEntry  | `src/lib/db/types.ts`, `src/lib/db/logStore.ts`             | Full -- 50K entry limit, 8 indexes including `by-dxcc`, `by-mySig`                                                                                                                                                       |
| DXCC Entity Lookup  | `src/lib/data/dxccEntities.ts`                              | Full -- ~340 entities, longest-prefix-match, lat/lon/zones                                                                                                                                                               |
| ADIF Import/Export  | `src/lib/adif/`                                             | Full -- ADIF 3.1.4, field mapping, logger detection                                                                                                                                                                      |
| Cabrillo Export     | `src/lib/adif/`                                             | Full -- Cabrillo 3.0 with headers                                                                                                                                                                                        |
| Callsign Lookup API | `api/callsign/lookup.ts`, `qrz.ts`, `hamqth.ts`             | Full -- Callook, QRZ, HamQTH providers                                                                                                                                                                                   |
| QSL Status Fields   | LogEntry type                                               | Partial -- `qslSent/Rcvd`, `lotw`, `eqsl`, `lotwQslSent/Rcvd`, `clublogStatus`, `qrzcomStatus` fields exist but no API integration                                                                                       |
| Conflict Resolution | `src/lib/sync/conflict.ts`                                  | Full -- 21 conflict fields, 13 auto-merge fields, field-level resolution UI                                                                                                                                              |
| Device ID System    | `src/lib/sync/deviceId.ts`                                  | Full -- persistent device fingerprint                                                                                                                                                                                    |
| Supabase Client     | `src/lib/supabase.ts`                                       | Full -- client configured, project `gideehcdegcadtzujpun`                                                                                                                                                                |
| Profile Store       | `src/stores/profileStore.ts`                                | Full -- station callsign, grid, lat/lon, saved locations, service credentials                                                                                                                                            |
| Spot Collector      | `collector/src/` (Railway)                                  | Full -- PSKReporter + RBN + DXCluster, 21M spots/day, `spot_history` table                                                                                                                                               |
| Solar Collector     | `collector/src/` (Railway)                                  | Full -- 11 solar parameters, `solar_snapshots` + `band_hourly_stats`                                                                                                                                                     |
| Alert Store         | `src/lib/db/`                                               | Partial -- `alertRules` + `alertHistory` object stores exist in IndexedDB                                                                                                                                                |
| Rig Store           | `src/stores/rigStore.ts`                                    | Full -- frequency, mode, band, connected, PTT state                                                                                                                                                                      |
| Operating Modes     | qsoStore                                                    | Full -- `general`, `pota`, `sota`, `contest`, `fieldday`                                                                                                                                                                 |
| Log Edge Functions  | `api/log/lotw.ts`, `eqsl.ts`, `eqsl-inbox.ts`, `clublog.ts` | Exist -- endpoints created but need verification                                                                                                                                                                         |
| Credential Vault    | `src/lib/db/credentialStore.ts`                             | **Full** -- AES-256-GCM + PBKDF2 (100K iterations), IndexedDB `propulse-credentials` DB, auto-lock after 30 min, sentinel passphrase verification, per-service encrypt/decrypt. Supports lotw/clublog/eqsl/qrz services. |
| Contest Scoring     | `src/lib/contest/`, `src/stores/contestStore.ts`            | Full -- 19 contest definitions, real-time scoring, multiplier tracking, rate sheets, SCP                                                                                                                                 |

---

## 4. What This Plan Adds

| #   | Feature                            | Tier | New Files | Modified Files |
| --- | ---------------------------------- | ---- | --------- | -------------- |
| 1   | Callsign DXCC Status System        | 0    | 2         | 4              |
| 2   | Award Tracking Dashboard           | 0    | 8         | 3              |
| 3   | LoTW Integration                   | 0    | 4         | 5              |
| 4   | Band Map Widget                    | 0    | 5         | 4              |
| 5   | Supabase Sync Engine               | 0    | 6         | 5              |
| 6   | POTA/SOTA Activation Workflow      | 1    | 7         | 4              |
| 7   | eQSL Integration                   | 1    | 3         | 3              |
| 8   | QRZ.com Logbook Sync               | 1    | 2         | 3              |
| 8.1 | Cross-Cutting: Auto-Upload QSL     | --   | 0         | 0 (wiring)     |
| 9   | Spot Alert Rules Engine            | 1    | 5         | 3              |
| 10  | QSL Credential Wiring              | 0\*  | 1         | 2              |
| 11  | Cross-Cutting: Log Filter & Export | --   | 1         | 2              |

> \*Feature 6.10 revised: The credential vault (`src/lib/db/credentialStore.ts`) already exists with full AES-256-GCM + PBKDF2 encryption, auto-lock, and per-service storage. This feature is reduced to wiring the existing vault into QSL service integrations and adding a `CredentialUnlockDialog` + passphrase setup prompt in settings. Reclassified as P0 since it blocks all QSL features.
>
> Features 6.8.1 and 6.11 are cross-cutting concerns that don't introduce their own phase but are implemented alongside the features they augment.

---

## 5. User Personas

### Dana the DXer

- **Profile:** Extra-class, 20+ years, chases DXCC Honor Roll. Runs Icom IC-7851 + SteppIR beam.
- **Needs:** Instant DXCC status on callsign entry, award progress tracking, LoTW confirmations, band map with click-to-tune, spot alerts for new entities.
- **Switching trigger:** "If I can't see whether a callsign is a new entity at a glance, I'm staying with QLog."
- **Key features:** 6.1, 6.2, 6.3, 6.4, 6.9

### Pat the POTA Activator

- **Profile:** General-class, 3 years, activates 2-3 parks/month with IC-705 + EFHW. Logs on phone in the field.
- **Needs:** Park reference lookup, running QSO count toward activation requirement, quick ADIF export, works offline at parks with no cell service.
- **Switching trigger:** "I need to log 10 contacts in the rain with gloves on. Big buttons, zero friction."
- **Key features:** 6.6, 6.5

### Sam the Shack Operator

- **Profile:** Extra-class, 10 years, mixed DX/ragchewing. Runs home station + portable. Uses LoTW and eQSL.
- **Needs:** QSL confirmations tracked across services, logs synced between desktop and tablet, secure credential storage.
- **Switching trigger:** "I log at home and at Field Day. I need my log everywhere."
- **Key features:** 6.3, 6.5, 6.7, 6.8, 6.10

### Nico the Newcomer

- **Profile:** Technician, 6 months, exploring HF with Xiegu G90. Overwhelmed by logging software.
- **Needs:** Simple defaults that "just work," visual feedback that teaches (DXCC colors explain what's special about a contact), award tracking that gamifies progression.
- **Switching trigger:** "I don't even know what DXCC means yet but the colors make me want to chase the red ones."
- **Key features:** 6.1, 6.2

---

## 6. Feature Specifications

---

### 6.1 Callsign DXCC Status System

**Priority:** P0 (Tier 0) | **Effort:** Small | **Persona:** Dana, Nico

#### Overview

When an operator enters a callsign, instantly color-code it based on DXCC working status. This is QLog's most praised feature and the #1 visual feedback mechanism for DXers.

#### User Stories

**US-6.1.1: DXer sees instant DXCC status on callsign entry**

> As a DXer, when I type a callsign into the entry form, I want to see an immediate color-coded indicator showing whether this is a new DXCC entity, a new band/mode for an existing entity, or a duplicate, so I can prioritize my operating time.

**Acceptance Criteria:**

- [ ] Callsign input field background/border changes color within 200ms of 3+ characters typed
- [ ] Color scheme: `alert-red` = new DXCC entity (never worked), `signal-green` = new band-slot (entity worked but not on this band), `nebula-blue` = new mode-slot (entity+band worked but not this mode), `plasma-orange` = already worked on this band+mode, `void` (dim) = duplicate (same callsign+band+mode+date)
- [ ] A small badge/pill next to the callsign field shows the status text: "New Entity!", "New Band", "New Mode", "Worked", "Dupe"
- [ ] Works without internet (queries local IndexedDB log)
- [ ] Debounced: does not fire on every keystroke, waits 200ms after last character

**US-6.1.2: Newcomer learns DX significance through color**

> As a newcomer, when I see a red callsign indicator, I want a tooltip or label explaining "New DXCC Entity -- you've never contacted this country before!" so I learn what makes contacts special.

**Acceptance Criteria:**

- [ ] Each color state has a hover tooltip with a one-sentence explanation
- [ ] Tooltip mentions the DXCC entity name and count (e.g., "Japan (JA) -- Entity #339 -- New! You have 47 of 340 entities")
- [ ] Mobile: tooltip content appears inline below the callsign field (no hover on touch)

**US-6.1.3: Status considers band and mode context**

> As a DXer, the DXCC status must consider my current band and mode settings, so "New Band" means I haven't worked this entity on THIS band specifically.

**Acceptance Criteria:**

- [ ] Status computation uses the current form band and mode values
- [ ] Changing band or mode re-evaluates the status without re-typing the callsign
- [ ] If band/mode come from rig (CAT), status updates when rig frequency changes

#### Technical Design

```
Hook: useDxccStatus(callsign: string, band: string, mode: string)
  → Returns: { status, entity, workedBands, workedModes, totalEntities, tooltipText }

Data flow:
  1. callsign → lookupDxccEntity() (existing, from dxccEntities.ts)
  2. entity.id → query IndexedDB logEntries by-dxcc index
  3. Filter results by band, mode → determine status enum
  4. Return memoized result (cache by callsign+band+mode)
```

**New IndexedDB query** in `logStore.ts`:

```typescript
getWorkedDxccSlots(dxccId: number): Promise<{ band: string; mode: string }[]>
// Returns all unique band+mode combos for a DXCC entity
```

#### Integration Points

| Integrates With    | How                                                         |
| ------------------ | ----------------------------------------------------------- |
| `dxccEntities.ts`  | `lookupDxccEntity(callsign)` for entity resolution          |
| `logStore.ts`      | New `getWorkedDxccSlots()` query against `by-dxcc` index    |
| `QSOEntryForm.tsx` | Renders `DxccStatusBadge` next to callsign input            |
| `qsoStore.ts`      | Reads `form.band` and `form.mode` for context               |
| `rigStore.ts`      | When rig-connected, band/mode changes trigger re-evaluation |

#### Files

| File                                     | Action     | Purpose                                              |
| ---------------------------------------- | ---------- | ---------------------------------------------------- |
| `src/hooks/useDxccStatus.ts`             | **New**    | Hook: callsign+band+mode → status enum + metadata    |
| `src/components/qso/DxccStatusBadge.tsx` | **New**    | Color-coded badge with tooltip, inline for mobile    |
| `src/lib/db/logStore.ts`                 | **Modify** | Add `getWorkedDxccSlots()`                           |
| `src/components/qso/QSOEntryForm.tsx`    | **Modify** | Wire `DxccStatusBadge` next to callsign input        |
| `src/stores/qsoStore.ts`                 | **Modify** | Expose band/mode reactivity for the hook             |
| `src/hooks/useQSOEntry.ts`               | **Modify** | Trigger status re-evaluation on rig frequency change |

---

### 6.2 Award Tracking Dashboard

**Priority:** P0 (Tier 0) | **Effort:** Medium | **Persona:** Dana, Nico

#### Overview

A dedicated awards page showing progress toward DXCC, WAS, WAZ, and gridsquare achievements with visual progress grids. QLog has 13 award programs; we start with the 4 that matter most and design the system to be extensible.

#### User Stories

**US-6.2.1: DXer tracks DXCC progress by band and mode**

> As a DXer, I want a grid showing all 340 DXCC entities with cells colored by status (confirmed/worked/needed) filterable by band and mode, so I can see exactly what I need for DXCC Honor Roll.

**Acceptance Criteria:**

- [ ] Grid displays all ~340 active DXCC entities grouped by continent
- [ ] Each cell is color-coded: `signal-green` = confirmed (LoTW/eQSL/paper), `caution-yellow` = worked but unconfirmed, transparent/dim = needed
- [ ] Filter dropdowns: Band (All / per-band), Mode (All / CW / Phone / Digital)
- [ ] Summary header: "DXCC Progress: 147 Confirmed / 203 Worked / 340 Total"
- [ ] Click an entity cell to see all QSOs with that entity (opens filtered log view)
- [ ] Responsive: grid cells smaller on mobile, still readable

**US-6.2.2: US operator tracks Worked All States**

> As a US operator, I want a WAS map showing all 50 states colored by confirmation status, so I can see which states I still need.

**Acceptance Criteria:**

- [ ] SVG map of US with states colored: green=confirmed, yellow=worked, gray=needed
- [ ] Filter by band and mode
- [ ] Click state to see QSOs from that state
- [ ] Summary: "WAS: 42/50 Confirmed"

**US-6.2.3: DXer tracks WAZ progress**

> As a DXer, I want a WAZ (Worked All Zones) grid showing all 40 CQ zones, so I can track zone progress.

**Acceptance Criteria:**

- [ ] Grid of 40 CQ zones, color-coded by status
- [ ] Filter by band and mode
- [ ] World map overlay option showing zones geographically

**US-6.2.4: Gridsquare hunter tracks grid progress**

> As a VHF/UHF operator, I want a Maidenhead grid map showing which 2-character and 4-character grids I've worked, so I can chase grid squares.

**Acceptance Criteria:**

- [ ] World grid overlay (2-char fields: 324 total, e.g., FN, EM)
- [ ] Color by status: green=confirmed, yellow=worked, gray=needed
- [ ] Toggle between 2-char (field) and 4-char (square) resolution
- [ ] Summary: "Grids: 87 Confirmed / 143 Worked"

**US-6.2.5: Award data computes from local log**

> As an operator, award progress must compute entirely from my IndexedDB log entries, working offline, without requiring any server round-trip.

**Acceptance Criteria:**

- [ ] All award computations query IndexedDB directly
- [ ] Confirmation status derived from `qslRcvd === "Y"` OR `lotw === true` OR `eqsl === true`
- [ ] Computation cached and invalidated only when log entries change (precomputed on QSO add/edit/delete, stored in IndexedDB or in-memory cache -- award page load is O(1) read, not O(n) scan)
- [ ] Page loads in <500ms for 10,000 QSO logs, <2s for 50,000 logs
- [ ] Computation runs in a Web Worker to keep UI thread free during recomputation on large logs

#### Technical Design

```
Core engine: src/lib/awards/awardEngine.ts
  - computeDxccProgress(entries, filters) → DxccProgress
  - computeWasProgress(entries, filters) → WasProgress
  - computeWazProgress(entries, filters) → WazProgress
  - computeGridProgress(entries, filters) → GridProgress

Each returns:
  { confirmed: Set<string>, worked: Set<string>, total: number, byBand: Map, byMode: Map }

Hook: useAwardProgress(awardType, filters)
  → Reads all LogEntries from IndexedDB (one scan)
  → Memoizes by (entryCount + filters hash)
  → Returns typed progress object
```

**US-6.2.6: Imported ADIF data populates award fields**

> As an operator importing my existing log, I want STATE, DXCC, CQ_ZONE, ITU_ZONE, and gridsquare fields from the ADIF to be mapped to the correct LogEntry fields, so my award tracking is accurate from the first import.

**Acceptance Criteria:**

- [ ] ADIF importer maps `STATE` → `state`, `MY_SIG` → `mySig`, `MY_SIG_INFO` → `mySigInfo`, `CONTEST_ID` → `contestId`
- [ ] Logger-specific contest fields (e.g., `APP_N1MM_*`) mapped where applicable
- [ ] After import, award dashboard shows correct progress immediately
- [ ] Import of 30,000+ QSOs completes without blocking UI (batch processing)

**Decision (resolved):** Add `state?: string` field to LogEntry (standard ADIF field `STATE`). Grid-to-state derivation is lossy since grid boundaries don't align with state boundaries. The explicit field is cleaner and matches what other loggers export.

**New LogEntry field:** `state?: string` -- populated from ADIF import, callsign lookup, or manual entry. Add to IndexedDB as index `by-state`.

#### Integration Points

| Integrates With    | How                                                    |
| ------------------ | ------------------------------------------------------ |
| `logStore.ts`      | Batch read: `getAllLogEntries()` for award computation |
| `dxccEntities.ts`  | Entity ID → name/continent/zone for display            |
| `QSOLogTable.tsx`  | Click-through from award cell → filtered log view      |
| `App.tsx` / Router | New route `/awards`                                    |
| `BottomTabBar.tsx` | New "Awards" tab (trophy icon)                         |
| `Header.tsx`       | Awards link in navigation                              |
| `profileStore.ts`  | Home location for grid-relative computations           |

#### Files

| File                                     | Action     | Purpose                                                                    |
| ---------------------------------------- | ---------- | -------------------------------------------------------------------------- |
| `src/lib/awards/awardEngine.ts`          | **New**    | Pure computation: entries → progress objects                               |
| `src/lib/awards/types.ts`                | **New**    | AwardType, DxccProgress, WasProgress, WazProgress, GridProgress types      |
| `src/lib/awards/usStateMap.ts`           | **New**    | Grid-to-state mapping, SVG path data for 50 states                         |
| `src/hooks/useAwardProgress.ts`          | **New**    | React hook wrapping awardEngine with IndexedDB reads + memoization         |
| `src/pages/AwardsPage.tsx`               | **New**    | Main awards page with tab navigation per award type                        |
| `src/components/awards/DxccGrid.tsx`     | **New**    | Interactive DXCC entity grid grouped by continent                          |
| `src/components/awards/WasMap.tsx`       | **New**    | SVG US state map with click-through                                        |
| `src/components/awards/WazGrid.tsx`      | **New**    | CQ zone grid/map visualization                                             |
| `src/lib/db/types.ts`                    | **Modify** | Add `state?: string` to LogEntry                                           |
| `src/lib/db/config.ts`                   | **Modify** | Add `by-state` index, bump DB version to 5                                 |
| `src/components/qso/QSOEntryForm.tsx`    | **Modify** | Populate `state` field from lookup result                                  |
| `src/lib/adif/import.ts` (or equivalent) | **Modify** | Map STATE, MY*SIG, MY_SIG_INFO, CONTEST_ID, APP_N1MM*\* to LogEntry fields |

---

### 6.3 LoTW Integration

**Priority:** P0 (Tier 0) | **Effort:** Medium | **Persona:** Dana, Sam

#### Overview

Logbook of the World is the gold standard for QSO confirmation. Without LoTW integration, no DXer will consider Propulse as a primary logger. We implement a phased approach: upload via TQSL-ready ADIF export (Phase 2), with optional bridge-mediated TQSL signing (Phase 2.5 spike), and download confirmations via the direct LoTW API.

**Decision (resolved):** LoTW upload requires digitally signed ADIF files. Web Crypto cannot read .p12 certificates reliably cross-browser. Phase 2 ships option (c): Propulse generates the ADIF, user signs with TQSL externally, Propulse tracks "exported for LoTW" status. A separate Phase 2.5 spike explores bridge-mediated TQSL signing for users with the bridge daemon running. The download path (confirmations) uses the direct LoTW API with username/password, which works fine.

#### User Stories

**US-6.3.1: Operator uploads QSOs to LoTW**

> As a DXer, I want to select QSOs and upload them to LoTW in one click, so my contacts are available for confirmation.

**Acceptance Criteria:**

- [ ] "Export for LoTW" action available in QSO table selection toolbar
- [ ] Bulk export: select multiple QSOs, or "Export all un-exported"
- [ ] Generates ADIF file with all required LoTW fields, triggers download
- [ ] On export: sets `lotwQslSent = "E"` (exported) on each entry -- distinct from "Y" (confirmed uploaded)
- [ ] If bridge is running and TQSL is installed: optional "Sign & Upload" button that automates the TQSL pipeline (Phase 2.5)
- [ ] Progress indicator for bulk exports (X of Y exported)
- [ ] Clear instructions: "Open TQSL, select File → Sign existing ADIF file, then upload to LoTW"

**US-6.3.2: Operator downloads LoTW confirmations**

> As a DXer, I want to download my LoTW confirmations and have them automatically matched to my log entries, so my DXCC award tracking reflects confirmed contacts.

**Acceptance Criteria:**

- [ ] "Sync LoTW Confirmations" button on awards page and in logbook toolbar
- [ ] Downloads ADIF from LoTW API (since last sync date)
- [ ] Matches confirmations to local log entries by callsign + band + mode + date (within 24h tolerance)
- [ ] On match: sets `lotwQslRcvd = "Y"` and `lotw = true`
- [ ] Shows summary: "42 new confirmations matched (3 uncertain -- review), 3 unmatched"
- [ ] Uncertain matches (24h tolerance) surfaced for manual review with side-by-side comparison
- [ ] Stores last sync timestamp in profileStore
- [ ] Works with `qso_qslsince` parameter for incremental sync
- [ ] If LoTW returns HTTP 503 or timeout: queue for retry (exponential backoff, max 3 attempts)
- [ ] If LoTW returns authentication error: surface clear message and link to credential settings (don't retry with bad creds)
- [ ] If LoTW is unreachable for >24 hours: show a service status indicator in QslSyncPanel
- [ ] Failed uploads remain in "pending" state, not marked as sent
- [ ] "Retry failed" action in QslSyncPanel

**US-6.3.3: Operator sees LoTW status in log table**

> As an operator, I want to see LoTW sent/received status as icons in the log table, so I know which QSOs need attention.

**Acceptance Criteria:**

- [ ] LoTW column in log table: arrow-up icon (sent), checkmark icon (confirmed), dash (neither)
- [ ] Filterable: "Show only unconfirmed" in filters

#### Technical Design

```
LoTW API (via edge function proxy):
  Upload:  POST https://lotw.arrl.org/lotwuser/upload with ADIF payload
  Download: GET  https://lotw.arrl.org/lotwuser/lotwreport.adi
    ?login=<user>&password=<pass>&qso_query=1&qso_qslsince=<date>

Edge function: api/log/lotw.ts (exists, needs verification/update)
  - POST /api/log/lotw { action: "upload", adif: string, credentials }
  - POST /api/log/lotw { action: "download", credentials, since: string }
```

**Matching algorithm:**

```typescript
function matchLotwConfirmation(
  confirmation: LotwRecord,
  logEntries: LogEntry[],
): { entry: LogEntry; confidence: "exact" | "uncertain" } | null {
  const candidates = logEntries.filter(
    (e) =>
      e.callsign.toUpperCase() === confirmation.call.toUpperCase() &&
      e.band === confirmation.band &&
      normalizeMode(e.mode) === normalizeMode(confirmation.mode) &&
      // Also match station_callsign if available (prevents false positives
      // when operator uses multiple callsigns for portable ops)
      (!confirmation.station_callsign ||
        !e.stationCallsign ||
        e.stationCallsign.toUpperCase() ===
          confirmation.station_callsign.toUpperCase()),
  );

  const timeDiff = (e: LogEntry) =>
    Math.abs(
      parseDate(e.date, e.timeOn) -
        parseDate(confirmation.qso_date, confirmation.time_on),
    );

  // Tight match: within 30 minutes
  const tight = candidates.find((e) => timeDiff(e) < 1_800_000);
  if (tight) return { entry: tight, confidence: "exact" };

  // Loose fallback: within 24 hours, flagged for manual review
  const loose = candidates.find((e) => timeDiff(e) < 86_400_000);
  if (loose) return { entry: loose, confidence: "uncertain" };

  return null;
}
```

> **Note:** 30-minute primary window prevents false matches when the same station is worked twice in 24 hours (common in contests). Uncertain matches are surfaced to the user for manual confirmation.

#### Integration Points

| Integrates With   | How                                                          |
| ----------------- | ------------------------------------------------------------ |
| `api/log/lotw.ts` | Edge function proxies LoTW API (CORS, credential security)   |
| `profileStore.ts` | `serviceCredentials.lotw` for username/password              |
| `logStore.ts`     | Batch update `lotwQslSent`/`lotwQslRcvd` on matched entries  |
| `qsoStore.ts`     | `uploadToLotw(ids)` and `syncLotwConfirmations()` actions    |
| `src/lib/adif/`   | Generate upload ADIF, parse download ADIF                    |
| `AwardsPage.tsx`  | "Sync LoTW" button, confirmation status feeds award progress |
| `QSOLogTable.tsx` | LoTW status column with icons                                |

#### Files

| File                                    | Action     | Purpose                                                           |
| --------------------------------------- | ---------- | ----------------------------------------------------------------- |
| `src/lib/sync/lotwSync.ts`              | **New**    | Upload ADIF generation, confirmation matching, batch update logic |
| `src/hooks/useLotwSync.ts`              | **New**    | React hook: upload/download progress, error state, last sync      |
| `src/components/qso/LotwSyncButton.tsx` | **New**    | Button + progress modal for upload/download                       |
| `src/components/qso/QslStatusIcons.tsx` | **New**    | Shared icon components for LoTW/eQSL/QRZ status columns           |
| `api/log/lotw.ts`                       | **Modify** | Verify/update edge function for upload + download actions         |
| `src/stores/qsoStore.ts`                | **Modify** | Add `uploadToLotw()`, `syncLotwConfirmations()` actions           |
| `src/stores/profileStore.ts`            | **Modify** | Add `lotwLastSync: string` to persisted state                     |
| `src/components/qso/QSOLogTable.tsx`    | **Modify** | Add QSL status column                                             |
| `src/lib/db/logStore.ts`                | **Modify** | Add batch update function for QSL fields                          |

---

### 6.4 Band Map Widget

**Priority:** P0 (Tier 0) | **Effort:** Medium | **Persona:** Dana

#### Overview

A frequency-domain visualization of DX cluster spots, showing activity across a band as colored pips on a vertical strip. Each pip is a spotted callsign, color-coded by DXCC status. Click to tune the rig. This is the DXer's essential hunting tool.

#### User Stories

**US-6.4.1: DXer sees spotted stations on current band**

> As a DXer, I want a vertical band map showing all recently spotted callsigns on my current band, positioned by frequency, color-coded by DXCC status, so I can quickly find new entities to work.

**Acceptance Criteria:**

- [ ] Vertical strip widget, embeddable in logbook page sidebar (desktop) or modal (mobile)
- [ ] Y-axis = frequency (band edges at top/bottom), X-axis = time (newest left)
- [ ] Each spot is a colored pip/label: red=new entity, green=new band, blue=new mode, orange=worked, gray=dupe
- [ ] Spot labels show: callsign, frequency (kHz), SNR (if available), age (minutes)
- [ ] Spots age out visually (opacity fade) after 15 minutes, disappear after 30
- [ ] Current rig frequency shown as a horizontal marker line
- [ ] Auto-switches band when rig band changes

**US-6.4.2: DXer clicks spot to tune rig**

> As a DXer with a rig connected via bridge, I want to click a spot on the band map to tune my radio to that frequency, so I can immediately start working the station.

**Acceptance Criteria:**

- [ ] Click/tap on spot pip sends frequency to rig via bridge WebSocket
- [ ] Visual confirmation: clicked spot pulses/highlights briefly
- [ ] If no rig connected: clicking still updates the QSO form frequency field
- [ ] Callsign auto-fills into QSO entry form on click

**US-6.4.3: DXer filters band map spots**

> As a DXer, I want to filter the band map to show only specific modes or only new entities, so I can focus my search.

**Acceptance Criteria:**

- [ ] Filter toggles: Mode (CW/SSB/FT8/All), Status (New only / All)
- [ ] Filters persist across band changes
- [ ] Spot count badge shows filtered count

**US-6.4.4: Band map works on mobile**

> As a DXer using a phone, I want to see band map spots in a mobile-optimized layout that shows the most important spots (new entities, new bands) without requiring the full desktop widget.

**Acceptance Criteria:**

- [ ] Mobile: Compact horizontal bar showing top N spots ranked by DXCC significance (new entities first, then new bands, then worked)
- [ ] Tap to expand full band map as full-screen overlay with gesture-based frequency navigation
- [ ] Swipe left/right to change bands
- [ ] Tap spot to auto-fill QSO form (same as desktop)
- [ ] Minimum 44px touch targets on all interactive elements
- [ ] Spot freshness badge: "Spot age: ~3 min" (Supabase) vs "Spot age: live" (bridge)

#### Technical Design

```
Data source (decision resolved -- bridge preferred with Supabase fallback):
  Primary (when bridge connected): Bridge DX cluster WebSocket for real-time spots (~0s latency)
  Fallback (no bridge): Supabase spot_history table via React Query
    - Query: SELECT * FROM spot_history
      WHERE band = $band AND spotted_at > NOW() - INTERVAL '30 minutes'
      ORDER BY frequency_khz
    - Poll interval: 15 seconds
    - Latency: 2-5 minutes from real-world spot to display (collector delay + poll interval)
  - Display badge indicates data source: "LIVE" (bridge) or "~3 min delay" (Supabase)

Rendering: SVG or Canvas (not DOM nodes -- could be 200+ spots)
  - Virtualized: only render spots in visible frequency range
  - Smooth scroll/zoom on frequency axis

Click-to-tune: rigStore.setFrequency(freq) → bridge WebSocket command
```

**Band frequency ranges** (for Y-axis scaling):

```typescript
const BAND_RANGES: Record<string, [number, number]> = {
  "160m": [1800, 2000],
  "80m": [3500, 4000],
  "40m": [7000, 7300],
  "30m": [10100, 10150],
  "20m": [14000, 14350],
  "17m": [18068, 18168],
  "15m": [21000, 21450],
  "12m": [24890, 24990],
  "10m": [28000, 29700],
};
```

#### Integration Points

| Integrates With         | How                                                             |
| ----------------------- | --------------------------------------------------------------- |
| Supabase `spot_history` | React Query polling for recent spots on current band            |
| `rigStore.ts`           | Current frequency → marker line; click-to-tune writes frequency |
| `useDxccStatus` (6.1)   | Color-code each spot by DXCC working status                     |
| `qsoStore.ts`           | Click spot → auto-fill callsign + frequency into entry form     |
| `useBridge` hook        | WebSocket command to tune rig                                   |
| `Logbook.tsx`           | Embedded in logbook page layout (desktop sidebar)               |

#### Files

| File                                     | Action     | Purpose                                               |
| ---------------------------------------- | ---------- | ----------------------------------------------------- |
| `src/components/qso/BandMap.tsx`         | **New**    | Main band map widget: SVG rendering, zoom, scroll     |
| `src/components/qso/BandMapSpot.tsx`     | **New**    | Individual spot pip: color, label, click handler      |
| `src/components/qso/BandMapControls.tsx` | **New**    | Filter toggles, band selector, spot count             |
| `src/hooks/useBandMapSpots.ts`           | **New**    | React Query hook: fetch spots from Supabase, poll 15s |
| `src/lib/data/bandRanges.ts`             | **New**    | Band frequency ranges, sub-band definitions           |
| `src/pages/Logbook.tsx`                  | **Modify** | Add band map to desktop sidebar layout                |
| `src/stores/rigStore.ts`                 | **Modify** | Add `setFrequency(freq)` action for click-to-tune     |
| `src/components/qso/QSOEntryForm.tsx`    | **Modify** | Accept auto-fill from band map click                  |
| `src/lib/supabase.ts`                    | **Modify** | Add spot_history query helpers                        |

---

### 6.5 Supabase Sync Engine

**Priority:** P0 (Tier 0) | **Effort:** Medium | **Persona:** Sam, Pat

#### Overview

Wire up the Supabase backend to sync QSO log entries across devices. The conflict resolution UI already exists. This feature delivers QLog's #1 most-requested feature that they architecturally cannot build.

#### User Stories

**US-6.5.1: Operator's log syncs across devices**

> As an operator who logs at home and in the field, I want my QSO log to automatically sync between my desktop and tablet, so I always have my complete log available.

**Acceptance Criteria:**

- [ ] On QSO save: entry pushed to Supabase `qso_log` table within 5 seconds (if online)
- [ ] On app load: pull remote changes since last sync, merge into IndexedDB
- [ ] Sync is bidirectional: local changes push up, remote changes pull down
- [ ] Offline changes queue in `syncQueueStore` and flush when connection restores
- [ ] Sync indicator in header: green checkmark (synced), amber spinner (syncing), red dot (pending changes)
- [ ] Entry count badge shows pending sync count

**US-6.5.2: Conflicts resolve gracefully**

> As an operator who edited the same QSO on two devices, I want to see both versions and choose which fields to keep, using the existing conflict resolution UI.

**Acceptance Criteria:**

- [ ] Conflict detected when remote version > local version for same entry ID
- [ ] 13 auto-merge fields resolve automatically (QSL status ranking, boolean true-wins, version max)
- [ ] 21 manual-resolution fields presented in existing ConflictResolution component
- [ ] ConflictBadge in header shows count of unresolved conflicts
- [ ] Resolving a conflict writes the merged entry locally and remotely

**US-6.5.3: Sync requires authentication**

> As an operator, sync only activates when I'm signed in, and my QSO data is isolated to my user account.

**Acceptance Criteria:**

- [ ] Sync engine only starts when `authStore.user` is non-null
- [ ] Supabase RLS policy: users can only read/write their own QSO rows
- [ ] Sign-out pauses sync (does not delete local data)
- [ ] Sign-in on new device triggers full initial sync

**US-6.5.4: Sync handles large initial imports gracefully**

> As an operator importing 10,000 QSOs from ADIF, the sync engine must batch-upload efficiently without blocking the UI.

**Acceptance Criteria:**

- [ ] Batch upload in chunks of 500 entries
- [ ] Background processing: UI remains responsive during sync
- [ ] Progress indicator: "Syncing 2,500 / 10,000 entries..."
- [ ] Retry with exponential backoff on transient failures

**US-6.5.5: Deleted QSOs sync across devices**

> As an operator, when I delete a QSO on one device, I want the deletion to propagate to all my devices on next sync. If the same QSO was edited on another device before the delete synced, I want to be notified of the conflict.

**Acceptance Criteria:**

- [ ] Delete on device A → soft-delete (`deleted_at` timestamp) pushed to Supabase
- [ ] Device B pulls soft-deleted entry → marks local entry as deleted
- [ ] If device B modified the entry after device A deleted it → surface as conflict: "This QSO was deleted on another device but modified here. Keep or delete?"
- [ ] Award engine excludes soft-deleted entries from all computations
- [ ] "Undo delete" available for 30 days (clears `deleted_at`)
- [ ] Hard-delete after 30 days via scheduled Supabase function

**US-6.5.6: Initial sync on new device is performant**

> As an operator signing in on a new device, I want the initial sync to complete efficiently even with 50K QSOs.

**Acceptance Criteria:**

- [ ] Initial sync uses a dedicated edge function that returns a compressed NDJSON stream (not 100 individual 500-row fetches)
- [ ] Progress indicator: "Downloading 25,000 / 50,000 entries..."
- [ ] Full 50K sync completes in <60 seconds on broadband
- [ ] Incremental sync (subsequent) uses the per-entry delta model with `since` timestamp

#### Technical Design

```
Supabase table: qso_log (new migration)
  - id: uuid (matches IndexedDB entry id)
  - user_id: uuid (from auth.users)
  - data: jsonb (full LogEntry serialized)
  - version: integer
  - device_id: text
  - updated_at: timestamptz
  - deleted_at: timestamptz (soft delete)
  - RLS: user_id = auth.uid()

Sync strategy: Version-vector per entry
  1. Push: entries where local version > last_pushed_version
  2. Pull: SELECT * FROM qso_log WHERE user_id = $uid AND updated_at > $last_sync
  3. Merge: for each pulled entry, compare version with local
     - Remote version > local: apply remote (or conflict if local also changed)
     - Local version > remote: push local
     - Equal: no action
  4. Conflict: both changed since last sync → queue for manual resolution

Sync modes:
  Initial sync: GET /api/sync/qso?mode=full → compressed NDJSON stream
  Incremental sync: GET /api/sync/qso?since=<timestamp> → delta entries

Offline queue: syncQueueStore (exists)
  - { entryId, action: 'upsert' | 'delete', payload, timestamp }
  - Flush queue on reconnect, oldest first
  - QSL upload queue piggybacked: auto-upload to enabled services batched every 5 min
```

#### Integration Points

| Integrates With       | How                                     |
| --------------------- | --------------------------------------- |
| `src/lib/supabase.ts` | CRUD operations on `qso_log` table      |
| `authStore.ts`        | Sync starts/stops with auth state       |
| `logStore.ts`         | Read/write IndexedDB as source of truth |
| `syncQueueStore.ts`   | Offline change queue                    |
| `conflict.ts`         | Existing conflict resolution logic      |
| `deviceId.ts`         | Tag entries with originating device     |
| `qsoStore.ts`         | `pendingSyncCount`, `conflicts` state   |
| `Header.tsx`          | Sync status indicator + ConflictBadge   |

#### Files

| File                                              | Action     | Purpose                                                       |
| ------------------------------------------------- | ---------- | ------------------------------------------------------------- |
| `src/lib/sync/syncEngine.ts`                      | **New**    | Core sync orchestrator: push, pull, merge, conflict detection |
| `src/lib/sync/syncQueue.ts`                       | **New**    | Offline queue management, flush logic, retry                  |
| `src/hooks/useSyncEngine.ts`                      | **New**    | React hook: starts sync on auth, exposes status               |
| `src/components/qso/SyncStatusIndicator.tsx`      | **New**    | Header widget: synced/syncing/pending states                  |
| `supabase/migrations/20260215000000_qso_sync.sql` | **New**    | Create `qso_log` table + RLS policies + indexes               |
| `api/sync/qso.ts`                                 | **New**    | Edge function for batch sync operations                       |
| `src/stores/qsoStore.ts`                          | **Modify** | Wire sync after logQSO/editQSO/deleteQSO                      |
| `src/lib/db/logStore.ts`                          | **Modify** | Add `getEntriesSinceVersion()` for delta sync                 |
| `src/stores/authStore.ts`                         | **Modify** | Trigger sync start/stop on auth state change                  |
| `src/components/Header.tsx`                       | **Modify** | Add SyncStatusIndicator                                       |
| `src/stores/profileStore.ts`                      | **Modify** | Add `lastSyncTimestamp` to persisted state                    |

---

### 6.6 POTA/SOTA Activation Workflow

**Priority:** P1 (Tier 1) | **Effort:** Medium | **Persona:** Pat

#### Overview

A purpose-built activation mode for Parks on the Air and Summits on the Air. Field operators need large touch targets, running QSO tallies, park/summit reference lookup, and one-tap ADIF export. This is the fastest-growing segment in ham radio and currently underserved by every desktop logger.

#### User Stories

**US-6.6.1: Activator starts a POTA activation with park lookup**

> As a POTA activator, I want to search for a park by name or reference number, select it, and have all QSOs automatically tagged with that reference, so my activation log is correctly attributed.

**Acceptance Criteria:**

- [ ] Park search: type park name or reference (e.g., "K-1234" or "Shenandoah") → autocomplete dropdown
- [ ] Park data: reference, name, location name, grid, lat/lon from pota.app API
- [ ] Selecting a park sets `mySig = "POTA"` and `mySigInfo = "K-1234"` on all subsequent QSOs
- [ ] Park info displayed prominently during activation: name, reference, grid
- [ ] Works offline: recently searched parks cached in IndexedDB

**US-6.6.2: Activator sees running QSO count toward 10-contact minimum**

> As a POTA activator, I want a prominent counter showing how many QSOs I've logged toward the 10-contact activation minimum, with a visual celebration when I hit 10.

**Acceptance Criteria:**

- [ ] Large counter: "7 / 10" with progress ring/bar
- [ ] Counter is specific to current activation (filtered by mySigInfo + date)
- [ ] At 10: brief celebration animation (confetti or pulse), "Activation Complete!" message
- [ ] Counter continues past 10 (no cap)
- [ ] SOTA variant: same counter, 4-contact minimum

**US-6.6.3: Activator uses streamlined mobile entry form**

> As a field operator using a phone, I want a simplified QSO entry form with large buttons optimized for one-handed use with gloves.

**Acceptance Criteria:**

- [ ] Activation mode UI: callsign + RST sent + RST received + frequency + mode (5 fields max)
- [ ] Large input fields (min 48px touch targets)
- [ ] Quick-log button: logs QSO with single tap after entering callsign
- [ ] Band/mode preset buttons (not dropdowns): e.g., "20m SSB", "40m CW", "20m FT8"
- [ ] Running log shown below entry form (most recent at top)

**US-6.6.4: Activator exports activation ADIF with one tap**

> As a POTA activator, I want to export my activation QSOs as ADIF with one tap, ready to upload to pota.app.

**Acceptance Criteria:**

- [ ] "Export Activation" button visible during and after activation
- [ ] Exports only QSOs matching current activation (mySig + mySigInfo + date)
- [ ] ADIF includes all required POTA fields: `MY_SIG`, `MY_SIG_INFO`, `SIG`, `SIG_INFO`
- [ ] Triggers file download (or share sheet on mobile)
- [ ] Optional: "Upload to pota.app" direct integration (stretch goal)

**US-6.6.5: Hunter logs POTA/SOTA contacts with their reference**

> As a POTA hunter, when I work an activator, I want their park reference auto-filled from spots, so my log correctly records the contact for hunter credit.

**Acceptance Criteria:**

- [ ] If callsign matches a recent POTA spot, auto-fill `sig = "POTA"` and `sigInfo = "K-1234"`
- [ ] Spot data sourced from collector's spot_history (spots from POTA network)
- [ ] Visual indicator: "POTA Activator at K-1234 Shenandoah NP" shown near callsign

#### Technical Design

```
POTA API (via edge function):
  Park search: GET https://api.pota.app/park/search?query=<term>
  Park detail: GET https://api.pota.app/park/<reference>
  Active activations: GET https://api.pota.app/spot/activator

SOTA API (via edge function):
  Summit search: GET https://api2.sota.org.uk/api/summits/search?query=<term>
  Summit detail: GET https://api2.sota.org.uk/api/summits/<reference>

Activation state: ephemeral (not persisted across sessions)
  { program: "POTA" | "SOTA", reference: string, name: string,
    grid: string, startTime: string, qsoCount: number }
```

#### Integration Points

| Integrates With           | How                                                           |
| ------------------------- | ------------------------------------------------------------- |
| `qsoStore.ts`             | `operatingMode` = "pota" or "sota" → activation-specific form |
| `logStore.ts`             | Query `by-mySig` index for activation QSO count               |
| `spot_history` (Supabase) | Match callsign to active POTA/SOTA spots for hunter auto-fill |
| `src/lib/adif/`           | ADIF export filtered by mySig+mySigInfo+date                  |
| `Logbook.tsx`             | Activation mode layout replaces standard logbook when active  |
| `profileStore.ts`         | GPS location for park proximity detection                     |

#### Files

| File                                              | Action     | Purpose                                                    |
| ------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| `src/components/activation/ActivationPanel.tsx`   | **New**    | Main activation mode UI: park/summit search, counter, log  |
| `src/components/activation/ParkSearch.tsx`        | **New**    | Autocomplete search for POTA parks / SOTA summits          |
| `src/components/activation/ActivationCounter.tsx` | **New**    | Large QSO count ring with celebration trigger              |
| `src/components/activation/QuickLogForm.tsx`      | **New**    | Simplified mobile-optimized entry form                     |
| `src/hooks/useActivation.ts`                      | **New**    | Activation state management, QSO count, park/summit data   |
| `api/activation/pota.ts`                          | **New**    | Edge function: POTA park search + active activations proxy |
| `api/activation/sota.ts`                          | **New**    | Edge function: SOTA summit search + detail proxy           |
| `src/pages/Logbook.tsx`                           | **Modify** | Render ActivationPanel when operatingMode = pota/sota      |
| `src/stores/qsoStore.ts`                          | **Modify** | Set mySig/mySigInfo from activation state on each QSO      |
| `src/lib/adif/export.ts`                          | **Modify** | Filtered export by mySig+mySigInfo                         |
| `src/hooks/useCallsignLookup.ts`                  | **Modify** | Cross-reference callsign with POTA/SOTA spot data          |

---

### 6.7 eQSL Integration

**Priority:** P1 (Tier 1) | **Effort:** Small-Medium | **Persona:** Sam

#### Overview

Upload QSOs to eQSL.cc and download received eQSL confirmations. Second most popular QSL service after LoTW.

#### User Stories

**US-6.7.1: Operator uploads QSOs to eQSL**

> As an operator, I want to upload selected QSOs to eQSL with one click.

**Acceptance Criteria:**

- [ ] "Upload to eQSL" in QSO table selection toolbar
- [ ] Generates ADIF, POSTs to eQSL API via edge function
- [ ] On success: sets `eqsl = true` on entries
- [ ] Requires eQSL credentials from profileStore

**US-6.7.2: Operator downloads eQSL confirmations**

> As an operator, I want to download my eQSL inbox and match confirmations to my log.

**Acceptance Criteria:**

- [ ] "Sync eQSL" button alongside LoTW sync
- [ ] Downloads ADIF from eQSL inbox API
- [ ] Matches to local entries by callsign + band + mode + date
- [ ] Updates matched entries: `eqsl = true`, `qslRcvd = "Y"`
- [ ] Shows summary of matched/unmatched
- [ ] Same error handling as LoTW (6.3): retry on 503/timeout, clear auth error message, service status indicator, "Retry failed" action

> **Note:** Error handling acceptance criteria from Feature 6.3 (HTTP 503 retry, auth error messaging, service status indicator, pending state preservation) apply equally to eQSL and QRZ integrations. A shared `QslServiceHealth` component checks basic service reachability before attempting operations.

#### Technical Design

```
eQSL API (via edge function):
  Upload:  POST https://www.eqsl.cc/qslcard/ImportADIF.cfm
  Download: GET  https://www.eqsl.cc/qslcard/DownloadInBox.cfm
    ?UserName=<user>&Password=<pass>&RcvdSince=<date>
```

#### Integration Points

| Integrates With                            | How                                     |
| ------------------------------------------ | --------------------------------------- |
| `api/log/eqsl.ts`, `api/log/eqsl-inbox.ts` | Existing edge functions (verify/update) |
| `profileStore.ts`                          | `serviceCredentials.eqsl`               |
| `logStore.ts`                              | Batch update eQSL fields                |
| `src/lib/adif/`                            | Generate/parse ADIF                     |
| `QslStatusIcons.tsx` (from 6.3)            | eQSL status column                      |

#### Files

| File                                  | Action     | Purpose                                         |
| ------------------------------------- | ---------- | ----------------------------------------------- |
| `src/lib/sync/eqslSync.ts`            | **New**    | Upload/download/match logic for eQSL            |
| `src/hooks/useEqslSync.ts`            | **New**    | React hook: upload/download progress            |
| `src/components/qso/QslSyncPanel.tsx` | **New**    | Unified QSL sync panel (LoTW + eQSL + QRZ tabs) |
| `api/log/eqsl.ts`                     | **Modify** | Verify/update upload endpoint                   |
| `api/log/eqsl-inbox.ts`               | **Modify** | Verify/update download endpoint                 |
| `src/stores/profileStore.ts`          | **Modify** | Add `eqslLastSync` timestamp                    |

---

### 6.8 QRZ.com Logbook Sync

**Priority:** P1 (Tier 1) | **Effort:** Small | **Persona:** Sam

#### Overview

Upload QSOs to QRZ.com's online logbook. Many operators use QRZ.com as their public-facing log for confirming contacts.

#### User Stories

**US-6.8.1: Operator uploads QSOs to QRZ.com logbook**

> As an operator, I want to upload QSOs to my QRZ.com logbook so other operators can confirm contacts with me.

**Acceptance Criteria:**

- [ ] "Upload to QRZ" in QSO table selection toolbar
- [ ] Uses QRZ.com XML Logbook Data API
- [ ] Requires QRZ.com API key (XML subscriber) from profileStore
- [ ] On success: sets `qrzcomStatus = "uploaded"` on entries
- [ ] Batch upload support

**US-6.8.2: Operator downloads QRZ.com confirmations**

> As an operator, I want to download QSOs confirmed via QRZ.com and match them to my log.

**Acceptance Criteria:**

- [ ] Downloads confirmed QSOs from QRZ.com API
- [ ] Matches to local entries, updates `qrzcomStatus = "confirmed"`

#### Integration Points

| Integrates With               | How                                               |
| ----------------------------- | ------------------------------------------------- |
| `api/callsign/qrz.ts`         | Extend existing QRZ edge function for logbook API |
| `profileStore.ts`             | `serviceCredentials.qrz` (API key)                |
| `QslSyncPanel.tsx` (from 6.7) | QRZ tab in unified sync panel                     |

#### Files

| File                                  | Action     | Purpose                                         |
| ------------------------------------- | ---------- | ----------------------------------------------- |
| `src/lib/sync/qrzSync.ts`             | **New**    | Upload/download/match logic for QRZ.com logbook |
| `src/hooks/useQrzSync.ts`             | **New**    | React hook for QRZ sync                         |
| `api/log/qrz.ts`                      | **New**    | Edge function for QRZ.com logbook API           |
| `src/stores/profileStore.ts`          | **Modify** | Add `qrzLastSync` timestamp                     |
| `src/components/qso/QslSyncPanel.tsx` | **Modify** | Add QRZ tab                                     |
| `src/lib/db/logStore.ts`              | **Modify** | Batch update qrzcomStatus                       |

---

### 6.8.1 Cross-Cutting: Auto-Upload QSL Workflow

**Priority:** P1 (Tier 1) | **Effort:** Small | **Persona:** Sam, Dana

#### Overview

Every other logger requires manual "select QSOs → click Upload" workflows. This is a universal pain point. Propulse can leapfrog by auto-uploading to enabled QSL services after each QSO save, leveraging the sync engine's offline queue. This transforms parity features (6.3, 6.7, 6.8) into a genuine differentiator.

#### User Stories

**US-6.8.1.1: Operator enables auto-upload per QSL service**

> As an operator, I want Propulse to automatically upload new QSOs to my enabled QSL services within 5 minutes of logging, so I never have to remember to manually sync.

**Acceptance Criteria:**

- [ ] Per-service toggle in Settings: "Auto-upload to LoTW / eQSL / QRZ.com" (default: off)
- [ ] Auto-upload batches intelligently: every 5 minutes OR every 10 QSOs, whichever comes first
- [ ] Respects the sync engine's offline queue (Feature 6.5): if offline, queue QSL uploads alongside sync queue and flush both on reconnect
- [ ] Auto-upload runs as a post-save hook in qsoStore — no user action required after initial setup
- [ ] Activity indicator shows pending auto-upload count in QslSyncPanel
- [ ] For LoTW (TQSL-based): auto-upload generates batched ADIF for export, notifies user "10 new QSOs ready for LoTW signing"
- [ ] Errors in auto-upload surface as non-blocking toasts, not modal errors

#### Integration Points

| Integrates With                              | How                                                   |
| -------------------------------------------- | ----------------------------------------------------- |
| `qsoStore.ts`                                | Post-save hook triggers auto-upload queue             |
| `syncQueue.ts` (6.5)                         | QSL uploads use the same offline queue infrastructure |
| `lotwSync.ts` / `eqslSync.ts` / `qrzSync.ts` | Reuse manual upload logic in batch mode               |
| `settingsStore.ts`                           | Per-service auto-upload toggle                        |

---

### 6.9 Spot Alert Rules Engine

**Priority:** P1 (Tier 1) | **Effort:** Medium | **Persona:** Dana

#### Overview

A configurable rules engine that alerts the operator when a DX cluster spot matches their criteria. QLog has 12+ match criteria; we add propagation intelligence that no desktop app can match.

#### User Stories

**US-6.9.1: DXer creates alert rules for needed entities**

> As a DXer, I want to create alert rules like "Alert me when a new DXCC entity is spotted on 20m CW" so I never miss a rare DX opportunity.

**Acceptance Criteria:**

- [ ] Rule builder with match criteria: DXCC entity (specific or "any new"), band, mode, continent, CQ zone, minimum SNR
- [ ] Rules stored in IndexedDB `alertRules` store (already exists)
- [ ] Multiple rules supported (up to 100)
- [ ] Rules can be enabled/disabled individually
- [ ] Rule presets: "New DXCC on any band", "New band-slot for worked entities", "All spots on 6m" (sporadic-E)

**US-6.9.2: Operator receives visual and audio alerts**

> As a DXer, when a spot matches my alert rule, I want an immediate notification with audio, so I can QSY quickly.

**Acceptance Criteria:**

- [ ] Browser notification (with permission): callsign, frequency, entity name, age
- [ ] Audio alert: configurable sound (beep, CW tone, voice announcement)
- [ ] In-app toast: slides in from top, auto-dismisses after 10s, click to fill QSO form
- [ ] Alert history: last 100 alerts viewable with timestamps
- [ ] Suppression: don't re-alert same callsign within 15 minutes

**US-6.9.3: Alerts consider DXCC working status (intelligence layer)**

> As a DXer, I want alerts to be aware of my log -- only alert for entities/bands/modes I haven't worked yet.

**Acceptance Criteria:**

- [ ] Rule option: "Only if new entity for me" (queries local IndexedDB log)
- [ ] Rule option: "Only if new band-slot" or "Only if new mode-slot"
- [ ] Uses same `useDxccStatus` logic from feature 6.1

#### Technical Design

```
Alert evaluation pipeline:
  1. Spot arrives (Supabase realtime subscription on spot_history)
  2. For each enabled rule, evaluate match criteria
  3. If match: check suppression cache (callsign + 15min window)
  4. If not suppressed: check DXCC working status (optional)
  5. If passes: fire notification + audio + toast + log to alertHistory

Rule schema (in IndexedDB alertRules):
  {
    id: string,
    name: string,
    enabled: boolean,
    criteria: {
      dxccEntities?: number[],     // specific entities, or empty for "any"
      onlyNewEntity?: boolean,     // requires never-worked entity
      onlyNewBandSlot?: boolean,
      onlyNewModeSlot?: boolean,
      bands?: string[],
      modes?: string[],
      continents?: string[],
      cqZones?: number[],
      minSnr?: number,
    },
    notification: {
      sound: boolean,
      soundType: "beep" | "cw" | "voice",
      browserNotification: boolean,
      toast: boolean,
    },
    createdAt: string,
  }
```

#### Integration Points

| Integrates With          | How                                                |
| ------------------------ | -------------------------------------------------- |
| Supabase `spot_history`  | Realtime subscription for new spots                |
| `useDxccStatus` (6.1)    | Check if spot is new entity/band/mode for operator |
| IndexedDB `alertRules`   | Store/retrieve rules (store already exists)        |
| IndexedDB `alertHistory` | Log triggered alerts (store already exists)        |
| `qsoStore.ts`            | Click-on-alert fills QSO form                      |
| `rigStore.ts`            | Click-on-alert tunes rig                           |
| `watchAudioService.ts`   | Audio alert playback                               |

#### Files

| File                                         | Action     | Purpose                                             |
| -------------------------------------------- | ---------- | --------------------------------------------------- |
| `src/lib/alerts/alertEngine.ts`              | **New**    | Rule evaluation, suppression, notification dispatch |
| `src/hooks/useSpotAlerts.ts`                 | **New**    | Supabase realtime subscription, feeds alertEngine   |
| `src/components/alerts/AlertRuleBuilder.tsx` | **New**    | Rule creation/editing form                          |
| `src/components/alerts/AlertToast.tsx`       | **New**    | In-app alert notification toast                     |
| `src/components/alerts/AlertHistory.tsx`     | **New**    | Alert history list with timestamps                  |
| `src/lib/supabase.ts`                        | **Modify** | Add realtime subscription helpers                   |
| `src/pages/Logbook.tsx`                      | **Modify** | Alert toast rendering, alert panel access           |
| `src/stores/settingsStore.ts`                | **Modify** | Alert sound preferences                             |

---

### 6.10 QSL Credential Wiring (REVISED)

**Priority:** P0 (reclassified -- blocks all QSL features) | **Effort:** Small | **Persona:** All

#### Overview

The credential vault already exists at `src/lib/db/credentialStore.ts` with full AES-256-GCM + PBKDF2 encryption, auto-lock after 30 minutes, sentinel passphrase verification, and per-service encrypt/decrypt for lotw/clublog/eqsl/qrz. This feature is reduced to: (1) verifying the vault is wired into the settings UI, (2) ensuring QSL sync modules (6.3, 6.7, 6.8) call `getCredential(service)` instead of reading plaintext from profileStore, and (3) adding a passphrase setup prompt for first-time credential storage.

#### User Stories

**US-6.10.1: QSL sync modules use the encrypted credential vault**

> As an operator, I want my QSL service passwords stored in the existing encrypted vault, not in plaintext localStorage, so they're secure at rest.

**Acceptance Criteria:**

- [ ] `lotwSync.ts`, `eqslSync.ts`, `qrzSync.ts` call `getCredential(service)` from `credentialStore.ts` (not profileStore.serviceCredentials)
- [ ] If vault is locked, prompt passphrase dialog before attempting any QSL operation
- [ ] Settings page "QSL Services" section stores credentials via `saveCredential(service, username, password)`
- [ ] Migrate any existing plaintext credentials from `profileStore.serviceCredentials` to the vault on first run
- [ ] Remove plaintext credential fields from profileStore after migration

#### Technical Design

```
Existing implementation (src/lib/db/credentialStore.ts):
  - setupPassphrase(passphrase) — first-time setup
  - unlock(passphrase) — per-session unlock, returns boolean
  - lock() — clears derived key from memory
  - saveCredential(service, username, password) — encrypts and stores
  - getCredential(service) — decrypts and returns { username, password }
  - Auto-lock after 30 min inactivity
  - Separate IndexedDB: propulse-credentials (v1)

What's needed:
  - Wire settings UI to call setupPassphrase/saveCredential
  - Wire QSL sync modules to call getCredential
  - Migration shim: detect plaintext creds in profileStore, prompt vault setup, migrate
```

#### Integration Points

| Integrates With                              | How                                                    |
| -------------------------------------------- | ------------------------------------------------------ |
| `src/lib/db/credentialStore.ts`              | **Existing** -- all crypto/storage already implemented |
| `lotwSync.ts` / `eqslSync.ts` / `qrzSync.ts` | Call `getCredential(service)` before API operations    |
| `src/pages/SettingsPage.tsx`                 | Passphrase setup prompt, per-service credential entry  |
| `profileStore.ts`                            | Remove plaintext `serviceCredentials` after migration  |

#### Files

| File                                                 | Action     | Purpose                                                                         |
| ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| `src/pages/SettingsPage.tsx`                         | **Modify** | Wire passphrase setup + credential entry to credentialStore                     |
| `src/stores/profileStore.ts`                         | **Modify** | Migration: move plaintext creds to vault, deprecate serviceCredentials          |
| `src/components/settings/CredentialUnlockDialog.tsx` | **New**    | Passphrase prompt dialog shown when vault is locked and QSL operation requested |

---

### 6.11 Cross-Cutting: Log Filter & Export Capabilities

**Priority:** P1 (implicit dependency of multiple features) | **Effort:** Small | **Persona:** All

#### Overview

Multiple features assume the log table can be filtered by criteria that aren't currently specified (DXCC entity, QSL status, contest, operating mode). These filters are implied by click-through from the awards page, band map, and activation mode but never formally specified. Additionally, the POTA export (6.6) is a special case of a general "export filtered log" capability that should be generalized.

#### User Stories

**US-6.11.1: Log table supports advanced filtering**

> As an operator, I want to filter my log table by DXCC entity, QSL status, operating mode, and contest, so I can quickly find specific QSOs.

**Acceptance Criteria:**

- [ ] Log table supports filtering by: DXCC entity (by name or number), band, mode, QSL status (LoTW/eQSL/QRZ confirmed/unconfirmed/pending), operating mode (general/pota/sota/contest/fieldday), date range, contestId, and state
- [ ] Filters can be set programmatically (for click-through from awards page, band map, alert toast, etc.)
- [ ] Active filters shown as dismissible chips above the table
- [ ] "Clear all filters" action
- [ ] Filter state persisted in qsoStore (existing `filters` mechanism extended)

**US-6.11.2: Operator exports filtered log as ADIF**

> As an operator, I want to export the currently filtered log view as an ADIF file, so I can share specific subsets of my log with other services or operators.

**Acceptance Criteria:**

- [ ] "Export Filtered" button in log table toolbar, enabled when any filter is active
- [ ] Exports only entries matching the current filter set
- [ ] ADIF includes all standard fields (same quality as full export)
- [ ] Reuses existing ADIF export machinery with filtered entry set
- [ ] Subsumes the POTA-specific export in Feature 6.6 (activation export = filtered export where filter = mySig+mySigInfo+date)

#### Files

| File                                 | Action     | Purpose                                                                        |
| ------------------------------------ | ---------- | ------------------------------------------------------------------------------ |
| `src/stores/qsoStore.ts`             | **Modify** | Extend `QSOFilters` type with dxcc, qslStatus, operatingMode, contestId, state |
| `src/components/qso/QSOLogTable.tsx` | **Modify** | Render filter chips, accept programmatic filter-set                            |
| `src/components/qso/FilterChips.tsx` | **New**    | Dismissible filter chip bar                                                    |
| `src/lib/adif/export.ts`             | **Modify** | Accept filtered entry array (not just full log)                                |

---

## 7. Integration Points Map

```
                                    ┌─────────────────┐
                                    │  Supabase Cloud  │
                                    │  ─────────────── │
                                    │  spot_history    │◄── Collector (Railway)
                                    │  solar_snapshots │
                                    │  qso_log (NEW)   │◄──┐
                                    │  RLS policies     │   │
                                    └────────┬─────────┘   │
                                             │              │
                           ┌─────────────────┼──────────────┘
                           │   React Query    │  Supabase Realtime
                           │   (polling)      │  (spot subscription)
                           ▼                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Propulse Frontend                             │
│                                                                      │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────────┐ │
│  │ QSO      │   │ Band Map │   │ Award    │   │ Alert Engine     │ │
│  │ Entry    │   │ Widget   │   │ Dashboard│   │ (rules + spots)  │ │
│  │ Form     │   │  (6.4)   │   │  (6.2)   │   │     (6.9)        │ │
│  │          │   │          │   │          │   │                  │ │
│  │ ┌──────┐ │   │ spot_    │   │ award    │   │ alertRules (IDB) │ │
│  │ │DXCC  │ │   │ history  │   │ Engine   │   │ alertHistory     │ │
│  │ │Status│ │   │ + DXCC   │   │ + IDB    │   │ + useDxccStatus  │ │
│  │ │Badge │ │   │ status   │   │ scan     │   │ + notifications  │ │
│  │ │(6.1) │ │   │          │   │          │   │                  │ │
│  │ └──┬───┘ │   └────┬─────┘   └────┬─────┘   └────────┬─────────┘ │
│  └────┼─────┘        │              │                   │           │
│       │              │              │                   │           │
│       ▼              ▼              ▼                   ▼           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    IndexedDB (logEntries)                    │   │
│  │  by-dxcc │ by-band │ by-mySig │ by-state │ by-version      │   │
│  └────────────────────────┬────────────────────────────────────┘   │
│                           │                                         │
│                    ┌──────┴──────┐                                   │
│                    │ Sync Engine │                                   │
│                    │    (6.5)    │──── Conflict Resolution (exists)  │
│                    └──────┬──────┘                                   │
│                           │                                         │
│  ┌────────────────────────┼────────────────────────────────────┐   │
│  │              QSL Service Integrations                       │   │
│  │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────────────────────┐   │   │
│  │  │LoTW  │  │eQSL  │  │QRZ   │  │ credentialStore.ts   │   │   │
│  │  │(6.3) │  │(6.7) │  │(6.8) │  │ (exists) AES-GCM     │   │   │
│  │  └──┬───┘  └──┬───┘  └──┬───┘  └──────────────────────┘   │   │
│  └─────┼─────────┼─────────┼──────────────────────────────────┘   │
│        │         │         │                                       │
│        ▼         ▼         ▼                                       │
│  ┌─────────────────────────────────┐                               │
│  │    Vercel Edge Functions        │                               │
│  │  api/log/lotw.ts                │                               │
│  │  api/log/eqsl.ts               │                               │
│  │  api/log/qrz.ts (NEW)          │                               │
│  │  api/activation/pota.ts (NEW)   │                               │
│  │  api/activation/sota.ts (NEW)   │                               │
│  │  api/sync/qso.ts (NEW)         │                               │
│  └─────────────────────────────────┘                               │
│                                                                      │
│  ┌────────────────────────────────────┐                             │
│  │   Activation Mode (6.6)            │                             │
│  │   ParkSearch + ActivationCounter   │                             │
│  │   QuickLogForm + ADIF Export       │                             │
│  │   ── replaces Logbook when active  │                             │
│  └────────────────────────────────────┘                             │
│                                                                      │
│  ┌──────────────┐                                                   │
│  │ Bridge Daemon │◄──── rigStore (freq, mode, click-to-tune)       │
│  │ (WebSocket)   │                                                  │
│  └──────────────┘                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 8. Implementation Phases

### Phase 1: Foundation (Features 6.1, 6.10)

**Rationale:** DXCC status is a dependency for band map (6.4) and alerts (6.9). Credential wiring is a dependency for all QSL integrations.

| File                                                 | Owner   | Action                         |
| ---------------------------------------------------- | ------- | ------------------------------ |
| `src/hooks/useDxccStatus.ts`                         | Agent A | New                            |
| `src/components/qso/DxccStatusBadge.tsx`             | Agent A | New                            |
| `src/lib/db/logStore.ts`                             | Agent A | Modify                         |
| `src/components/qso/QSOEntryForm.tsx`                | Agent A | Modify                         |
| `src/components/settings/CredentialUnlockDialog.tsx` | Agent B | New                            |
| `src/lib/db/credentialStore.ts`                      | Agent B | Exists — wire into QSL modules |
| `src/stores/profileStore.ts`                         | Agent B | Modify                         |

**Quality gate:** `tsc --noEmit` clean, DXCC badge renders with all 5 color states, credential unlock + encrypt/decrypt round-trips via existing `credentialStore.ts`.

### Phase 2: Awards + LoTW (Features 6.2, 6.3)

**Rationale:** Award tracking needs DXCC status from Phase 1. LoTW needs credential wiring from Phase 1.

| File                                    | Owner   | Action |
| --------------------------------------- | ------- | ------ |
| `src/lib/awards/awardEngine.ts`         | Agent A | New    |
| `src/lib/awards/types.ts`               | Agent A | New    |
| `src/lib/awards/usStateMap.ts`          | Agent A | New    |
| `src/hooks/useAwardProgress.ts`         | Agent A | New    |
| `src/pages/AwardsPage.tsx`              | Agent A | New    |
| `src/components/awards/DxccGrid.tsx`    | Agent A | New    |
| `src/components/awards/WasMap.tsx`      | Agent A | New    |
| `src/components/awards/WazGrid.tsx`     | Agent A | New    |
| `src/lib/sync/lotwSync.ts`              | Agent B | New    |
| `src/hooks/useLotwSync.ts`              | Agent B | New    |
| `src/components/qso/LotwSyncButton.tsx` | Agent B | New    |
| `src/components/qso/QslStatusIcons.tsx` | Agent B | New    |
| `api/log/lotw.ts`                       | Agent B | Modify |

**Quality gate:** `tsc --noEmit` clean, DXCC grid renders with mock data, LoTW upload/download against test account.

### Phase 3: Band Map + Sync (Features 6.4, 6.5)

**Rationale:** Band map uses DXCC status colors from Phase 1. Sync engine is independent but logically follows QSL integrations.

| File                                              | Owner   | Action |
| ------------------------------------------------- | ------- | ------ |
| `src/components/qso/BandMap.tsx`                  | Agent A | New    |
| `src/components/qso/BandMapSpot.tsx`              | Agent A | New    |
| `src/components/qso/BandMapControls.tsx`          | Agent A | New    |
| `src/hooks/useBandMapSpots.ts`                    | Agent A | New    |
| `src/lib/data/bandRanges.ts`                      | Agent A | New    |
| `src/lib/sync/syncEngine.ts`                      | Agent B | New    |
| `src/lib/sync/syncQueue.ts`                       | Agent B | New    |
| `src/hooks/useSyncEngine.ts`                      | Agent B | New    |
| `src/components/qso/SyncStatusIndicator.tsx`      | Agent B | New    |
| `supabase/migrations/20260215000000_qso_sync.sql` | Agent B | New    |
| `api/sync/qso.ts`                                 | Agent B | New    |

**Quality gate:** `tsc --noEmit` clean, band map renders Supabase spots, sync round-trips between two browser tabs.

### Phase 4: Activation Workflow (Feature 6.6)

**Rationale:** Activation mode builds on the QSO entry system proven in Phases 1-3.

| File                                              | Owner   | Action |
| ------------------------------------------------- | ------- | ------ |
| `src/components/activation/ActivationPanel.tsx`   | Agent A | New    |
| `src/components/activation/ParkSearch.tsx`        | Agent A | New    |
| `src/components/activation/ActivationCounter.tsx` | Agent A | New    |
| `src/components/activation/QuickLogForm.tsx`      | Agent A | New    |
| `src/hooks/useActivation.ts`                      | Agent A | New    |
| `api/activation/pota.ts`                          | Agent A | New    |
| `api/activation/sota.ts`                          | Agent A | New    |

**Quality gate:** `tsc --noEmit` clean, park/summit search returns results, QSO counter increments, ADIF export produces valid file.

### Phase 5: eQSL + QRZ + Alerts + Filter/Export (Features 6.7, 6.8, 6.9, 6.11)

**Rationale:** eQSL/QRZ follow the same pattern as LoTW (Phase 2). Alerts require DXCC status + Supabase realtime. Log filter/export (6.11) is additive polish that depends on the full log being populated from earlier phases.

| File                                         | Owner   | Action |
| -------------------------------------------- | ------- | ------ |
| `src/lib/sync/eqslSync.ts`                   | Agent A | New    |
| `src/hooks/useEqslSync.ts`                   | Agent A | New    |
| `src/components/qso/QslSyncPanel.tsx`        | Agent A | New    |
| `src/lib/sync/qrzSync.ts`                    | Agent A | New    |
| `src/hooks/useQrzSync.ts`                    | Agent A | New    |
| `api/log/qrz.ts`                             | Agent A | New    |
| `src/components/qso/FilterChips.tsx`         | Agent A | New    |
| `src/lib/alerts/alertEngine.ts`              | Agent B | New    |
| `src/hooks/useSpotAlerts.ts`                 | Agent B | New    |
| `src/components/alerts/AlertRuleBuilder.tsx` | Agent B | New    |
| `src/components/alerts/AlertToast.tsx`       | Agent B | New    |
| `src/components/alerts/AlertHistory.tsx`     | Agent B | New    |

**Quality gate:** `tsc --noEmit` clean, eQSL/QRZ sync functional, alert fires on matching spot, filter chips render and clear correctly, ADIF export respects active filters.

---

## 9. File Inventory

### New Files (~43)

| File                                                 | Phase | Purpose                                   |
| ---------------------------------------------------- | ----- | ----------------------------------------- |
| `src/hooks/useDxccStatus.ts`                         | 1     | DXCC status computation hook              |
| `src/components/qso/DxccStatusBadge.tsx`             | 1     | Color-coded status badge                  |
| `src/components/settings/CredentialUnlockDialog.tsx` | 1     | Passphrase unlock dialog for QSL services |
| `src/lib/awards/awardEngine.ts`                      | 2     | Award progress computation                |
| `src/lib/awards/types.ts`                            | 2     | Award type definitions                    |
| `src/lib/awards/usStateMap.ts`                       | 2     | US state mapping + SVG paths              |
| `src/hooks/useAwardProgress.ts`                      | 2     | Award progress hook                       |
| `src/pages/AwardsPage.tsx`                           | 2     | Awards dashboard page                     |
| `src/components/awards/DxccGrid.tsx`                 | 2     | DXCC entity progress grid                 |
| `src/components/awards/WasMap.tsx`                   | 2     | WAS state map                             |
| `src/components/awards/WazGrid.tsx`                  | 2     | WAZ zone grid                             |
| `src/lib/sync/lotwSync.ts`                           | 2     | LoTW upload/download/match                |
| `src/hooks/useLotwSync.ts`                           | 2     | LoTW sync hook                            |
| `src/components/qso/LotwSyncButton.tsx`              | 2     | LoTW sync button + progress               |
| `src/components/qso/QslStatusIcons.tsx`              | 2     | Shared QSL status icons                   |
| `src/components/qso/BandMap.tsx`                     | 3     | Band map SVG widget                       |
| `src/components/qso/BandMapSpot.tsx`                 | 3     | Band map spot pip                         |
| `src/components/qso/BandMapControls.tsx`             | 3     | Band map filters                          |
| `src/hooks/useBandMapSpots.ts`                       | 3     | Supabase spot polling hook                |
| `src/lib/data/bandRanges.ts`                         | 3     | Band frequency range data                 |
| `src/lib/sync/syncEngine.ts`                         | 3     | Core sync orchestrator                    |
| `src/lib/sync/syncQueue.ts`                          | 3     | Offline queue management                  |
| `src/hooks/useSyncEngine.ts`                         | 3     | Sync lifecycle hook                       |
| `src/components/qso/SyncStatusIndicator.tsx`         | 3     | Header sync status widget                 |
| `supabase/migrations/20260215000000_qso_sync.sql`    | 3     | qso_log table + RLS                       |
| `api/sync/qso.ts`                                    | 3     | Batch sync edge function                  |
| `src/components/activation/ActivationPanel.tsx`      | 4     | Activation mode main UI                   |
| `src/components/activation/ParkSearch.tsx`           | 4     | Park/summit autocomplete                  |
| `src/components/activation/ActivationCounter.tsx`    | 4     | QSO count ring                            |
| `src/components/activation/QuickLogForm.tsx`         | 4     | Mobile-optimized entry                    |
| `src/hooks/useActivation.ts`                         | 4     | Activation state management               |
| `api/activation/pota.ts`                             | 4     | POTA API proxy                            |
| `api/activation/sota.ts`                             | 4     | SOTA API proxy                            |
| `src/lib/sync/eqslSync.ts`                           | 5     | eQSL upload/download/match                |
| `src/hooks/useEqslSync.ts`                           | 5     | eQSL sync hook                            |
| `src/components/qso/QslSyncPanel.tsx`                | 5     | Unified QSL sync panel                    |
| `src/lib/sync/qrzSync.ts`                            | 5     | QRZ.com logbook sync                      |
| `src/hooks/useQrzSync.ts`                            | 5     | QRZ sync hook                             |
| `api/log/qrz.ts`                                     | 5     | QRZ logbook API edge function             |
| `src/components/qso/FilterChips.tsx`                 | 5     | Log filter chip bar (6.11)                |
| `src/lib/alerts/alertEngine.ts`                      | 5     | Rule evaluation + dispatch                |
| `src/hooks/useSpotAlerts.ts`                         | 5     | Supabase realtime subscription            |
| `src/components/alerts/AlertRuleBuilder.tsx`         | 5     | Rule creation form                        |
| `src/components/alerts/AlertToast.tsx`               | 5     | In-app alert toast                        |
| `src/components/alerts/AlertHistory.tsx`             | 5     | Alert history list                        |

### Modified Files (~22)

| File                                  | Phases     | Changes                                                                      |
| ------------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| `src/lib/db/logStore.ts`              | 1, 2, 3, 5 | New queries: getWorkedDxccSlots, batch QSL updates, getEntriesSinceVersion   |
| `src/lib/db/types.ts`                 | 2          | Add `state` field to LogEntry                                                |
| `src/lib/db/config.ts`                | 2          | Add `by-state` index, DB version 5                                           |
| `src/lib/db/credentialStore.ts`       | 1          | Wire into QSL sync modules (already exists, no new code -- integration only) |
| `src/stores/qsoStore.ts`              | 1, 2, 3, 4 | DXCC status reactivity, QSL actions, sync hooks, activation mode             |
| `src/stores/profileStore.ts`          | 1, 2, 3, 5 | Credential unlock prompts, last sync timestamps                              |
| `src/stores/authStore.ts`             | 3          | Trigger sync start/stop                                                      |
| `src/stores/rigStore.ts`              | 3          | setFrequency() action for click-to-tune                                      |
| `src/stores/settingsStore.ts`         | 5          | Alert sound preferences                                                      |
| `src/components/qso/QSOEntryForm.tsx` | 1, 3       | DxccStatusBadge, band map auto-fill                                          |
| `src/components/qso/QSOLogTable.tsx`  | 2, 5       | QSL status columns, filter chip integration                                  |
| `src/hooks/useQSOEntry.ts`            | 1          | DXCC re-evaluation on rig change                                             |
| `src/hooks/useCallsignLookup.ts`      | 4          | POTA/SOTA spot cross-reference                                               |
| `src/pages/Logbook.tsx`               | 3, 4, 5    | Band map sidebar, activation mode layout, filter bar                         |
| `src/pages/SettingsPage.tsx`          | 1          | Credential passphrase setup section                                          |
| `src/components/Header.tsx`           | 3          | SyncStatusIndicator                                                          |
| `src/lib/adif/export.ts`              | 4, 5       | Filtered activation export, generalized filtered export (6.11)               |
| `src/lib/adif/import.ts`              | 2          | ADIF import field mapping for QSL status fields (US-6.2.6)                   |
| `src/lib/supabase.ts`                 | 3, 5       | Spot query helpers, realtime subscription                                    |
| `api/log/lotw.ts`                     | 2          | Verify/update upload+download                                                |
| `api/log/eqsl.ts`                     | 5          | Verify/update                                                                |
| `api/log/eqsl-inbox.ts`               | 5          | Verify/update                                                                |

---

## 10. Quality Gates

| Gate | After Phase | Criteria                                                                                                          |
| ---- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| QG-1 | Phase 1     | `tsc --noEmit` clean. DXCC badge renders 5 states. CredentialUnlockDialog wires to existing `credentialStore.ts`. |
| QG-2 | Phase 2     | `tsc --noEmit` clean. Awards page loads <500ms/10K entries, <2s/50K entries. LoTW upload/download functional.     |
| QG-3 | Phase 3     | `tsc --noEmit` clean. Band map renders live spots. Sync works between two tabs. No data loss.                     |
| QG-4 | Phase 4     | `tsc --noEmit` clean. Park search works. Counter increments. ADIF export valid.                                   |
| QG-5 | Phase 5     | `tsc --noEmit` clean. eQSL/QRZ sync functional. Alert fires within 5s of matching spot. Full `vite build` clean.  |

---

## 11. Open Questions

### Resolved Questions (v1.1)

| #     | Question                                                       | Resolution                                                                                                                                                                                                                                  |
| ----- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~1~~ | **LoTW: TQSL wrapper vs direct API?**                          | **Resolved: Phased approach.** Phase 2 ships TQSL-ready ADIF export (user signs externally). Phase 2.5 spike explores bridge-mediated TQSL signing. Download path uses direct API with username/password. See Feature 6.3 revised overview. |
| ~~2~~ | **Band map: Supabase polling vs bridge DX cluster?**           | **Resolved: Bridge preferred with Supabase fallback.** Bridge gives ~0s latency; Supabase has 2-5 min delay. Display badge indicates data source. See Feature 6.4 revised technical design.                                                 |
| ~~4~~ | **Awards: Add `state` field to LogEntry or derive from grid?** | **Resolved: Add field.** Grid-to-state derivation is lossy. Explicit `state?: string` field added to LogEntry with `by-state` index. See Feature 6.2 revised decision.                                                                      |
| ~~5~~ | **Credential PIN: Required or optional?**                      | **Resolved: N/A.** Credential vault already exists with passphrase-based unlock. Existing implementation uses user-chosen passphrase (not PIN). No decision needed.                                                                         |

### Open Questions

| #   | Question                                                                                                                                                                                                                                                                                                                                                                       | Impact                                                                                | Decision Needed By   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | -------------------- |
| 3   | **Sync: Supabase Realtime vs polling for push?** Realtime subscription gives instant cross-device updates but adds WebSocket connection. Polling at 30s is simpler.                                                                                                                                                                                                            | Phase 3                                                                               | Before Phase 3 start |
| 6   | **POTA API: Direct from frontend or via edge function?** pota.app API has no CORS restrictions currently. Could call directly. But edge function adds caching + rate limiting + isolation from API changes.                                                                                                                                                                    | Phase 4                                                                               | Before Phase 4 start |
| 7   | **Alert audio: Web Audio API or HTML5 Audio?** Web Audio API gives more control (CW tone generation) but is more complex. HTML5 Audio is simpler for preset sounds.                                                                                                                                                                                                            | Phase 5                                                                               | Before Phase 5 start |
| 8   | **IndexedDB 50K entry limit.** What happens when an operator exceeds 50K entries? Options: (a) Raise the limit with performance testing to determine actual ceiling, (b) Implement log archival (move old entries to Supabase-only, keep recent N entries local), (c) Paginated IndexedDB with lazy loading. A serious DXer or contester accumulates 50K+ QSOs in a few years. | Phase 2 (award computations scan all entries) and Phase 3 (sync must handle full log) | Before Phase 2 start |
| 9   | **Color palette: "New Band" (signal-green) vs "Confirmed" (signal-green).** Both use `signal-green` in different contexts (DXCC badge vs award grid). If badge and grid ever appear on the same screen, the dual meaning could confuse. Consider using a distinct shade (e.g., `nebula-blue` shift) for one context.                                                           | Phase 1                                                                               | Before Phase 1 start |

---

## Appendix A: ADIF Field Coverage for QSL Services

| Service        | Required ADIF Fields                                                                           | Optional Fields                                              |
| -------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| LoTW Upload    | CALL, BAND, MODE, QSO_DATE, TIME_ON, RST_SENT, RST_RCVD, STATION_CALLSIGN                      | FREQ, GRIDSQUARE, MY_GRIDSQUARE, TX_PWR, PROP_MODE, SAT_NAME |
| LoTW Download  | CALL, BAND, MODE, QSO_DATE, TIME_ON, QSL_RCVD, LOTW_QSL_RCVD                                   | DXCC, CQZ, ITUZ, GRIDSQUARE                                  |
| eQSL Upload    | CALL, BAND, MODE, QSO_DATE, TIME_ON, RST_SENT, RST_RCVD                                        | PROP_MODE, SAT_NAME, COMMENT                                 |
| eQSL Download  | CALL, BAND, MODE, QSO_DATE, QSL_RCVD                                                           | EQSL_QSL_RCVD                                                |
| QRZ.com Upload | CALL, BAND, MODE, QSO_DATE, TIME_ON                                                            | All standard ADIF fields accepted                            |
| POTA Export    | CALL, BAND, MODE, QSO_DATE, TIME_ON, RST_SENT, RST_RCVD, STATION_CALLSIGN, MY_SIG, MY_SIG_INFO | SIG, SIG_INFO, FREQ, MY_GRIDSQUARE                           |

## Appendix B: Color Palette Reference

| Status               | Tailwind Class   | Hex             | Usage                                 |
| -------------------- | ---------------- | --------------- | ------------------------------------- |
| New DXCC Entity      | `alert-red`      | Project palette | DXCC badge, band map pips, award grid |
| New Band Slot        | `signal-green`   | Project palette | DXCC badge, band map pips             |
| New Mode Slot        | `nebula-blue`    | Project palette | DXCC badge, band map pips             |
| Worked (confirmed)   | `signal-green`   | Project palette | Award grid cells                      |
| Worked (unconfirmed) | `caution-yellow` | Project palette | Award grid cells                      |
| Already Worked       | `plasma-orange`  | Project palette | DXCC badge, band map pips             |
| Duplicate            | `void` (dimmed)  | Project palette | DXCC badge, band map pips             |
| Needed               | transparent/gray | --              | Award grid cells                      |
