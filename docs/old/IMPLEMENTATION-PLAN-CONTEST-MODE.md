# ProPulse Contest Mode — AI Agent Execution Roadmap

**Intent:** Complete end-to-end build (not incremental releases)  
**Scope:** Contest Mode features defined in `PRD-CONTEST-FEATURES.md`  
**Repo:** `/Users/aiml/Projects/propulse` (Vite + React + TypeScript + Zustand)  
**Validation bar:** `npm run lint` + `npm run build` + manual high-rate UX checks in `npm run dev`

---

## How To Use This Plan (For Agents)

- Each task is designed to be **independently executable** with explicit files, interfaces, and acceptance criteria.
- **Parallelizable work** is grouped into **workstreams** within a phase. A phase may have a **Gate** task that must finish before parallel work begins.
- Do not start a phase until its **Entry Criteria** is satisfied.
- Do not consider a phase complete until its **Exit Criteria** is satisfied.

---

## Dependency Graph (High-Level)

1. **Domain contracts** (contest schema + engine APIs + bridge protocol)  
2. **Rules engine** (parse/validate/dupe/mults/score) + **contest database upgrades**  
3. **State layer** (contest store + migrations + derived selectors)  
4. **Core UI refactor** (new layout + config + editing/undo plumbing)  
5. **Operator UX** (one-line entry + hotkeys/ESM + QC + mult matrix/queue)  
6. **Awareness layers** (spots/bandmap + propagation readiness + alerts)  
7. **Interop** (Cabrillo + ADIF, import tools)  
8. **Bridge** (CAT + multi-op + live sync)  
9. **Hardening** (performance, accessibility, docs)

Hidden dependency callouts:
- Correct scoring requires **per-band score model** and **multi-multiplier types** (e.g., CQWW = zones + DXCC per band).
- CAT + “click-to-tune” requires a **stable local bridge protocol** agreed early, even if implemented later.
- Spots “needed” filtering requires **mult extraction** and **mult sets** that match scoring rules (per band/per mode).

---

## Phase 0 — Contracts & Scaffolding (Gate Phase)

### Goals
- Freeze contracts so multiple agents can work without churn.

### Entry Criteria
- `PRD-CONTEST-FEATURES.md` approved as baseline.

### Exit Criteria
- Project compiles after schema scaffolding (even if features are stubbed).
- New contracts documented (types + engine interfaces + bridge protocol).

### 0.1 (GATE) Contest Domain Schema vNext

**Depends on:** none  
**Parallelizable:** no (this unblocks nearly everything)

**Implementation**
- Update `src/types/contest.ts` to introduce/standardize:
  - `DupeRule`:
    - `perBand: boolean`
    - `perMode: boolean`
  - `MultiplierRule`:
    - `type: MultiplierType`
    - `source: "callsign" | "exchange"` (explicit; CQ/ITU zones should be `exchange`)
    - `perBand: boolean`
  - `ScoreModel`:
    - `"points_x_mults_per_band"` (Σ bandPoints × bandMults)
    - `"points_x_mults_total"` (totalPoints × totalMults)
    - `"field_day"` (points + bonuses; no mult multiplication)
  - Update `ContestDefinition` to use:
    - `multiplierRules: MultiplierRule[]` (replaces single `multiplierType`)
    - `dupeRule: DupeRule`
    - `scoreModel: ScoreModel`
    - keep existing `exchange`, `categories`, `cabrilloId`, etc.
- Update any type exports/imports that break compile due to schema change.

**Acceptance Criteria**
- TypeScript build passes with the new schema present (features can still be unimplemented elsewhere).

---

### 0.2 Contest Engine Module Boundaries

**Depends on:** 0.1  
**Parallelizable:** yes (with 0.3)

**Implementation**
- Create `src/lib/contest/` with:
  - `src/lib/contest/index.ts` exporting the stable API surface:
    - `normalizeCallsign(callsign: string): string`
    - `normalizeBand(band: string): string`
    - `normalizeMode(mode: string): string`
    - `parseOneLineEntry(args: { input: string; contest: ContestDefinition; defaults: {...} }): ParsedEntry`
    - `validateQSO(qsoDraft: ContestQSODraft, ctx: ContestContext): ValidationResult`
    - `computeDupeStatus(qsoDraft: ContestQSODraft, ctx: ContestContext): DupeResult`
    - `extractMultipliers(qso: ContestQSO, contest: ContestDefinition): ExtractedMultiplier[]`
    - `computeScore(session: ContestSession, contest: ContestDefinition): ScoreSummary`
  - Define `ParsedEntry`, `ContestQSODraft`, `ContestContext`, `ScoreSummary` types in `src/lib/contest/types.ts`.
- Keep implementations stubbed initially (return safe defaults) until Phase 1.

**Acceptance Criteria**
- App compiles and exports are stable enough for other agents to import.

---

### 0.3 ProPulse Bridge Protocol (Contract Only)

**Depends on:** 0.1 (needs QSO/session field expectations)  
**Parallelizable:** yes (with 0.2)

**Implementation**
- Add `docs/CONTEST-BRIDGE-PROTOCOL.md` defining:
  - Transport: WebSocket on `ws://127.0.0.1:<port>`
  - Message envelope:
    - `{ type: string; id?: string; ts: string; payload: unknown }`
  - Required message types (contract; implementation later):
    - `rig.status`, `rig.update`, `rig.set` (freq/mode/split/PTT)
    - `contest.session.create`, `contest.session.join`, `contest.session.event`
    - `contest.lock.set`, `contest.lock.state`, `contest.note.add`
    - `n1mm.rx`, `n1mm.tx` (if/when supported)
  - Security constraints: localhost-only, explicit opt-in, no remote bind by default.

**Acceptance Criteria**
- Protocol doc exists and is referenced by later phases (no code required yet).

---

## Phase 1 — Rules Engine + Contest Database Upgrade

### Goals
- Implement contest-correct scoring primitives that everything else builds on.

### Entry Criteria
- Phase 0 complete (schema + engine exports exist; bridge protocol documented).

### Exit Criteria
- Contest scoring is correct for core contests (CQWW, WPX, ARRL DX, Sweepstakes, Field Day) per modeled rules.
- Multipliers and dupes behave per contest rule config.
- Engine functions have unit-like self-checks via manual dev harness (no test runner required).

### Workstreams (Parallel After Gate Task 1.1)
- **WS1A:** Contest database updates  
- **WS1B:** Parsing/validation core  
- **WS1C:** Dupe + multiplier extraction  
- **WS1D:** Scoring + breakdowns (incl. per-band score model)

### 1.1 (GATE) Update Contest Database Schema Usage

**Depends on:** 0.1  
**Parallelizable:** no (unblocks 1A–1D)

**Implementation**
- Refactor `src/lib/data/contests.ts` to satisfy the new `ContestDefinition` schema:
  - Replace `multiplierType` / `multiplierPerBand` with `multiplierRules`.
  - Add `dupeRule` and `scoreModel`.
- Keep contest IDs stable (backward compatibility).

**Acceptance Criteria**
- App compiles with the updated contest database shape.

---

### 1A.1 Core Contest Rule Modeling (CQWW, WPX, ARRL DX, SS, FD)

**Depends on:** 1.1  
**Parallelizable:** yes (WS1A)

**Implementation**
- In `src/lib/data/contests.ts`, implement these modeled rules:
  - **CQWW (CW/SSB)**:
    - `multiplierRules`: `{ type: "CQ_ZONE", source: "exchange", perBand: true }` + `{ type: "DXCC", source: "callsign", perBand: true }`
    - `dupeRule`: perBand true, perMode false (single-mode contest weekend)
    - `scoreModel`: `points_x_mults_per_band`
  - **CQWPX (CW/SSB)**:
    - `multiplierRules`: `{ type: "WPX_PREFIX", source: "callsign", perBand: true }`
    - `dupeRule`: perBand true, perMode false
    - `scoreModel`: `points_x_mults_per_band`
    - scoring notes: low-band intercontinental points handling (engine)
  - **ARRL DX (CW/SSB)**:
    - `dupeRule`: perBand true, perMode false
    - `scoreModel`: `points_x_mults_per_band`
    - `multiplierRules` must be conditional:
      - W/VE: DXCC per band
      - DX: STATE/PROVINCE per band
    - Implement via two definitions or a single definition with a `multiplierRulesResolver` pattern (documented in code comments).
  - **ARRL Sweepstakes (CW/SSB)**:
    - `multiplierRules`: `{ type: "SECTION", source: "exchange", perBand: false }`
    - `dupeRule`: perBand false, perMode false (once per contest)
    - `scoreModel`: `points_x_mults_total`
  - **ARRL Field Day**:
    - `multiplierRules`: `[]`
    - `dupeRule`: perBand true, perMode true (CW/SSB/Digital are distinct)
    - `scoreModel`: `field_day`
- Keep `exchange.fields` accurate for parsing/validation (e.g., SS: serial/precedence/check/section; FD: class/section).

**Acceptance Criteria**
- For each contest, a developer can print the definition and see the rule intent clearly (no implicit magic).

---

### 1B.1 One-Line Parser (Contest-Aware)

**Depends on:** 1.1  
**Parallelizable:** yes (WS1B)

**Implementation**
- Implement `parseOneLineEntry` in `src/lib/contest/parsing.ts`:
  - Input: raw string + contest definition + defaults (band/mode/rst/currentSerial)
  - Output: `ParsedEntry` with:
    - `callsign` (normalized)
    - `rstReceived` (supports `5NN` → `599`)
    - `exchangeTokens` + `exchangeReceived` (normalized)
    - `serialReceived?`, `zone?`, `state?`, `section?`, `class?`, `precedence?`, `check?`, `power?` extracted when the contest expects them
    - `errors[]` / `warnings[]` (parser-level)
- Parsing rules:
  - First token matching callsign regex is treated as callsign.
  - Remaining tokens are consumed according to `contest.exchange.fields` order (RST is optional if missing; others produce warnings if missing).
  - Preserve a `rawInput` field for later auditing.

**Acceptance Criteria**
- Given sample inputs for CQWW/SS/FD, parser yields consistent structured fields without throwing.

---

### 1B.2 Validation Engine (Rule-Based, Non-Blocking by Default)

**Depends on:** 1B.1 + 1A.1  
**Parallelizable:** yes (WS1B)

**Implementation**
- Implement `validateQSO` in `src/lib/contest/validation.ts`:
  - Validate required fields implied by contest exchange fields.
  - Validate ranges/sets:
    - CQ zone 1–40; ITU zone 1–90
    - ARRL/RAC sections (reuse canonical list from `src/lib/utils/scoring.ts` or factor into shared source)
    - Field Day class pattern `^\d+[A-F]$`
    - Sweepstakes precedence one of `Q|A|B|U|M|S`
    - Check is 2-digit year
  - Return `{ errors: ValidationIssue[]; warnings: ValidationIssue[] }`
  - Do not hard-block by default; allow UI to configure “block on error” vs “warn”.

**Acceptance Criteria**
- Validation catches common busted exchanges without false positives on legitimate formats.

---

### 1C.1 Dupe Engine (Contest-Correct)

**Depends on:** 1A.1  
**Parallelizable:** yes (WS1C)

**Implementation**
- Implement `computeDupeStatus` in `src/lib/contest/dupes.ts`:
  - Use `contest.dupeRule.perBand/perMode` to compute the dupe key.
  - Ignore QSOs marked as dupes when checking future dupes (consistent with log-checking behavior).
  - Return `{ isDupe: boolean; dupeKey: string; reason: "contest" | "band" | "band_mode" }`.

**Acceptance Criteria**
- Field Day allows same callsign on same band but different mode (not a dupe).
- Sweepstakes treats repeats on any band as dupe.

---

### 1C.2 Multiplier Extraction (Multi-Type, Source-Aware)

**Depends on:** 1A.1  
**Parallelizable:** yes (WS1C)

**Implementation**
- Implement `extractMultipliers` in `src/lib/contest/multipliers.ts`:
  - For each `MultiplierRule`:
    - Get value from `callsign` or `exchange` depending on rule source.
    - Use existing utilities in `src/lib/utils/multipliers.ts` where possible:
      - DXCC entity from callsign
      - WPX prefix from callsign
      - US state / Canadian province / section extraction from exchange
  - Output list `ExtractedMultiplier[]` with `{ type, value, bandKey? }`.
  - Normalize value casing and band key (`20m`, etc).

**Acceptance Criteria**
- CQWW logs produce both zone and DXCC multipliers per band.
- WPX produces prefix multiplier per band.

---

### 1D.1 Score Engine (Per-Band Formula + Breakdowns + Running Rate)

**Depends on:** 1A.1 + 1C.1 + 1C.2  
**Parallelizable:** yes (WS1D)

**Implementation**
- Implement `computeScore` in `src/lib/contest/scoring.ts`:
  - Compute:
    - total QSOs (non-dupe)
    - dupe count
    - total points (non-dupe)
    - multiplier counts by type and by band
    - band points + band multipliers + band score
    - total score per contest `scoreModel`
    - running rate (10m / 60m windows)
  - Scoring modes:
    - fixed points per QSO
    - mixed mode points (CW/SSB/Digital)
    - zone/continent based points (use `getDXCCEntity` + continent compare; include WPX low-band special-case)
    - field day scoring: points + placeholder bonuses (bonuses implemented Phase 4/6)

**Acceptance Criteria**
- CQWW score uses Σ(bandPoints × bandMults) (not global multiplication).
- Score summary provides band/mode breakdowns for UI.

---

## Phase 2 — Contest Store Refactor + Core UI Wiring

### Goals
- Make the UI a thin layer over a correct rules engine and state model.

### Entry Criteria
- Phase 1 complete: rules engine works for core contests.

### Exit Criteria
- Contest page works end-to-end with new store model (even before advanced UX).
- Logging a QSO updates score, mults, dupes correctly.

### Workstreams (Parallel)
- **WS2A:** Store + migrations  
- **WS2B:** Contest config modal + session metadata  
- **WS2C:** Core page layout + baseline components

### 2A.1 Refactor `contestStore` to Use Engine Types

**Depends on:** Phase 1 (engine functions stable)  
**Parallelizable:** yes (WS2A)

**Implementation**
- Update `src/stores/contestStore.ts`:
  - Replace current QSO/session types with engine-compatible versions:
    - `ContestQSO` should include `rawInput`, `frequencyKHz?`, `band`, `mode`, `timestamp`, `exchangeReceived`, parsed fields, `isDupe`, `isMultiplier[]`, `multipliers[]`, `points`, `notes?`, `flags` (e.g., `uncertain`)
  - Store derived `scoreSummary` computed via `computeScore`.
  - Add actions:
    - `logQSO(draft: ContestQSODraft)`
    - `editQSO(id, updates)`
    - `undoLastQSO()`
    - `setRunMode("run" | "sp")`
    - `setOperatorFocus(...)` (optional for UI)
  - Implement migrations in `persist.migrate` to upgrade existing localStorage sessions.

**Acceptance Criteria**
- Old sessions still load (or migrate cleanly) without crashing.
- Logging updates `scoreSummary` deterministically.

---

### 2B.1 Contest Session Config vNext (Categories + Cabrillo Meta)

**Depends on:** 2A.1 + Phase 1 contest definitions  
**Parallelizable:** yes (WS2B)

**Implementation**
- Update `src/components/contest/ContestConfigModal.tsx`:
  - Categories should be generated from selected contest definition options.
  - Add “assisted/unassisted” when contest supports it.
  - Add optional “Cabrillo metadata” fields:
    - operator name (default from `useUserStore().station.operatorName`)
    - email (new user preference or per-session)
    - club (optional)
    - location (state/section/country) if required by contest export
  - Persist selected options into the contest session via store `startContest`.

**Acceptance Criteria**
- Starting a session results in a fully populated session object required for Cabrillo export later (even if optional fields are blank).

---

### 2C.1 Contest Page Layout Refactor (Composable Panels)

**Depends on:** 2A.1  
**Parallelizable:** yes (WS2C)

**Implementation**
- Refactor `src/pages/Contest.tsx` into a layout composed of:
  - `ContestScoreboard` (placeholder in Phase 2; enhanced later)
  - `ContestEntryArea` (placeholder; replaced by one-line entry in Phase 3)
  - `ContestMultiplierPanel` (placeholder; matrix in Phase 4)
  - `ContestQSOTable` (with edit/undo hooks; functionality added in Phase 3/4)
- Ensure minimal re-renders:
  - selectors from Zustand should be narrow (avoid passing entire session into many components).

**Acceptance Criteria**
- Page renders for active and inactive sessions.
- Basic log flow works using existing form or a temporary input (until Phase 3).

---

## Phase 3 — Keyboard-First Entry + Hotkeys + ESM

### Goals
- Achieve high-rate, keyboard-only logging workflow.

### Entry Criteria
- Phase 2 complete (store + UI wiring stable).

### Exit Criteria
- One-line entry logs QSOs reliably with dupe/mult feedback and undo/edit-last.

### Workstreams (Parallel)
- **WS3A:** One-line entry UI  
- **WS3B:** Hotkeys + macros + ESM  
- **WS3C:** Edit/undo + last-QSO tooling

### 3A.1 One-Line Entry Component

**Depends on:** Phase 1 parser/validation + Phase 2 store  
**Parallelizable:** yes (WS3A)

**Implementation**
- Create `src/components/contest/ContestOneLineEntry.tsx`:
  - Single input + compact status row (dupe, new mult, validation warnings).
  - On Enter:
    - parse input
    - validate
    - compute dupe
    - log QSO (or block if configured)
  - After log: clear input, keep focus, optionally auto-advance band/mode if CAT is driving it.

**Acceptance Criteria**
- Logging a line like `K3LR 59 05` results in a valid QSO with expected parsed fields.

---

### 3B.1 Hotkeys + F-Key Macros + ESM

**Depends on:** 3A.1 (for integration)  
**Parallelizable:** yes (WS3B)

**Implementation**
- Add `src/hooks/useContestHotkeys.ts`:
  - Default bindings:
    - `Enter` log / advance ESM state
    - `Esc` wipe input
    - `Ctrl+Z` undo last
    - `Ctrl+E` edit last
    - `Alt+1..9` band quick select (configurable)
    - `F1..F12` macros (CQ/EXCH/TU/etc)
- Implement ESM state machine in store or hook:
  - Run mode: CQ → Exchange → TU/log
  - S&P mode: Spot/call → exchange → log
  - For v1, macros can be “simulated” (UI toast + log).

**Acceptance Criteria**
- Operator can log and correct QSOs without touching the mouse.

---

### 3C.1 Edit Last + Undo Last (Fast Recovery)

**Depends on:** 2A.1  
**Parallelizable:** yes (WS3C)

**Implementation**
- Add store actions:
  - `undoLastQSO()` removes last QSO and recomputes score.
  - `editQSO(id, updates)` updates QSO, recomputes score, re-validates multipliers/dupes.
- Add `ContestEditLastModal` or inline editor for last QSO.

**Acceptance Criteria**
- Undo/edit updates multipliers and score correctly (no stale mult sets).

---

## Phase 4 — Strategy Layer (Scoreboard, Mult Matrix, QC/Audit)

### Goals
- Provide elite-grade decision support: rate/pacing, mult management, error control.

### Entry Criteria
- Phase 3 complete (fast logging flow exists).

### Exit Criteria
- Scoreboard includes running rates + projection.
- Mult matrix + needed queue work and integrate with spots later.
- QC/audit queue identifies risky QSOs and supports rapid fixing.

### Workstreams (Parallel)
- **WS4A:** Advanced scoreboard  
- **WS4B:** Mult matrix + needed queue  
- **WS4C:** SCP + similar calls + audit queue

### 4A.1 Advanced Scoreboard (Rates, Pace, Trend, ΔScore)

**Depends on:** Phase 1 score summary + Phase 3 UI  
**Parallelizable:** yes (WS4A)

**Implementation**
- Upgrade `src/components/contest/ContestScorePanel.tsx` (or replace with `ContestScoreboard.tsx`):
  - show 10m and 60m running rates
  - points/hr, mults/hr
  - simple projection to contest end (based on elapsed + current rate)
  - show last-QSO delta (points + new mult count)

**Acceptance Criteria**
- At high log rate, scoreboard stays readable and updates without input lag.

---

### 4B.1 Multiplier Matrix + Needed List + “Next Best Mult”

**Depends on:** Phase 1 multiplier extraction + Phase 2 store  
**Parallelizable:** yes (WS4B)

**Implementation**
- Create `src/components/contest/MultiplierMatrix.tsx`:
  - band tabs (when any rule `perBand: true`)
  - per-band grids/lists for each multiplier type
  - show worked/needed states
- Create `src/lib/contest/strategy.ts`:
  - `getNeededMultipliers(session, contest): NeededMult[]`
  - `rankNextBestMultipliers(needed, ctx): RankedTarget[]` (deterministic heuristics)
- Add UI: “Needed” panel + ranked queue.

**Acceptance Criteria**
- “Needed” list updates immediately after logging.
- CQWW shows both zone and DXCC needed counts.

---

### 4C.1 QC: SCP + Similar Calls + Audit Queue

**Depends on:** Phase 3 entry flow  
**Parallelizable:** yes (WS4C)

**Implementation**
- `src/lib/contest/scp.ts`: in-memory SCP index built from:
  - prior QSOs in session history
  - optional imported call history file(s)
- `src/lib/contest/similar.ts`: string distance checks for callsign similarity warnings.
- `src/lib/contest/audit.ts`: rules that flag anomalies (missing required exchange part, out-of-range zone, suspicious prefix/band/time).
- UI:
  - inline warnings while typing
  - `AuditQueuePanel` listing flagged QSOs with one-keystroke “edit” navigation.

**Acceptance Criteria**
- Operator can review/fix questionable QSOs without stopping the run.

---

## Phase 5 — Spots/Bandmap + Propagation Awareness

### Goals
- Make S&P multiplier hunting fast and low-noise; add actionable band awareness.

### Entry Criteria
- Phase 4 complete (needed mult + strategy available).

### Exit Criteria
- Spots panel can prefill calls and filter to needed-only; band readiness is actionable.

### Workstreams (Parallel)
- **WS5A:** Contest spots panel + filters  
- **WS5B:** Bandmap integration + click-to-prep  
- **WS5C:** Band readiness + alerts

### 5A.1 Contest Spots Panel (Contest-Aware)

**Depends on:** Phase 4 needed mults + existing DX hooks/components  
**Parallelizable:** yes (WS5A)

**Implementation**
- Create `src/components/contest/ContestSpotsPanel.tsx`:
  - uses `useDXCluster()` with external filters
  - adds contest filters: band/mode, needed-only, hide-worked, age, source
  - tags each spot: `DUPE`, `NEW MULT`, `NEEDED MULT`
- Integrate into `src/pages/Contest.tsx` layout.

**Acceptance Criteria**
- Clicking a spot pre-fills callsign in one-line entry and shows dupe/mult status instantly.

---

### 5B.1 Bandmap (Frequency-Time) in Contest Page

**Depends on:** 5A.1  
**Parallelizable:** yes (WS5B)

**Implementation**
- Reuse `src/components/dx/BandMap.tsx` within Contest layout:
  - bind to selected band (from contest entry state / CAT)
  - hook selection to “prep” a spot (prefill call; later click-to-tune via CAT)

**Acceptance Criteria**
- Bandmap selection is consistent with spot list selection (single source of truth).

---

### 5C.1 Band Readiness Strip + Alerts

**Depends on:** Phase 4 strategy + existing solar hooks  
**Parallelizable:** yes (WS5C)

**Implementation**
- Create `src/components/contest/BandReadinessStrip.tsx`:
  - derive readiness using:
    - solar indices (SFI/Kp/Bz via hooks)
    - spot density by band + (optional) region inference using DXCC/continent
  - output “Open/Marginal/Closed” per band with simple directionality tags (EU/JA/SA/OC)
- Add alert rules in `src/lib/contest/alerts.ts`:
  - “band trending up”
  - “needed mults spotted recently”
  - rate-limit + mute controls (stored in contest settings)

**Acceptance Criteria**
- Alerts are useful but non-disruptive (rate limited; mute works).

---

## Phase 6 — Interoperability (Cabrillo + ADIF + Imports)

### Goals
- Make ProPulse viable for real contest weekends and hybrid workflows.

### Entry Criteria
- Stable QSO/session data model (Phase 2+) with frequency/time/mode/exchange fields.

### Exit Criteria
- Cabrillo export is contest-correct for supported contests; ADIF import/export works for contest sessions.

### Workstreams (Parallel)
- **WS6A:** Cabrillo export  
- **WS6B:** ADIF import/export  
- **WS6C:** Call history imports (N1MM/other formats)

### 6A.1 Cabrillo Export Engine + UI

**Depends on:** Phase 2 session metadata + Phase 1 contest definitions  
**Parallelizable:** yes (WS6A)

**Implementation**
- Add `src/lib/contest/cabrillo.ts`:
  - header generation from session + user profile
  - QSO line generation from QSO records
  - contest-specific cabrillo IDs from contest definition
  - validation warnings for missing required header fields
- Add UI in Contest page:
  - “Export Cabrillo” button
  - preview modal + download

**Acceptance Criteria**
- Exported file downloads and passes basic sanity checks (headers present; QSO lines formatted; UTC times).

---

### 6B.1 Contest ADIF Import/Export

**Depends on:** Phase 2 QSO model  
**Parallelizable:** yes (WS6B)

**Implementation**
- Reuse/extend existing logbook ADIF utilities (where they live) to support contest session:
  - export session QSOs to ADIF (with contest fields in `APP_PROPULSE_*` tags if needed)
  - import ADIF into a contest session (mapping band/mode/frequency/time/exchange)
- Add UI:
  - “Import ADIF into Session”
  - “Export ADIF from Session”

**Acceptance Criteria**
- Imported QSOs appear with correct band/mode/time and do not crash scoring.

---

### 6C.1 Call History File Import (SCP Booster)

**Depends on:** Phase 4 SCP system  
**Parallelizable:** yes (WS6C)

**Implementation**
- Add importer for:
  - simple CSV (CALL, EXCHANGE fields)
  - N1MM call history file (document supported subset)
- Store in IndexedDB or localStorage with versioning.
- Expose in Contest settings UI.

**Acceptance Criteria**
- After import, SCP suggestions improve and remain available after reload.

---

## Phase 7 — ProPulse Bridge (CAT + Multi-Op + Live Sync)

### Goals
- Enable serious station integration while keeping browser app secure and portable.

### Entry Criteria
- Bridge protocol doc exists (Phase 0.3) and front-end can run without bridge.

### Exit Criteria
- Optional local bridge supports CAT updates, click-to-tune, multi-op sync (LAN), and optional N1MM live sync.

### Workstreams (Parallel After Gate 7.1)
- **WS7A:** Bridge scaffolding + WebSocket server  
- **WS7B:** CAT integration (hamlib/rigctld)  
- **WS7C:** Multi-op relay + locks/notes  
- **WS7D:** N1MM UDP integration  
- **WS7E:** Front-end bridge client hooks + UI status

### 7.1 (GATE) Bridge Project Scaffolding

**Depends on:** Phase 0.3  
**Parallelizable:** no (unblocks 7A–7E)

**Implementation**
- Add `bridge/` directory with:
  - Node + TypeScript setup
  - `bridge/src/server.ts` WebSocket server (localhost bind)
  - `bridge/README.md` run instructions
- Add root `package.json` scripts:
  - `npm run bridge` (dev)
  - `npm run bridge:build`

**Acceptance Criteria**
- Bridge starts locally and accepts a WebSocket connection from the frontend (no CAT yet).

---

### 7B.1 CAT via rigctld (Poll + Push + Guardrails)

**Depends on:** 7.1  
**Parallelizable:** yes (WS7B)

**Implementation**
- Bridge:
  - connect to `rigctld` (configurable host/port)
  - poll freq/mode/split; broadcast `rig.update`
  - accept `rig.set` to set freq/mode (safety toggles)
  - provide out-of-band checks using bandplan segments (reuse band plan data or a simplified map)
- Frontend:
  - `src/hooks/useRigBridge.ts` connects to bridge and updates contest store “radio state”
  - show big always-visible band indicator + connection status

**Acceptance Criteria**
- Band/mode/frequency auto-fill works when rigctld is available; app behaves normally when not.

---

### 7C.1 Multi-Op Sync (Roles, Locks, In-Work, Notes)

**Depends on:** 7.1 + Phase 2 store events  
**Parallelizable:** yes (WS7C)

**Implementation**
- Bridge:
  - implement session create/join with shared code
  - broadcast contest events (QSO logged/edited/undone, lock updates, note updates)
  - server-authoritative locks (band/mode lock, in-work callsign)
- Frontend:
  - extend contest store to apply remote events deterministically
  - UI:
    - roles selector
    - band lock indicator
    - shared notes panel

**Acceptance Criteria**
- Two browsers on same LAN keep a session in sync without duping or racing on the same callsign.

---

### 7D.1 N1MM Live Sync (Optional)

**Depends on:** 7.1 + stable QSO mapping  
**Parallelizable:** yes (WS7D)

**Implementation**
- Bridge:
  - listen for N1MM UDP packets
  - map to contest QSO events (document supported subset)
  - optionally transmit back minimal state (e.g., spots? not required)
- Frontend:
  - configuration UI (enable, ports)
  - show status and last message

**Acceptance Criteria**
- With N1MM broadcasting enabled, ProPulse receives enough data to mirror QSOs and update scoreboard.

---

## Phase 8 — Performance, Reliability, Docs

### Goals
- Make the tool usable at elite contest rates without UI lag; document ops workflows.

### Entry Criteria
- Phases 1–7 implemented.

### Exit Criteria
- Smooth input at high rate, no runaway re-renders, and clear docs for contesters.

### 8.1 Performance Hardening

**Parallelizable:** yes

**Implementation**
- Virtualize QSO table if needed (or limit render count with “last N”).
- Memoize derived selectors; avoid passing large objects to components.
- Consider moving heavy scoring/spot filtering into a Web Worker if profiling shows input lag.

**Acceptance Criteria**
- Typing in one-line entry remains responsive with 5,000+ QSOs in session history and 200+ spots on screen.

---

### 8.2 Accessibility + Operator Ergonomics

**Parallelizable:** yes

**Implementation**
- High-contrast mode, color-blind safe indicators (DUPE/NEW MULT).
- “Big band/mode” persistent indicator for multi-op.
- Configurable text scale integration with existing user preferences.

**Acceptance Criteria**
- Critical status is legible at a glance and not conveyed by color alone.

---

### 8.3 Documentation + QA Checklist

**Parallelizable:** yes

**Implementation**
- Add `docs/CONTEST-MODE-USER-GUIDE.md` (hotkeys, run/s&p, exports, bridge setup).
- Add `docs/CONTEST-MODE-QA.md` with manual test scenarios (CQWW/SS/FD flows, dupes, mults, exports, bridge offline/online).

**Acceptance Criteria**
- A new operator can start a session, log QSOs, export Cabrillo, and optionally enable the bridge using only docs.

