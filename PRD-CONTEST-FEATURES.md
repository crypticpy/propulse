# ProPulse Contest Mode — Features PRD

**Version:** 0.1 (Draft)  
**Date:** 2026-02-03  
**Owner:** ProPulse Product/Engineering  
**Primary Persona:** “Contest Carl” (Extra class, competitive HF contester; single-op + multi-op)  

---

## Executive Summary

ProPulse Contest Mode should support **elite, high-rate contest operating**: minimal friction, high data density, contest-correct validation, and tight integration with spots/propagation/station control. The goal is a web-first contest experience that is viable during major events (CQ WW, ARRL DX, Sweepstakes, Field Day) and interoperable with established contest loggers (N1MM+, DXLog, Wintest, Log4OM).

---

## Product Goals (Measurable)

- **Rate-first UX:** median QSO log cycle under **2 seconds** in Run mode (keyboard-only).
- **Error reduction:** reduce busted-call/exchange risk via real-time checks and an “audit queue” workflow.
- **Strategy support:** surface **running rates, multiplier status, and “next best mult”** decisions without hunting through panels.
- **Single-op + multi-op:** support coordinated multi-op with locks/roles and shared awareness.
- **Interoperability:** export **contest-correct Cabrillo** and support ADIF import/export; provide a path to live sync with major loggers.

---

## Current Implementation Snapshot (Baseline)

As of today, Contest includes:

- Session start/end + local persistence
- QSO entry form (call, exchange, band, mode, RST)
- Dupe detection (call+band+mode)
- Multiplier tracking (basic)
- Score panel (QSO count, points, multipliers, score, basic rate)
- Recent QSOs table

Primary gaps for serious contesting: keyboard-first flow, contest-specific exchange UX, contest-correct dupe rules, per-band/per-mode multiplier awareness, running rates/projection, spot/bandmap workflow, CAT integration, multi-op coordination, and submission-grade exports.

---

## Feature Requirements (Combined + Consolidated)

### 1) One-Line, Keyboard-First Logging (Run/S&P + ESM + Macros)

**Problem**  
Mouse-driven forms and multi-field entry kill rate; elite contesters need predictable focus, minimal keystrokes, and muscle-memory workflows (Run vs S&P).

**Solution**  
- Add a **single-line entry box** with smart parsing (e.g., `K3LR 59 05`, `DL1ABC 599 14`, `JA1XYZ 5NN 25`).
- Add explicit **Run / S&P** modes and an **ESM-style** state machine so Enter performs the “right next action.”
- Support configurable **hotkeys** (focus/wipe/edit-last/undo-last/band/mode changes) and **F1–F12 macros** for CQ/EXCH/TU (initially “simulated” if no audio integration).

**Impact**  
Higher sustained QSO rates, fewer interruptions, and lower fatigue—especially during high-rate runs and late-contest S&P sweeps.

**MVP Acceptance Criteria**  
- Keyboard-only logging flow (no mouse required) with configurable Run/S&P.
- One-line parser can populate callsign + exchange reliably for supported contests.
- Hotkeys for edit/undo last QSO and focus control.

---

### 2) Contest Profiles: Templates + Categories + Real-Time Validation (Per Ruleset)

**Problem**  
Generic “call + RST + exchange” entry doesn’t match real contest rules (Sweepstakes, ARRL DX power/state, Field Day class/section), and the lack of validation increases NILs/busts.

**Solution**  
- Drive the UI from **contest definitions**: required fields, exchange format, serial handling, and rule-aware validation.
- Include category fields: operator/power/mode/band plus **assisted/unassisted** and overlay indicators as defined by each contest.
- Provide loud but configurable warnings for mismatches (e.g., missing/invalid section, zone out of range, wrong mode for contest category).

**Impact**  
Cleaner logs, faster learning curve across contests, and less post-contest scrubbing—directly improving checked score.

**MVP Acceptance Criteria**  
- Contest-selected exchange fields render dynamically and validate (zones, sections, states/provinces).
- Categories captured and stored for export.
- Serial incrementing is automatic where required.

---

### 3) Call Intelligence: SCP + Call History + Similar Calls + Plausibility Checks

**Problem**  
At high rate, busted calls/exchanges are silent score killers; without call intelligence, operators lose time correcting and submit “dirty” logs.

**Solution**  
- Implement **Super Check Partial (SCP)** suggestions on callsign entry.
- Use **call history** (from prior QSOs + optional imported datasets) to prefill likely exchange components.
- Add “**similar calls**” warnings (e.g., phonetic/visual distance), plus plausibility checks (rare prefix sanity, zone range, section validity).
- Add an **“uncertain” tag** and a lightweight **post-QSO audit queue** for quick review/edit.

**Impact**  
Fewer NILs/busts and higher final scores—especially in pileups and during fatigue hours.

**MVP Acceptance Criteria**  
- SCP suggestions appear within 100ms for typical datasets.
- Similar-call warning triggers on close matches.
- Audit queue lists flagged QSOs with one-keystroke edit navigation.

---

### 4) Dupe + Mult Awareness (Contest-Correct Rules, Band/Mode Matrix, Lockouts)

**Problem**  
Hard-coded dupe logic and flattened multiplier displays cause wasted calls and missed opportunities (new mult on one band, dupe on another). Some contests are “once per contest,” others per band/mode.

**Solution**  
- Encode dupe rules per contest: **per contest / per band / per mode** (and combinations).
- Provide dense at-a-glance **band × mode** dupe/mult status on entry (“new mult on 15m,” “dupe on 20m SSB”).
- Offer optional **lockouts**: warn-only vs hard-block when attempting to log a dupe (contest-configurable).

**Impact**  
Cuts wasted QSOs, improves multiplier efficiency, and reduces operator frustration under pressure.

**MVP Acceptance Criteria**  
- Dupe engine supports contest-configured scope (contest/band/mode).
- UI shows dupe/mult status while typing, without extra clicks.

---

### 5) Real-Time Scoring Dashboard (Rates, Pace, Trend, ΔScore)

**Problem**  
Average rate is not actionable. Serious contesters steer by running rate, points/hr, and multiplier pace; without this, strategy becomes guesswork.

**Solution**  
- Persistent scoreboard showing: QSO points, mults (by type), total score, **10m/60m running rate**, points/hr, mults/hr.
- Add **pace/projection** to contest end and a simple **score trend** view.
- Provide per-QSO **Δscore feedback** (e.g., “+3 pts, no mult” vs “+3 pts, new mult +1”).

**Impact**  
Enables disciplined run vs hunt decisions, better band-change timing, and improved final standings.

**MVP Acceptance Criteria**  
- Running rates and projection update live and match session data.
- Score decomposes by points and multipliers (and by type when applicable).

---

### 6) Multiplier Strategy Tools (“Needed Mults” + “Next Best Mult” Queue)

**Problem**  
Contesting is multiplier management under time constraints; without a “needed” view and prioritization, operators leave mults on the table.

**Solution**  
- Per-band/per-mode **multiplier matrix** (where rules require) with worked/needed states.
- A prioritized **“needed mults”** panel that can filter spots and guide S&P.
- A **“next best mult” queue** that prioritizes based on scoring leverage (contest weighting, remaining time, band/run conditions).

**Impact**  
Higher multiplier capture at lower time cost—often the biggest lever for top-tier results.

**MVP Acceptance Criteria**  
- Needed list updates immediately after logging.
- Supports per-band multipliers where contest rules specify.
- Queue prioritization is deterministic and explainable (basic heuristics OK for v1).

---

### 7) CAT / Station Integration (Auto Band/Mode/Frequency, Split, Guardrails)

**Problem**  
Manual band/mode selection and missing frequency create logging errors and slow QSY; serious stations rely on CAT for correctness and speed.

**Solution**  
- Integrate CAT via a **local bridge/agent** (preferred for reliability) or WebSerial where feasible.
- Auto-populate **frequency/band/mode**, detect **split**, and show a large always-visible **band indicator**.
- Add guardrails: out-of-band warnings, wrong segment/mode warnings, and optional confirmation prompts for suspect logs.
- Enable **click-to-tune** from spots/bandmap (only when CAT enabled and with safety toggles).

**Impact**  
Cleaner logs, faster QSY, and a credible path toward advanced workflows (SO2R-ready architecture).

**MVP Acceptance Criteria**  
- Frequency/band/mode auto-fill works for at least one common CAT path (via local bridge).
- Out-of-band warning triggers reliably.

---

### 8) Spots + Bandmap Workflow Built for Rate (Filter, Click-Prep, De-Dupe)

**Problem**  
Raw spot feeds are noisy; without contest-aware filtering and tight “click-to-work” behavior, operators waste time and miss multipliers.

**Solution**  
- Add an integrated spot panel/bandmap with contest-aware filters: band/mode, needed-only, region/prefix, spot age, source selection.
- De-duplicate and age spots; auto-hide “worked” and mark “dupe/new mult/needed mult” inline.
- Clicking a spot should **pre-fill callsign**, show dupe/mult status, and optionally tune via CAT.

**Impact**  
Faster multiplier acquisition without distracting from run-rate focus.

**MVP Acceptance Criteria**  
- Spot selection pre-fills callsign and displays dupe/mult status instantly.
- Needed-only filter uses the live multiplier state.

---

### 9) Propagation-Aware Contesting (Band Readiness + Directionality + Alerts)

**Problem**  
Pretty propagation charts don’t help in-the-moment contest decisions; operators need actionable cues tied to targets and goals.

**Solution**  
- Provide a compact **band readiness strip** per band (Open/Marginal/Closed) with target-region directionality.
- Fuse ProPulse propagation predictions, real-time spot density by region, and solar/geomagnetic indicators into actionable guidance.
- Add alerts like “15m→EU trending up; 3 needed mults spotted in last 10 minutes.”

**Impact**  
Better band-change timing and targeted hunting—boosting both QSO volume and multiplier capture.

**MVP Acceptance Criteria**  
- Readiness strip updates with live conditions + activity signals.
- Alerts can be muted/limited to avoid distraction in Run mode.

---

### 10) Multi-Op Coordination + Interoperability (Roles, Locks, Cabrillo/ADIF, Live Sync)

**Problem**  
Multi-op requires coordination (band locks, in-work awareness, shared notes). Separately, serious contesters need Cabrillo correctness and the option to integrate with existing loggers.

**Solution**  
- Multi-op sessions with roles (Run op, S&P op, Logger, Admin), **band/mode locks**, “in use” indicators, and shared notes/alerts.
- Add interlocks to prevent simultaneous logging of the same callsign without confirmation.
- Provide robust **Cabrillo export** per contest (headers/category mapping/QSO formatting), plus **ADIF import/export**.
- Define a path for a local “ProPulse Bridge” to support optional **live sync** (UDP/file-based) with N1MM+/Log4OM/DXLog.

**Impact**  
Enables disciplined multi-op tactics and makes ProPulse viable for real contest weekends (either as primary logger or as a strategy/dashboard layer).

**MVP Acceptance Criteria**  
- Multi-op shared session prevents obvious collisions (basic locks + in-work markers).
- Cabrillo export validates required header fields and produces contest-correct QSO lines for supported contests.

---

## Open Questions

- What is the initial scope of supported contests for **submission-grade Cabrillo** (start with CQWW/ARRL DX/SS/FD)?
- Preferred CAT integration approach: local bridge (hamlib/rigctld) vs WebSerial vs both?
- Multi-op transport: LAN-only (WebRTC/WebSocket) vs hosted relay?
- How aggressively should ProPulse enforce guardrails (warn vs block) by default?

