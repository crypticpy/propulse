# PRD: Contest Mode Integration in PropSphere (ProPulse View)

Status: Draft  
Owner: Product/Engineering  
Audience: Frontend, Map/Visualization, Backend, Infra, QA  

Related docs:
- `docs/CONTEST-MODE-USER-GUIDE.md`
- `docs/CONTEST-MODE-QA.md`
- `docs/CONTEST-BRIDGE-PROTOCOL.md`
- `PRD-CONTEST-FEATURES.md`

---

## 1) Executive Summary

Integrate Contest Mode into the PropSphere visualization experience so operators can contest effectively while staying in the map context. This includes:
- A contest-optimized tools dock within PropSphere that can auto-activate when a contest session is running.
- Unified contest state and UI behavior across all map view types (3D globe, 2D map, and future Esri/Mapbox renderers).
- A voice entry pipeline (push-to-record, transcription, parsing, confirmation) that coexists with manual entry.
- A service-oriented architecture that is deployable in a future Railway/Supabase/Vercel stack without requiring migration now.

This is production-grade, time-sensitive operator software: reliability, focus management, and predictable state persistence are first-class requirements.

---

## 2) Problem Statement

During contests, operators need:
- Immediate, high-confidence logging (“entry is king”).
- Real-time situational awareness (spots, band activity, propagation context).
- Fast switching between full-page contest workflow and map-based workflow without losing focus, drafts, or timers.

Today, Contest Mode lives primarily as a standalone page and does not fully integrate into the PropSphere “ops console” area where DX workflows occur. This creates friction and missed opportunities during time-sensitive contesting.

---

## 3) Goals / Success Criteria

### Operator Outcomes
- Operators can log QSOs from PropSphere with the same speed and reliability as full-page Contest Mode.
- Spot → prefill → log is a single fluid action in S&P, without disrupting RUN flow.
- Switching between PropSphere and full Contest view never loses an in-progress entry draft, voice recording state, or the contest session.
- Contest overlays and indicators update consistently across 3D, 2D, and future map renderers.

### System Outcomes
- Contest state propagation is deterministic and idempotent (no double logs, no state loops, no “lost QSO”).
- Degrades gracefully when optional services (voice transcription, spot ingestion, sync) are unavailable.
- Clear separation of concerns: UI, contest engine, voice pipeline, spot ingestion, sync/real-time.

---

## 4) Non-Goals (Explicitly Out of Scope)

- Multi-operator real-time collaboration (shared log editing across multiple operators) in initial phases.
- Full CAT/rig control (frequency/mode auto-follow) beyond displaying and consuming available inputs.
- Automated QSO logging without operator confirmation for voice parsing.
- Replacing existing contest engine logic; this PRD focuses on integration and orchestration.

---

## 5) Personas & Primary Workflows

### Personas
- **Single-Op RUN**: Prioritizes entry focus, minimal distractions, high-rate logging.
- **Single-Op S&P**: Prioritizes spot filtering, “needed mult” targeting, quick prefill.
- **Portable/Field Operator**: Often constrained screen space; needs LightView and minimal UI but still must log.
- **Power User**: Uses hotkeys heavily; expects consistent behavior across views.

### Primary Workflows
1) Start contest → operate in PropSphere with contest dock active → log QSOs.
2) Start contest → navigate between `/contest` and `/map` frequently → drafts persist.
3) S&P in PropSphere: click spot → entry prefilled → confirm/log → map target updates.
4) Voice entry: push-to-record → transcript → parsed candidates → confirm → log.
5) End contest → export Cabrillo/ADIF → archive session → later review and analytics.

---

## 6) UX / Interaction Requirements

### 6.1 Activation & Auto-Enter Behavior
- When a contest session exists and user navigates to PropSphere, **auto-enter contest pane** in the ops dock.
- Always provide a clear, one-action opt-out to revert to DX tools (“DX pane”).
- Persist the user’s chosen dock mode per session (if they opt out, respect it until changed).

### 6.2 “Entry First” Focus Rules (Hard Requirements)
- The primary entry field must never lose focus unexpectedly due to:
  - map clicks
  - spot list interactions
  - dock expand/collapse
  - route changes (`/contest` ↔ `/map`)
- Provide deterministic “Return focus to entry” hotkey and UI affordance.
- If the user is actively typing, **do not overwrite the draft** via spot click or voice results without explicit confirmation.

### 6.3 Dock Placement & Layout

#### ProView (non-lite)
- PropSphere bottom “DX Operations Console” becomes a generalized **Ops Console** with tabs:
  - `DX` | `Contest`
- In Contest tab, present a stable structure:
  - **Entry Strip (fixed)**: compact scoreboard + one-line entry + voice controls + mode (RUN/S&P).
  - **Work area (split)**: contest-aware spots + contest band map (or band activity panel).

#### LightView (lite mode)
- LightView is intended to strip UI to maximize map.
- However, contesting requires entry access. In LightView:
  - Provide a minimal **Contest HUD** (floating pill/strip) that can expand to a bottom sheet.
  - The HUD always offers: focus entry, start/stop voice, last QSO delta, dupe/new mult indicator.

### 6.4 Full-Page vs Embedded Contest
- Full-page Contest view remains the deep workflow (full panels).
- Embedded Contest in PropSphere is optimized for “map-first contesting” and must:
  - share the same contest session
  - preserve the same entry draft state
  - keep timers consistent

### 6.5 Map Interaction Rules During Contest
- In **S&P**: spot click should (configurable):
  1) set map target to DX station
  2) prefill entry draft (callsign + optionally frequency/band/mode)
  3) optionally focus entry
- In **RUN**: default behavior should avoid prefill on spot click (to prevent accidental draft pollution).

---

## 7) Functional Requirements

### 7.1 Contest Session Lifecycle
- Create/start session from either `/contest` or PropSphere dock.
- Session persists locally by default; supports future remote sync.
- End session explicitly; support “pause” semantics only if clearly defined (no silent pauses).
- Archive ended sessions with immutable timestamps; allow read-only review.

### 7.2 QSO Logging
- Fast one-line entry (keyboard-first).
- Real-time dupe check, new multiplier indicators.
- Undo last, edit last, edit any from table (consistent hotkeys across embedded/full-page).
- Idempotent logging: prevent duplicate submission on route transitions or rapid Enter.

### 7.3 Spots & Band Map Integration
- Contest-aware spots list with status tagging: DUPE / NEW MULT / NEEDED.
- Contest band map for frequency-time clustering (or equivalent) with click-to-select.
- Align spot selection with:
  - map targeting
  - entry prefill
  - optional frequency/band/mode adoption rules

### 7.4 Map Overlays (All View Types)
- Overlay primitives needed:
  - DX target highlight (selected spot/target)
  - “needed mult” markers/arcs
  - recent worked entities (optional, performance-capped)
  - band/mode filtered layers
- Overlay updates propagate instantly when:
  - a QSO is logged/edited/undone
  - run mode changes
  - band/mode changes
  - contest session changes

### 7.5 Voice Entry Mode
- Push-to-record hotkey (global) + UI controls.
- Audio capture from user-selected input.
- Transcription via a service endpoint (no secrets in client).
- Parsing + candidate generation + confirmation UI.
- Operator must confirm before logging; “Edit” routes to one-line draft.
- Fallback when service down: typing remains fully functional; voice shows degraded status.

### 7.6 Cross-View State Persistence
Persist across `/contest` and PropSphere:
- active session
- run mode
- band/mode selection (until CAT exists)
- entry draft text and status (including caret intent)
- voice pipeline state (recording/transcribing + last candidates)
- ops dock state (DX vs Contest, expanded vs collapsed)

---

## 8) Architecture & System Design

### 8.1 Frontend State Layers

**A) Contest Domain State (authoritative)**
- `contestStore`: session + QSOs + scoring + multipliers.
- Must be stable under React concurrent rendering; selectors must return referentially stable snapshots.

**B) Contest UI State (ephemeral but persistent across route changes)**
- `contestUIStore` (recommended): draft text, draft lock state, focused intent, voice state, dock selection.
- Should be resilient to component remounts (kept outside component trees).

**C) Event Propagation**
- Typed event bus (in-process) for low-latency fan-out:
  - `QSO_LOGGED`, `QSO_EDITED`, `SESSION_STARTED`, `SESSION_ENDED`, `VOICE_CANDIDATES_READY`, etc.
- Multi-tab: BroadcastChannel mirroring of events (future-proof).

### 8.2 Map Renderer Abstraction (3D / 2D / Future Esri/Mapbox)

Introduce a renderer adapter contract so contest overlays and interactions remain consistent:

**`IMapRendererAdapter`**
- `setTarget(targetLatLon, metadata)`
- `project(latLon) -> screenPoint` (optional)
- `addOverlayLayer(layerId, layerModel)`
- `updateOverlayLayer(layerId, layerModel)`
- `removeOverlayLayer(layerId)`
- `setInteractionMode(mode)` (e.g., “contest targeting”, “normal”)
- `onMapClick(handler)` and `onHover(handler)` hooks (normalized)

Implementations:
- `R3FGlobeAdapter` (3D globe)
- `Canvas2DAdapter` (flat/azimuthal)
- `MapboxGLAdapter` (future)
- `EsriJSAdapter` (future)

This allows “ContestOverlayEngine” to be renderer-agnostic.

### 8.3 Contest Overlay Engine

A background-ish client engine that:
- subscribes to contest events and spot updates
- computes a minimal overlay model (capped + throttled)
- applies to the active renderer adapter

Performance requirements:
- throttle overlay recompute under high QSO rates
- incremental updates when possible
- cap rendered primitives (e.g., last N worked markers)

### 8.4 Services (Railway-Deployable Structure)

Even if initially client-local, design the interfaces so they can be swapped to hosted services.

#### A) Voice Transcription Service (Dedicated Hosting Recommended)
- Reason: heavy CPU/IO, larger payloads, possible queueing, provider key management.
- Railway service or Vercel function with strict limits (dedicated recommended for reliability).
- API:
  - `POST /api/contest/transcribe` -> `{ transcript, words?, confidence, language? }`

#### B) Spot Ingestion / Aggregation Service (Dedicated Hosting Recommended)
- Reason: long-lived connections, rate-limits, caching; serverless is a poor fit.
- Railway service with Redis cache recommended.
- Provides:
  - normalized spots feed
  - per-band caches
  - health + backoff strategies

#### C) Real-Time Events Gateway (Dedicated Hosting Recommended)
- Reason: websockets/SSE, state fan-out, multi-device sync.
- Railway service (Node) with optional Redis pub/sub.

#### D) Contest Sync Service (Optional in initial phases)
- Reason: multi-device continuity, backup, operational resilience.
- Backed by Supabase Postgres (future) with row-level security.
- Local-first client; background sync when available.

#### E) Background Worker (Recommended once voice/export/analytics grow)
- Jobs:
  - audio transcoding/normalization
  - transcript post-processing
  - scoring recomputation snapshots
  - export generation (Cabrillo/ADIF) for large sessions
- Can run as Railway worker process.

### 8.5 Data Model (Conceptual)

**ContestSession**
- `id`, `contestId`, `startTimeUtc`, `endTimeUtc?`, `categories`, `myExchange`, `runMode`, `cabrilloMeta`
- `state`: `active | ended | archived`

**QSO**
- `id`, `sessionId`, `timestampUtc`, `callsign`, `band`, `mode`, `frequencyKHz?`
- `exchangeSent`, `exchangeReceived`, `serialSent?`, `serialReceived?`
- `isDupe`, `multipliers[]`, `points`, `flags{ edited, uncertain }`

**VoiceClip (optional, policy-driven)**
- `id`, `sessionId`, `createdAtUtc`
- `audioRef` (blob ref / object storage key) OR `ephemeralOnly`
- `transcript`, `confidence`, `parseCandidates[]`

**Event (for sync / real-time)**
- `eventId`, `sessionId`, `type`, `payload`, `timestampUtc`, `sourceDeviceId`
- Used for idempotency and ordering.

### 8.6 Resilience & Fallback Behavior

Service failures must not block contest operation:
- **Voice transcription down**: disable voice UI, keep manual entry; optionally queue audio for later review.
- **Spot ingestion down**: show “stale spots” status; retain last cached; continue map/entry.
- **Sync down**: local-first continues; show “unsynced” indicator; retry with backoff.
- **Real-time gateway down**: local operation continues; multi-device features degrade.

### 8.7 Contest Boundary Overlap Edge Cases

Overlaps can mean:
- multiple contest definitions active at once (operator chooses)
- contest spans midnight/UTC day boundaries
- operator runs multiple sessions back-to-back

Requirements:
- Only one “active session” can be primary for UI at a time.
- Allow switching active session explicitly (with confirmation if draft exists).
- Store all timestamps in UTC; compute contest “days” from contest definition rules.
- If contest schedule windows overlap, UI must clearly indicate which contest/session is active and where logs are going.

---

## 9) Testing & Quality Bar (Global)

Per phase:
- `npm run lint` and `npm run build`
- Manual smoke checklist for:
  - start/stop session
  - PropSphere auto-enter and opt-out
  - draft persistence across route changes
  - undo/edit last
  - spot→prefill rules by run mode
  - voice pipeline (if enabled in that phase)
  - failure modes (service down / offline)

No placeholder code is allowed to ship between phases.

---

## 10) Phased Delivery Plan (Multi-Agent Orchestration)

No timelines. Each phase produces a shippable increment with explicit “Done” boundaries.

### Phase 0 — Foundations (State + Contracts)

**Dependencies:** none  
**Build first:** shared contracts and state boundaries.

**Parallel workstreams (sub-agents):**
- FE Agent: define `contestUIStore` (draft/voice/dock state) + typed event bus.
- Viz Agent: define `IMapRendererAdapter` interface + stub adapters for existing 3D/2D (no rendering yet).
- Backend/Infra Agent: define service interface contracts (transcribe, spots, sync) + deployment-ready structure (no production deploy).

**Done when:**
- Contest UI state persists across route changes without component coupling.
- Event bus exists with typed events and clear ownership.
- Renderer adapter contract exists with implementations compiling for existing renderers (even if no overlays yet).
- No placeholder endpoints; only real, gated interfaces if added.

**Post-phase required sub-agent tasks:**
1) Run code completeness review sub-agent
2) Run principal engineer review sub-agent
3) Run stub/incomplete implementation hunter (zero tolerance)

---

### Phase 1 — PropSphere Contest Dock (Shell + Auto-Enter + Focus Rules)

**Dependencies:** Phase 0  
**Build first:** the docking surface and focus/draft persistence.

**Parallel workstreams (sub-agents):**
- FE Agent: convert DX console to Ops console with `DX | Contest` tabs; auto-enter contest on PropSphere when active.
- UX Agent: define LightView contest HUD/bottom sheet interaction spec and keyboard focus behaviors.
- QA Agent: draft a regression checklist focusing on focus, draft persistence, and navigation transitions.

**Done when:**
- Start contest → navigate to PropSphere → contest pane auto-active (opt-out available).
- One-line draft persists across `/contest` ↔ `/map`, dock expand/collapse, and tab switching.
- Entry focus behavior is deterministic; no unexpected focus loss.
- LightView provides at least a minimal entry access path (HUD or sheet).

**Post-phase required sub-agent tasks:**
1) Run code completeness review sub-agent
2) Run principal engineer review sub-agent
3) Run stub/incomplete implementation hunter (zero tolerance)

---

### Phase 2 — Contest Tools Swap in Ops Console (Spots + Band Map + Prefill Rules)

**Dependencies:** Phase 1  
**Build first:** contest-aware spots/band map and the S&P workflow.

**Parallel workstreams (sub-agents):**
- FE Agent: integrate `ContestSpotsPanel` and `ContestBandMap` into the Ops console.
- Domain Agent: define RUN vs S&P interaction rules and defaults; add toggles where needed.
- Viz Agent: ensure spot selection updates map target without disrupting entry focus.

**Done when:**
- Contest pane shows contest-aware spots and contest band map.
- Click spot in S&P can prefill entry + set map target (configurable); RUN defaults to non-destructive behavior.
- Logging from embedded entry updates all contest panels immediately (scoreboard, mults, table).

**Post-phase required sub-agent tasks:**
1) Run code completeness review sub-agent
2) Run principal engineer review sub-agent
3) Run stub/incomplete implementation hunter (zero tolerance)

---

### Phase 3 — Contest Overlays Across Map Renderers (3D + 2D + Future Adapters)

**Dependencies:** Phase 0–2  
**Build first:** overlay engine and renderer-agnostic behavior.

**Parallel workstreams (sub-agents):**
- Viz Agent: implement overlay primitives for 3D and 2D adapters (target highlight, needed markers/arcs).
- FE Agent: integrate overlay controls/toggles into contest pane and LightView HUD.
- Architecture Agent: ensure Mapbox/Esri adapter contracts compile with clear TODO-free stubs (only if backed by real implementations or excluded from build).

**Done when:**
- Overlays render consistently in current 3D and 2D views.
- Overlay model updates on QSO events and spot selection events.
- Performance budgets met (throttling, caps); no frame-rate collapse when logging rapidly.
- Future Mapbox/Esri adapters are structurally supported without shipping dead placeholder code.

**Post-phase required sub-agent tasks:**
1) Run code completeness review sub-agent
2) Run principal engineer review sub-agent
3) Run stub/incomplete implementation hunter (zero tolerance)

---

### Phase 4 — Voice Entry MVP (Capture → Transcribe → Parse → Confirm)

**Dependencies:** Phase 0–2  
**Build first:** reliable pipeline + confirmation; no auto-log.

**Parallel workstreams (sub-agents):**
- FE Agent: record controls + push-to-talk hotkey + candidate review UI; integrate with one-line draft.
- Backend Agent: implement transcription endpoint with provider abstraction and health status.
- Domain Agent: speech normalization rules (phonetics, digits, RST patterns) and ambiguity thresholds.

**Done when:**
- Operator can start/stop recording with hotkey; sees persistent recording status.
- Transcript produces parse candidates; operator can Accept/Edit/Retry.
- No double-logging; idempotency guard exists.
- If transcription is unavailable, UI degrades cleanly; manual entry unaffected.

**Post-phase required sub-agent tasks:**
1) Run code completeness review sub-agent
2) Run principal engineer review sub-agent
3) Run stub/incomplete implementation hunter (zero tolerance)

---

### Phase 5 — Resilience, Sync, and Background Services (Local-First + Health)

**Dependencies:** Phase 0–4  
**Build first:** reliability and degradations before expansion.

**Parallel workstreams (sub-agents):**
- Backend/Infra Agent: define Railway-deployable services for spots ingestion and (optional) real-time gateway; add health endpoints.
- FE Agent: add service health indicators and graceful fallbacks (stale spots, voice disabled, unsynced state).
- QA Agent: failure-mode testing (offline, service down, throttling).

**Done when:**
- Clear status surfaces for service health; operator never wonders “is it working?”
- Local contest operation continues when services fail; sync retries safely if enabled.
- No data loss in normal failure scenarios; explicit recovery paths exist.

**Post-phase required sub-agent tasks:**
1) Run code completeness review sub-agent
2) Run principal engineer review sub-agent
3) Run stub/incomplete implementation hunter (zero tolerance)

---

### Phase 6 — Lifecycle Completion: Export, Archive, Review

**Dependencies:** Phase 1–5 (depending on sync)  
**Build first:** end-to-end lifecycle integrity.

**Parallel workstreams (sub-agents):**
- FE Agent: unified session history access from PropSphere and Contest pages; archive UX.
- Domain Agent: ensure exports match contest definition and session metadata.
- QA Agent: archival integrity tests (end contest, reload, export, edit-after-end policy).

**Done when:**
- End contest produces a stable archived session with immutable timestamps.
- Exports (Cabrillo/ADIF) are consistent and accessible from both views.
- Historical sessions can be reviewed without contaminating current session state.

**Post-phase required sub-agent tasks:**
1) Run code completeness review sub-agent
2) Run principal engineer review sub-agent
3) Run stub/incomplete implementation hunter (zero tolerance)

---

## 11) Open Questions (Must Resolve Early)

- LightView contesting: pinned entry strip vs bottom sheet vs floating pill—what is the default?
- RUN mode spot behavior: should spot click ever prefill by default, or only via modifier key?
- Voice data policy: store audio clips or discard after transcript? opt-in retention?
- Multi-session UI: how do we surface concurrent/overlapping sessions without operator confusion?
- Mapbox/Esri: is “view type” or “style toggle” the intended integration point?

---

## 12) Appendix: Key UX/State Machines (Reference)

### Entry State Machine (High-Level)
- `Idle` → `TypingDraft` → (`SpotPrefill` | `VoiceRecording`)  
- `VoiceRecording` → `Transcribing` → `CandidateReview` → (`Accepted` → `Logged`) | (`Edit` → `TypingDraft`) | (`Retry` → `VoiceRecording`) | (`Discard` → `Idle`)

### Critical Idempotency Rules
- Each log action carries a client-generated `actionId`.
- Store rejects duplicate `actionId` per session.
- Voice acceptance and Enter submission share the same idempotency path.

