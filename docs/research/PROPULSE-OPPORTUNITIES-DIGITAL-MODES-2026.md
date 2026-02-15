# Propulse Opportunity Analysis: Digital Mode Software Ecosystem

> Based on competitive analysis of GridTracker2, WSJT-X, and Call Router ecosystem | 2026-02-14
> Research inputs: GridTracker2 deep dive, community sentiment analysis (40+ sources), competitive matrix (60+ sources)

---

## Persona Reference

Throughout this document, opportunities are validated against four operator personas:

| Persona                    | Description                                                          | Primary Need                       | Tech Comfort             |
| -------------------------- | -------------------------------------------------------------------- | ---------------------------------- | ------------------------ |
| **Alex (Newcomer)**        | Recently licensed, 20s-30s, expects modern app UX, smartphone-native | Guided setup, "it just works"      | High (apps), Low (radio) |
| **Pat (Daily Operator)**   | Mid-career ham, daily FT8/SSB, tracks DXCC/WAS, uses 3-5 programs    | Unified platform, award tracking   | Medium                   |
| **Sam (Contester)**        | Competitive operator, N1MM power user, multi-band SO2R or multi-op   | Speed, rate optimization, scoring  | High                     |
| **Jordan (Portable/POTA)** | Activator, field operations, needs offline logging + mobile          | Lightweight, offline-first, mobile | Medium                   |

---

## 1. Parity Requirements Checklist

Features Propulse must have to credibly compete with GridTracker2, WSJT-X companion ecosystem, and modern call management tools. Status assessed against current codebase as of v0.14.0.

### Tier 1: Table Stakes (P0 -- Must Have to Launch)

| #   | Feature                         | Propulse Status                                                                                                                                       | Priority | Competitor Reference                  | Impact If Missing                                  |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------- | -------------------------------------------------- |
| 1   | **ADIF Import**                 | **Built** -- `src/lib/adif/import.ts`, validation + auto-correction, format version awareness                                                         | P0       | All loggers                           | Fatal -- users cannot migrate existing logs        |
| 2   | **ADIF Export**                 | **Built** -- `src/lib/adif/export.ts`, activation-aware, spec-compliant 3.1.4                                                                         | P0       | All loggers                           | Fatal -- users cannot extract their data           |
| 3   | **Callsign Lookup**             | **Built** -- QRZ (`src/lib/api/qrz.ts`), CALLOOK (`src/lib/api/callook.ts`), HamQTH (`src/lib/api/hamqth.ts`), auto-fill hook (`useCallsignAutoFill`) | P0       | GridTracker2 (4 services), JTAlert    | High -- callsign pre-fill is expected workflow     |
| 4   | **DX Cluster Spot Integration** | **Built** -- `src/lib/api/dxcluster.ts`, live spot arcs on 3D globe, `DXSpotList` component with filtering                                            | P0       | GridTracker2, DXSummit, HamAlert      | High -- spot data is core to propagation awareness |
| 5   | **Band Activity Visualization** | **Built** -- `BandMap`, `BandActivityPanel`, band condition modals, ML-enhanced panels                                                                | P0       | GridTracker2 (PSK bar chart), HF+     | Medium -- competitors have this; we do too         |
| 6   | **Solar Conditions Dashboard**  | **Built** -- SolarPulse page, CME analysis, Kp/SFI/Bz monitoring, alert engine                                                                        | P0       | GridTracker2 (hamqsl widget), QRV App | Medium -- Propulse already exceeds competitors     |
| 7   | **Grayline Overlay**            | **Built** -- 3D globe grayline, day/night terminator                                                                                                  | P0       | GridTracker2, HamDXMap                | Low -- already built                               |
| 8   | **QSO Logging**                 | **Built** -- Full offline-first system, IndexedDB, 23 UI components, qsoStore (749 lines), field-level conflict resolution                            | P0       | All loggers                           | Fatal -- core feature                              |
| 9   | **Cabrillo Export**             | **Built** -- `src/lib/adif/cabrillo.ts`, `src/lib/export/cabrillo.ts`                                                                                 | P0       | N1MM+, all contest loggers            | High -- required for contest submissions           |

### Tier 2: Competitive Parity (P1 -- Must Have Within 6 Months)

| #   | Feature                           | Propulse Status                                                                                                                                                                                                   | Priority | Competitor Reference                         | Impact If Missing                                                     |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------- | --------------------------------------------------------------------- |
| 10  | **LoTW Upload**                   | **Built** -- `src/lib/sync/lotwSync.ts`, `src/lib/services/lotwService.ts`, `LotwSyncButton` component                                                                                                            | P1       | GridTracker2, Log4OM, all loggers            | High -- LoTW is the primary QSL confirmation system                   |
| 11  | **eQSL Upload**                   | **Built** -- `src/lib/sync/eqslSync.ts`, `useEqslSync` hook                                                                                                                                                       | P1       | GridTracker2, Log4OM                         | Medium -- secondary QSL service                                       |
| 12  | **QRZ Log Upload**                | **Built** -- `src/lib/sync/qrzSync.ts`, `useQrzSync` hook                                                                                                                                                         | P1       | GridTracker2, HRD                            | Medium -- popular among QRZ subscribers                               |
| 13  | **Award Tracking (DXCC)**         | **Built** -- `src/lib/awards/awardEngine.ts`, `DxccGrid` component, `useDxccStatus` hook, `AwardsPage`, `dxccStore`                                                                                               | P1       | GridTracker2 (map overlay), Log4OM, DXKeeper | High -- award chasing drives daily operating                          |
| 14  | **Award Tracking (WAS)**          | **Built** -- `WasMap` component, `src/lib/awards/usStateMap.ts`                                                                                                                                                   | P1       | GridTracker2                                 | Medium -- important for US operators                                  |
| 15  | **Award Tracking (WAZ/CQ Zones)** | **Built** -- `WazGrid` component, tracked in award engine                                                                                                                                                         | P1       | GridTracker2                                 | Medium -- secondary award program                                     |
| 16  | **POTA/SOTA Activation Support**  | **Built** -- `ActivationPanel`, `QuickLogForm`, `ParkSearch`, `useActivation` hook, activation ADIF export                                                                                                        | P1       | GridTracker2 (POTA map icons), HAMRS         | High -- fastest-growing ham activity segment                          |
| 17  | **Contest Logging**               | **Built** -- Full contest system: `contestStore`, scoring engine, multiplier matrix, Cabrillo export, band advisor, rate sheet, dupe checking, contest calendar, QTC support, SCP import, voice keyer integration | P1       | N1MM+ (gold standard)                        | High -- contest ops represent high-engagement segment                 |
| 18  | **PSK Reporter Integration**      | **Built** -- `src/lib/api/pskreporter.ts`, spot visualization on globe, `useLiveSpots`                                                                                                                            | P1       | GridTracker2 (flight paths + heatmap)        | Medium -- PSK Reporter is the canonical "who heard me" tool           |
| 19  | **Audio/Visual Alerts**           | **Built** -- `alertEngine`, `SpotAlertToast`, `AlertRuleBuilder`, `alertService`, contest alert profiles, band opening detector, Es alerts                                                                        | P1       | GridTracker2 (TTS + sounds), JTAlert         | Medium -- alerts keep operators informed without watching screen      |
| 20  | **WSJT-X UDP Relay via Bridge**   | **In Progress** -- `wsjtxStore` with decode types, `WSJTXStatusPanel`, `useWSJTXAutoLog`, bridge protocol supports WSJT-X messages; relay architecture designed but not fully wired                               | P1       | GridTracker2 (core feature), JTAlert         | High -- this is the #1 integration request for digital mode operators |

### Tier 3: Competitive Advantage (P2 -- Differentiators to Build)

| #   | Feature                         | Propulse Status                                                                                                                                                      | Priority | Competitor Reference                   | Impact If Missing                                                              |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| 21  | **Call Roster / Decode View**   | **In Progress** -- `WSJTXStatusPanel` exists, `wsjtxStore` tracks decodes with callsign extraction, but no full filterable Call Roster UI yet                        | P2       | GridTracker2 (killer feature), JTAlert | Medium -- high value for FT8 operators but depends on WSJT-X bridge completion |
| 22  | **Click-to-Call (TX Control)**  | **Not Started** -- Bridge protocol has CAT commands but no WSJT-X TX relay yet                                                                                       | P2       | GridTracker2                           | Medium -- requires WSJT-X integration first                                    |
| 23  | **Push Notifications (Mobile)** | **Partial** -- `NotificationSettings` component exists, PWA update prompt built, alert service architecture in place, but no mobile push via SimplePush/Pushover/FCM | P2       | GridTracker2 (SimplePush, Pushover)    | Medium -- high value for mobile-first users but not blocking                   |
| 24  | **VUCC/Grid Award Tracking**    | **Partial** -- Grid data exists in QSO system, globe visualizes grids, but no dedicated VUCC award tracker with worked/confirmed grid coloring                       | P2       | GridTracker2 (grid coloring on map)    | Low -- VHF/UHF specialist feature                                              |
| 25  | **WPX Award Tracking**          | **Not Started**                                                                                                                                                      | P3       | DXKeeper                               | Low -- niche award program                                                     |

### Parity Summary

| Status          | Count | Percentage |
| --------------- | ----- | ---------- |
| **Built**       | 19    | 76%        |
| **In Progress** | 3     | 12%        |
| **Partial**     | 2     | 8%         |
| **Not Started** | 1     | 4%         |

**Key finding**: Propulse has achieved 76% feature parity with the GridTracker2 + WSJT-X + logging ecosystem. The critical gap is WSJT-X bridge integration (UDP relay, Call Roster, click-to-call), which unlocks the digital mode companion use case that GridTracker2 dominates.

---

## 2. Differentiation Opportunity Briefs

### Opportunity 1: Unified Platform -- Eliminate the 4-App Stack

**Problem**: The typical FT8 operating session requires 4-7 programs running simultaneously: WSJT-X (decode/transmit) + JTAlert (alerts, callsign lookup) + GridTracker (map visualization) + Log4OM/HRD (logging) + Omnirig (CAT broker) + NTP sync. Programs must start in correct order, fight over UDP ports (JTAlert blocks UDP so GridTracker cannot receive), conflict on serial ports, and create duplicate log entries when multiple logging paths are active. Community quotes: "GridTracker uses a fair bit of PC power, which is always at short supply when running 4 slices" (FlexRadio Community).

**Proposed Solution**: Propulse delivers logging + visualization + alerts + equipment management + propagation intelligence in one SPA. The bridge daemon owns hardware (CAT, audio, WSJT-X UDP relay) so no COM port splitting or UDP conflicts occur. WSJT-X remains the decoder (do not replace it), but all companion functionality collapses into Propulse. Internal message bus replaces inter-process UDP. Single database replaces ADIF file chains.

**Expected Impact**:

- _User acquisition_: HIGH -- "make QSO, done" eliminates the #1 complaint across all community sources
- _Retention_: HIGH -- once users have their logs in Propulse with synced settings, switching cost is significant
- _Moat potential_: MEDIUM -- the architecture is hard to replicate (bridge + SPA + cloud sync + ML) but a well-funded competitor could build it

**Persona Validation**:

- **Alex (Newcomer)**: PRIMARY beneficiary -- newcomers are most overwhelmed by multi-app setup. "Entire YouTube channels exist just for how to set up WSJT-X"
- **Pat (Daily Operator)**: HIGH value -- daily operators feel the multi-app pain most frequently
- **Sam (Contester)**: MEDIUM -- contesters already use N1MM which is self-contained; Propulse must match N1MM's speed
- **Jordan (Portable)**: HIGH -- portable operators want minimal software on field laptops/tablets

---

### Opportunity 2: AI-Powered "Best Band Right Now"

**Problem**: Operators currently check solar indices (SFI, Kp, Bz) manually, cross-reference with band condition widgets, scan DX cluster spots, and apply personal experience to decide which band to operate. No tool synthesizes this into an actionable recommendation. Community sentiment: "AI can predict the best communication frequency, time and conditions by analyzing historical data and the current environment" (N1JUR Blog). The demand is high but implementations are "nascent."

**Proposed Solution**: Leverage the collector pipeline (21M spots/day, 11 ML features in `band_hourly_stats`) to train a regression model predicting spot count and average SNR per band/hour/location. Surface as a "Best Band Right Now" card on the dashboard showing ranked band recommendations with predicted SNR, expected DX regions, and confidence levels. Factor in user's shack preset (antenna gains per band from `useActiveStationGain`) to personalize predictions. Expand to push notifications when ML model detects band opening to operator's target region.

**Expected Impact**:

- _User acquisition_: HIGH -- no competitor has this; it is a "show me, I'll switch" feature
- _Retention_: HIGH -- personalized predictions improve over time with more data, creating lock-in
- _Moat potential_: HIGH -- requires spot collector infrastructure, historical data, ML pipeline, and shack presets; 6+ months of data collection before competitors could replicate

**Persona Validation**:

- **Pat (Daily Operator)**: PRIMARY -- daily operators benefit most from "which band should I be on right now"
- **Alex (Newcomer)**: HIGH -- removes need for tribal knowledge about band behavior
- **Jordan (Portable)**: HIGH -- field operators have limited time; knowing the best band before setup saves activation time
- **Sam (Contester)**: MEDIUM -- contesters have their own band switching strategies, but ML-powered band advisor could supplement

---

### Opportunity 3: 3D Globe with Real-Time Overlays

**Problem**: GridTracker2 uses a 2D OpenLayers map -- functional but not visually compelling. HamDXMap has a 3D globe but no logging integration. PSK Reporter shows spots but in a separate web tool. No competitor combines 3D propagation visualization with integrated logging and equipment-aware performance overlays. "GT really visually excels by presenting live maps of band activity" but it is "walled behind WSJT-X's UDP output" (FlexRadio Community).

**Proposed Solution**: Propulse's Three.js Prop Spheres globe already has 12+ overlay layers (grayline, aurora, MUF, spot arcs, satellite tracks, weather, foF2, hmF2, sporadic-E, TEC). Extend with: PSK Reporter spot flight paths (animated great-circle arcs), per-grid coloring by award status (DXCC worked/confirmed, like GT2), user's equipment performance heatmap (predicted SNR overlay based on shack presets), and contest heatmap overlay (`ContestHeatmapOverlay` already exists). The 3D globe is inherently more compelling for marketing/demos and better represents great-circle propagation paths.

**Expected Impact**:

- _User acquisition_: HIGH -- the globe is the most visually distinctive feature; screenshots/videos drive word-of-mouth
- _Retention_: MEDIUM -- visualization alone does not retain; it must be paired with utility
- _Moat potential_: HIGH -- Three.js 3D globe with custom shaders, overlay system, and integration with ML propagation is architecturally unique

**Persona Validation**:

- **Alex (Newcomer)**: HIGH -- visual appeal attracts younger operators; "looks like a real app, not Windows 95"
- **Pat (Daily Operator)**: HIGH -- seeing propagation paths and worked grids on a globe is engaging
- **Sam (Contester)**: MEDIUM -- contesters prefer data density over visual richness; flat band map may be faster
- **Jordan (Portable)**: LOW -- mobile/tablet may not render 3D globe well; flat map fallback needed

---

### Opportunity 4: Smart QSO Suggestions

**Problem**: GridTracker2's Call Roster allows filtering by needed grids/DXCC. JTAlert highlights needed entities with color-coding. But no tool proactively says "Call this station NOW because you need Grid XY12 and conditions are optimal for 3 more minutes." The gap between passive highlighting and active recommendation is significant. Community evidence: "No tool proactively says 'Call this station NOW'" (community sentiment analysis).

**Proposed Solution**: Combine three data sources: (1) operator's award progress (DXCC/WAS/VUCC needs list from `awardEngine`), (2) real-time decodes from WSJT-X via bridge (`wsjtxStore`), (3) ML propagation model predictions with time-decay. When a decode arrives matching a needed entity AND the propagation model predicts the path will remain open for at least N minutes, surface a high-priority "Smart Suggestion" card with: callsign, needed award credit, predicted window remaining, SNR estimate, and one-click "Call Now" action (via WSJT-X TX relay through bridge).

**Expected Impact**:

- _User acquisition_: MEDIUM -- requires WSJT-X integration to be complete first; then becomes a "killer feature"
- _Retention_: HIGH -- personalized suggestions that actually work build strong habit loops
- _Moat potential_: HIGH -- requires award tracking + decode integration + ML predictions + bridge TX control; multi-system integration

**Persona Validation**:

- **Pat (Daily Operator)**: PRIMARY -- award chasers would find this transformative
- **Alex (Newcomer)**: HIGH -- removes the "who should I call and why?" confusion
- **Sam (Contester)**: MEDIUM -- contesters have different priorities (rate over need) but multiplier hunting version applies
- **Jordan (Portable)**: LOW -- portable ops are CQ-mode (calling, not answering)

---

### Opportunity 5: Offline-First + Cloud Sync

**Problem**: The logging ecosystem is bifurcated: desktop apps (Log4OM, DXKeeper, N1MM) are local-only with file-based backup prone to data loss. Web apps (Cloudlog, World Radio League) require internet connectivity. Cloud sync solutions are file-level (Dropbox/OneDrive) causing conflicts. "All too often, we hear of people who have lost their logs in a hard-drive or virus incident." HAMRS has "disturbing number of reports that HAMRS has lost QSOs and complete logs."

**Proposed Solution**: Propulse's IndexedDB-first architecture with field-level conflict resolution is already built (qsoStore, 8 waves, 51 files). When Supabase sync engine is activated, it provides real-time cloud backup with automatic conflict resolution at the field level (not file level). Works fully offline for field/portable operations, syncs when connectivity returns. No server setup required (unlike Cloudlog/Wavelog). No file-level sync conflicts (unlike HRD/ACLog + Dropbox).

**Expected Impact**:

- _User acquisition_: MEDIUM -- cloud sync is expected but not a primary switching trigger
- _Retention_: HIGH -- once logs are in Propulse cloud, switching cost is very high
- _Moat potential_: MEDIUM -- IndexedDB + Supabase is replicable, but field-level conflict resolution is sophisticated

**Persona Validation**:

- **Jordan (Portable)**: PRIMARY -- offline-first is essential for field ops, cloud sync prevents data loss
- **Pat (Daily Operator)**: HIGH -- automatic backup eliminates data loss anxiety
- **Alex (Newcomer)**: HIGH -- "it just syncs" matches smartphone app expectations
- **Sam (Contester)**: MEDIUM -- multi-op sync during contests is valuable but requires real-time performance

---

### Opportunity 6: Bridge Daemon -- Single Hardware Control Point

**Problem**: CAT control conflicts are the #2 community complaint after multi-app complexity. "Serial ports cannot be shared by multiple programs." Workarounds include Omnirig (Windows-only, adds another app), Flrig (requires middleware knowledge), virtual COM splitters (introduces glitches, one user got "the dreaded Windows Blue Screen O' Death"). VarAC + HRD COM port conflicts generate "total frustration."

**Proposed Solution**: The bridge daemon (already built, running on :3173) owns the radio's serial port exclusively. All Propulse features access rig control through internal WebSocket messages. WSJT-X connects to bridge for frequency/mode data. No COM port splitting. No Omnirig. No virtual serial ports. The bridge also handles audio routing and WSJT-X UDP relay, eliminating three separate middleware components.

**Expected Impact**:

- _User acquisition_: HIGH -- for operators who have experienced CAT conflicts, this is an immediate pain relief
- _Retention_: HIGH -- bridge becomes essential infrastructure; removing it means going back to COM port hell
- _Moat potential_: HIGH -- native daemon with radio protocol support, WebSocket API, and WSJT-X relay is significant engineering

**Persona Validation**:

- **Pat (Daily Operator)**: PRIMARY -- daily operators hit COM port conflicts most frequently
- **Sam (Contester)**: HIGH -- SO2R requires reliable multi-radio CAT; bridge could manage multiple rigs
- **Alex (Newcomer)**: HIGH -- eliminates confusing COM port configuration entirely
- **Jordan (Portable)**: MEDIUM -- field setups typically have simpler radio configs

---

### Opportunity 7: Gamification -- Operator Rank & Achievement System

**Problem**: Ham radio software is purely functional. No competitor has attempted to make the operating experience engaging through game design principles. The community is split -- veterans may see gamification as frivolous, but younger operators (the growth demographic) expect it. "Platforms like YouTube, TikTok, and Reddit have played a big role in popularizing ham radio" (W4ZBB PARC). Young operators expect software that "looks and feels like modern apps (Spotify, Discord)."

**Proposed Solution**: Already built -- 7-tier rank system (Novice through Ethereal), `computeRankPoints()` engine, 18 achievement badges with 4 tiers, trading-card equipment aesthetics with holographic effects, card flip, mouse tilt, particle aurora, legendary/ethereal visual effects. Rank badge in header. RankUpCelebration with particle burst animation. Equipment cards have collectible card aesthetics with tier badges.

**Expected Impact**:

- _User acquisition_: MEDIUM -- gamification alone does not drive switching, but it enhances marketing appeal
- _Retention_: HIGH -- rank progression creates daily engagement loops (login streaks, achievement hunting)
- _Moat potential_: HIGH -- completely unique in ham radio software; competitors would need to copy the entire design system

**Persona Validation**:

- **Alex (Newcomer)**: PRIMARY -- younger operators expect progression systems; achievements provide learning goals
- **Pat (Daily Operator)**: MEDIUM -- some will appreciate it, some will dismiss it; must be optional/subtle
- **Sam (Contester)**: LOW -- contesters care about scores, not badges (but contest-specific achievements could work)
- **Jordan (Portable)**: MEDIUM -- activation count achievements align well with POTA goals

---

### Opportunity 8: Modern Web UI

**Problem**: "Many logging programs seem like relics from 1995" (FlexRadio Community). WSJT-X has no dark mode (users hack OS settings). WSJT-X Improved fork exists specifically to fix UI issues. MultiPSK is "a cluttered mix of poorly chosen colored buttons." Logger32, Swisslog, N1MM all described as "dated interface." The entire ecosystem suffers from Win32/Qt/WinForms aesthetics.

**Proposed Solution**: Already built -- React 18 + TypeScript 5.7 + Tailwind 3 with space-themed dark aesthetic (plasma-orange, signal-green, void-black), responsive design, proper HiDPI handling, progressive disclosure via collapsible panels and command palette. No Electron overhead, no desktop installation required.

**Expected Impact**:

- _User acquisition_: HIGH -- screenshots and demos create immediate "I want to use that" reaction
- _Retention_: MEDIUM -- UI alone does not retain; functionality must match
- _Moat potential_: MEDIUM -- a determined competitor could build a modern UI, but Propulse's design system (500+ files, custom components) represents significant investment

**Persona Validation**:

- **Alex (Newcomer)**: PRIMARY -- modern UI is table stakes for younger demographic
- **Pat (Daily Operator)**: HIGH -- dark mode, readable fonts, and clean layout reduce eye strain during long sessions
- **Sam (Contester)**: MEDIUM -- data density matters more than aesthetics, but modern UI can be data-dense
- **Jordan (Portable)**: HIGH -- responsive design works on tablets in the field

---

### Opportunity 9: Mobile-First Responsive Design

**Problem**: No digital mode companion has responsive mobile design. GridTracker2 is Electron desktop-only. WSJT-X requires a monitor. N1MM, Log4OM, DXKeeper are all Windows desktop. Mobile logging apps (HAMRS, QSOMate, Ham2K PoLo) exist but have no propagation, visualization, or digital mode integration. QRV App (iOS only) has conditions but no logging. Mac users resort to "remote connection to a Windows 10 machine."

**Proposed Solution**: Already built -- responsive SPA with `MobileSolarPulse`, `MobileLogbook`, `MobileHome`, `MobileDXWizard`, `MobileContestEntry`, bottom tab bar navigation. PWA capability with `PWAUpdatePrompt`. Works on any device with a browser. Bridge daemon handles hardware on the shack PC; mobile device is the display/control surface.

**Expected Impact**:

- _User acquisition_: HIGH -- mobile monitoring (check propagation on phone, get alerts) is a unique value proposition
- _Retention_: HIGH -- mobile notifications and quick-check patterns build daily habits
- _Moat potential_: MEDIUM -- responsive web is achievable by competitors, but full mobile operating experience with bridge integration is harder

**Persona Validation**:

- **Jordan (Portable)**: PRIMARY -- tablet/phone as primary logging device in the field
- **Alex (Newcomer)**: HIGH -- smartphone-native users expect mobile access
- **Pat (Daily Operator)**: MEDIUM -- useful for quick checks but most daily operating is at the desk
- **Sam (Contester)**: LOW -- contest operating requires full desktop; mobile useful only for score monitoring

---

### Opportunity 10: WSJT-X Integration Without Replacement

**Problem**: WSJT-X (and its forks JTDX, MSHV) are the gold standard FT8/FT4 decoders. K1JT's scientific approach to weak-signal decoding is unmatched. Attempting to replace WSJT-X would be foolish -- GridTracker2 understood this by positioning as a companion. However, GT2's companion approach introduces UDP port conflicts, startup order dependencies, and requires a second application. WSJT-X 3.0 adds experimental APIs for external tools, signaling openness to integration.

**Proposed Solution**: Bridge daemon relays WSJT-X UDP messages into Propulse's internal event bus. WSJT-X remains the decoder and transmitter. Propulse provides: decode visualization on 3D globe, Call Roster with award-aware filtering, smart QSO suggestions, auto-logging to unified database, and LoTW/QRZ/eQSL upload. The bridge handles UDP relay transparently -- no multicast configuration, no port conflicts, no startup order sensitivity. `wsjtxStore` already has types for decodes, status, and TX control.

**Expected Impact**:

- _User acquisition_: HIGH -- FT8 operators currently using WSJT-X + GridTracker + JTAlert would gain all three functions in one app
- _Retention_: HIGH -- once the WSJT-X + Propulse workflow is established, reverting to the 4-app stack is painful
- _Moat potential_: MEDIUM -- UDP relay is technically straightforward, but the integration depth (auto-log, award tracking, smart suggestions) is the moat

**Persona Validation**:

- **Pat (Daily Operator)**: PRIMARY -- daily FT8 operators would benefit most
- **Alex (Newcomer)**: HIGH -- simplified setup (just WSJT-X + Propulse instead of 4+ apps)
- **Sam (Contester)**: MEDIUM -- contest ops may still prefer N1MM's WSJT-X integration
- **Jordan (Portable)**: MEDIUM -- portable digital mode ops benefit from simpler stack

---

## 3. "Delighter" Feature Concepts

Innovations the community wants but does not yet have. These are features that create "wow" moments and drive word-of-mouth.

### 3.1 Propagation Time Machine

**Concept**: "Show me what 20m looked like at this time yesterday / last week / during the CQ WW contest."

**Description**: Time-slider control on the 3D globe that replays historical spot data from the collector pipeline. User selects a date/time range and watches spot arcs, MUF contours, and band activity animate across the globe. Collector already stores `band_hourly_stats` and `spot_history` (14-day retention, hourly stats indefinite). Historical propagation data module exists (`src/lib/data/historicalPropagation.ts`). Overlay `TimeControl` component already present in the map system.

**Persona(s) Delighted**: Pat (analyze past band openings), Sam (review contest conditions for strategy), Alex (learn propagation patterns visually)

**Technical Feasibility**: **Medium** -- Data pipeline exists; requires time-indexed spot query API, globe animation system, and UI controls. Main challenge is rendering performance with thousands of historical spots.

**Competitive Moat Potential**: **High** -- Requires historical spot database (collector pipeline), 3D globe renderer, and time-series query infrastructure. No competitor has the data or the visualization to do this.

---

### 3.2 Band Opening Push Notifications

**Concept**: Mobile push alert when ML model detects band opening to operator's target region.

**Description**: User configures target regions (e.g., "Alert me when 20m opens to JA" or "Notify when 6m sporadic-E detected"). ML model monitors real-time collector data and fires push notification via FCM/Pushover when predicted SNR exceeds threshold for operator's location and equipment. Band opening detector already exists (`src/lib/services/bandOpeningDetector.ts`), alert engine architecture is built, just needs mobile push transport.

**Persona(s) Delighted**: Pat (never miss a band opening), Jordan (know which band before setting up portable station), Alex (learn when bands are active)

**Technical Feasibility**: **Easy** -- Alert engine and band opening detector exist. Need: FCM/Pushover integration, user preference storage for target regions, and edge function to evaluate ML model. Sporadic-E alert service (`esAlertService.ts`) already demonstrates the pattern.

**Competitive Moat Potential**: **High** -- Requires ML model + collector pipeline + personalized alert preferences + mobile push infrastructure. GridTracker2 has SimplePush/Pushover but no ML-powered band opening detection.

---

### 3.3 QSO Replay

**Concept**: Replay a past QSO session on the 3D globe with time-lapse animation.

**Description**: Select a date range or contest from the logbook. The globe animates each QSO as an arc firing from operator's location to the contact, with color-coded bands, SNR-based brightness, and a running scoreboard/stats overlay. Time compression (1 hour of operating in 30 seconds). Share as video/GIF for social media. Session summary card at the end with statistics.

**Persona(s) Delighted**: Sam (review contest performance visually), Pat (satisfying review of a great operating session), Alex (share on social media to show friends the hobby)

**Technical Feasibility**: **Medium** -- QSO data with timestamps exists in logStore. Globe animation system supports arcs. Main challenge is smooth time-series playback, video/GIF capture, and performance with hundreds of QSOs.

**Competitive Moat Potential**: **High** -- Requires 3D globe + QSO database + animation engine + sharing infrastructure. Completely unique in ham radio software.

---

### 3.4 Station Performance Heatmap

**Concept**: Overlay your equipment's predicted performance (from shack presets) onto the propagation map.

**Description**: Using shack presets (radio power, antenna gain, feedline loss from `useActiveStationGain`), calculate predicted receive/transmit coverage per band. Overlay as a colored heatmap on the 3D globe showing: green (strong signal likely), yellow (marginal), red (below noise floor). Combine with real-time propagation data to show "where you can actually work right now with YOUR station." Compare multiple presets side-by-side with WhatIfSimulator.

**Persona(s) Delighted**: Pat (understand station limitations visually), Alex (learn what different equipment enables), Jordan (evaluate portable antenna performance before an activation)

**Technical Feasibility**: **Medium** -- Shack presets and station performance analysis are built. Need: link prediction model (ITURHFProp or equivalent), shader-based heatmap rendering on globe, and preset-to-prediction pipeline.

**Competitive Moat Potential**: **High** -- Requires shack management system + propagation model + 3D visualization. No competitor manages equipment and propagation together.

---

### 3.5 Contest Copilot

**Concept**: AI-suggested band changes, multiplier hunting, rate optimization during live contests.

**Description**: During active contest, analyze: current rate, available multipliers per band (`NeededMultsPanel` exists), propagation predictions, contest time remaining, and historical contest patterns. Suggest: "Switch to 15m now -- 3 new multipliers spotted, propagation will fade in 45 minutes" or "Stay on 20m -- your rate is 120/hr, above your target." Contest band advisor (`bandAdvisor.ts`) and strategy engine (`strategy.ts`) already exist. Extend with ML-powered temporal predictions.

**Persona(s) Delighted**: Sam (PRIMARY -- competitive advantage from AI-assisted strategy), Pat (learn contest operating techniques from suggestions)

**Technical Feasibility**: **Hard** -- Requires real-time analysis of multiple data streams, contest-specific ML models, and split-second timing. Band advisor and strategy modules exist as foundation. Contest congestion model (`contestCongestionModel.ts`) and propagation intelligence (`contestPropIntel.ts`) are already built.

**Competitive Moat Potential**: **High** -- No contest logger has AI-powered strategy. N1MM has bandmap and spot integration but no predictive suggestions. World Radio League has real-time scoring but no band strategy.

---

### 3.6 Social Shack Sharing

**Concept**: Public shack profiles with equipment photos, performance stats, and leaderboards.

**Description**: Operators publish their shack setup as a shareable profile page. Equipment cards with photos (image system already built with IndexedDB storage), performance benchmarks, signal path diagrams, and operating statistics. Leaderboard comparing stations by: total QSOs, DXCC count, best DX distance, equipment diversity. Social proof for equipment purchase decisions. Public profile route already exists (`/profile/:callsign`).

**Persona(s) Delighted**: Alex (share shack on social media, compare with others), Pat (pride in station, benchmark against peers), Jordan (showcase portable setup creativity)

**Technical Feasibility**: **Easy** -- Profile system (v7), shack management, equipment cards with photos, and public profile routing all exist. Need: Supabase-backed public profiles, leaderboard queries, and social sharing OG cards (canvas card renderer already built).

**Competitive Moat Potential**: **Medium** -- Any app could build profiles, but Propulse's equipment management depth (34 antenna types, 15 feedline types, signal path builder, performance analysis) makes the shack profiles genuinely useful rather than superficial.

---

### 3.7 POTA/SOTA Activation Planner

**Concept**: Propagation-aware park/summit selection based on predicted band conditions.

**Description**: User selects a date, time window, and target band(s). ML model predicts propagation from each candidate park/summit to likely hunter populations. Rank activations by: predicted contact count, drive time, terrain difficulty, and which parks/summits the operator has not yet activated. Factor in equipment presets to show coverage from each location. Integration with POTA/SOTA databases for reference data.

**Persona(s) Delighted**: Jordan (PRIMARY -- transforms activation planning from guesswork to data-driven decisions), Pat (plan occasional activations optimally)

**Technical Feasibility**: **Hard** -- Requires geolocation-aware propagation modeling per candidate location, POTA/SOTA database integration, route planning, and multi-factor ranking. Activation panel and park search exist as foundation.

**Competitive Moat Potential**: **High** -- Requires ML propagation model + geolocation awareness + equipment performance modeling + park/summit databases. No competitor approaches this level of activation planning.

---

### 3.8 Achievement Unlocks for DX

**Concept**: "First VK contact!", "Worked 100 DXCC!", "Gray-line DX Master!" with visual celebrations.

**Description**: Extend the existing 18-achievement system with DX-specific achievements: first contact per continent, DXCC milestones (25/50/100/150/200/250/300/325), band-specific DX (e.g., "Top Band DXer" for 160m DXCC), propagation-related (grayline DX, long-path, sporadic-E), and distance records (farthest QSO). RankUpCelebration-style portal overlay with particle effects, achievement card reveal, and optional social sharing.

**Persona(s) Delighted**: Alex (gamification drives engagement), Pat (milestone recognition for years of operating), Jordan (activation milestone badges)

**Technical Feasibility**: **Easy** -- Achievement engine (`achievementDefinitions.ts`, `useAchievements` hook), rank celebration system, and QSO-to-DXCC tracking all exist. Just need new achievement definitions and QSO-triggered evaluation hooks.

**Competitive Moat Potential**: **Medium** -- Achievement systems are implementable by any competitor, but integration with Propulse's rank system, trading card aesthetics, and 3D globe celebrations creates a cohesive experience that is hard to replicate piecemeal.

---

### 3.9 Equipment Performance Telemetry

**Concept**: Track SWR, power output, band-hours over time with equipment wear indicators.

**Description**: Bridge daemon reads SWR and power meters from CAT-capable radios. Log historical SWR per band, power output trends, and operating hours per equipment item. Display in equipment cards as sparklines and trend indicators. Alert when SWR exceeds threshold (antenna issue), power drops (PA degradation), or feedline loss increases. Equipment "wear" badges on trading cards based on operating hours. FeedlineLossSparkline already exists as a pattern.

**Persona(s) Delighted**: Pat (proactive maintenance awareness), Sam (optimize station performance for contests), Alex (understand equipment behavior)

**Technical Feasibility**: **Medium** -- Bridge daemon has CAT access for SWR/power readings. Equipment management system tracks items. Need: time-series telemetry storage, trending analysis, alert thresholds, and sparkline visualization per equipment item.

**Competitive Moat Potential**: **Medium** -- Requires bridge daemon + equipment management + time-series storage. No competitor tracks equipment telemetry, but the data collection requires bridge hardware access.

---

### 3.10 Elmering Mode

**Concept**: Guided overlay for new operators: "You're hearing a CQ from Japan! Here's what that means for propagation..."

**Description**: Toggle-able contextual overlay that explains what is happening in real-time. When a CQ is decoded: "This is a CQ from JA1ABC in Japan. They are 8,500 km away. The signal is reaching you via 20m long-path propagation through the grayline. Their signal is -12 dB, which is moderate." When band conditions change: "The Kp index just rose to 4. This means geomagnetic disturbance is increasing, which typically degrades signals on bands above 14 MHz." Progressive disclosure -- explanations become less detailed as operator gains experience (tracked via rank system).

**Persona(s) Delighted**: Alex (PRIMARY -- transforms confusion into learning moments), Pat (useful for explaining the hobby to visitors)

**Technical Feasibility**: **Medium** -- Requires contextual awareness engine that monitors decodes, propagation data, and solar conditions, then generates natural-language explanations. Could use template-based approach initially, LLM-assisted later. Rank system provides experience level for progressive disclosure.

**Competitive Moat Potential**: **Medium** -- Educational overlays are implementable by competitors, but integration with Propulse's real-time data streams (decodes, propagation, solar, equipment) creates uniquely rich contextual explanations.

---

## 4. Prioritized Roadmap Recommendations

### Master Priority Matrix

| #   | Feature / Initiative                   | Impact on Acquisition | Technical Complexity (1-5) | Moat Potential | Recommended Phase |
| --- | -------------------------------------- | --------------------- | -------------------------- | -------------- | ----------------- |
| 1   | WSJT-X Bridge UDP Relay (complete)     | High                  | 3                          | Medium         | Phase 1           |
| 2   | Call Roster / Decode View              | High                  | 3                          | Medium         | Phase 1           |
| 3   | Supabase Sync Engine (activate)        | Medium                | 3                          | Medium         | Phase 1           |
| 4   | ClubLog Upload Integration             | Medium                | 2                          | Low            | Phase 1           |
| 5   | VUCC Grid Award Tracker                | Medium                | 2                          | Low            | Phase 1           |
| 6   | WPX Award Tracker                      | Low                   | 2                          | Low            | Phase 1           |
| 7   | "Best Band Right Now" ML Card          | High                  | 4                          | High           | Phase 2           |
| 8   | Band Opening Push Notifications        | High                  | 2                          | High           | Phase 2           |
| 9   | Smart QSO Suggestions                  | High                  | 4                          | High           | Phase 2           |
| 10  | Click-to-Call via WSJT-X               | Medium                | 3                          | Medium         | Phase 2           |
| 11  | PSK Reporter Flight Paths on Globe     | Medium                | 3                          | Medium         | Phase 2           |
| 12  | Award-Colored Grid Overlay on Globe    | Medium                | 3                          | Medium         | Phase 2           |
| 13  | DX Achievement Unlocks                 | Medium                | 1                          | Medium         | Phase 2           |
| 14  | Social Shack Sharing (public profiles) | Medium                | 2                          | Medium         | Phase 2           |
| 15  | Propagation Time Machine               | High                  | 4                          | High           | Phase 3           |
| 16  | Contest Copilot (AI strategy)          | High                  | 5                          | High           | Phase 3           |
| 17  | Station Performance Heatmap            | Medium                | 4                          | High           | Phase 3           |
| 18  | Equipment Performance Telemetry        | Medium                | 3                          | Medium         | Phase 3           |
| 19  | Elmering Mode                          | Medium                | 3                          | Medium         | Phase 3           |
| 20  | QSO Replay (animated globe)            | Medium                | 4                          | High           | Phase 4           |
| 21  | POTA/SOTA Activation Planner           | Medium                | 5                          | High           | Phase 4           |
| 22  | Contest Real-Time Leaderboard          | Medium                | 4                          | Medium         | Phase 4           |

---

### Phase 1: Foundation (Must Ship to Compete)

**Goal**: Close remaining parity gaps. Make Propulse a credible daily driver for FT8 operators.

**Timeline**: Current priority

| Deliverable                      | Dependencies          | Key Files Affected                       | Persona Impact |
| -------------------------------- | --------------------- | ---------------------------------------- | -------------- |
| Complete WSJT-X bridge UDP relay | Bridge daemon running | `bridge/`, `wsjtxStore`, bridge protocol | Pat, Alex      |
| Call Roster UI with filtering    | WSJT-X relay          | New component in `src/components/dx/`    | Pat, Alex      |
| Activate Supabase sync engine    | Supabase Pro plan     | `src/lib/sync/syncEngine.ts`             | All            |
| ClubLog upload integration       | API credentials       | New sync module                          | Pat            |
| VUCC grid award tracker          | Award engine          | `src/lib/awards/`, new component         | Pat            |
| WPX award tracker                | Award engine          | `src/lib/awards/`                        | Pat            |

**Exit criteria**: An FT8 operator can run WSJT-X + Propulse (two apps instead of four+), see decodes on the globe, filter by needed entities, log QSOs, sync to cloud, and upload to LoTW/eQSL/QRZ/ClubLog.

---

### Phase 2: Differentiation (Creates Switching Reasons)

**Goal**: Build features no competitor has. Create "I switched because of X" moments.

**Timeline**: After Phase 1 stabilizes

| Deliverable                         | Dependencies                           | Key Files Affected                                   | Persona Impact    |
| ----------------------------------- | -------------------------------------- | ---------------------------------------------------- | ----------------- |
| "Best Band Right Now" ML card       | Collector data (14+ days), ML training | `collector/`, new edge function, dashboard component | Pat, Alex, Jordan |
| Band Opening Push Notifications     | ML model, FCM/Pushover                 | `alertService`, new push transport                   | Pat, Jordan       |
| Smart QSO Suggestions               | WSJT-X relay, award engine, ML model   | New hook + component                                 | Pat, Alex         |
| Click-to-Call via WSJT-X            | Bridge WSJT-X TX relay                 | Bridge protocol, Call Roster                         | Pat               |
| PSK Reporter flight paths on globe  | PSK Reporter API                       | Globe overlay component                              | Pat, Alex         |
| Award-colored grid overlay on globe | Award engine, globe                    | Globe overlay component                              | Pat               |
| DX Achievement Unlocks (30+ new)    | Achievement engine                     | `achievementDefinitions.ts`                          | Alex, Pat         |
| Social Shack Sharing                | Supabase sync, public profiles         | Profile system, Supabase                             | Alex, Pat         |

**Exit criteria**: Propulse has at least 3 features that no competitor offers. "Best Band Right Now" is live and producing accurate predictions. Smart QSO Suggestions demonstrate measurable value (users report finding needed entities faster).

---

### Phase 3: Moat (Hard for Competitors to Replicate)

**Goal**: Build features that require Propulse's unique combination of data, infrastructure, and design.

**Timeline**: After Phase 2 features prove product-market fit

| Deliverable                     | Dependencies                              | Key Files Affected                  | Persona Impact    |
| ------------------------------- | ----------------------------------------- | ----------------------------------- | ----------------- |
| Propagation Time Machine        | Historical spot data, globe animation     | Time control, spot query API, globe | Pat, Sam, Alex    |
| Contest Copilot                 | Contest engine, ML model, real-time spots | Contest strategy, band advisor      | Sam               |
| Station Performance Heatmap     | Shack presets, propagation model, globe   | Globe shader, preset pipeline       | Pat, Alex, Jordan |
| Equipment Performance Telemetry | Bridge CAT data, equipment system         | Time-series store, equipment cards  | Pat, Sam          |
| Elmering Mode                   | All data streams, rank system             | New overlay system                  | Alex              |

**Exit criteria**: These features require 6+ months of data collection (collector pipeline), mature ML models, and deep integration across Propulse subsystems. A competitor starting from scratch would need 12-18 months to replicate.

---

### Phase 4: Delight (Viral / Word-of-Mouth Drivers)

**Goal**: Build shareable, visually stunning features that drive organic growth.

**Timeline**: Ongoing, interleaved with Phase 3

| Deliverable                   | Dependencies                                | Key Files Affected                      | Persona Impact |
| ----------------------------- | ------------------------------------------- | --------------------------------------- | -------------- |
| QSO Replay (animated globe)   | QSO database, globe animation               | Globe, timeline playback, video capture | Sam, Pat, Alex |
| POTA/SOTA Activation Planner  | ML propagation, POTA/SOTA APIs, geolocation | Activation panel, new planning UI       | Jordan         |
| Contest Real-Time Leaderboard | Contest engine, Supabase real-time          | Contest scoreboard, leaderboard API     | Sam            |

**Exit criteria**: Features generate social media sharing (screenshots, videos). QSO Replay produces shareable content. Activation Planner drives POTA/SOTA community adoption.

---

## 5. Threat Assessment

### 5.1 World Radio League (WRL)

| Attribute             | Assessment                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Threat Level**      | **HIGH**                                                                                                                                                                                                                                                                                                                                                                                             |
| **Timeline**          | Active and growing NOW                                                                                                                                                                                                                                                                                                                                                                               |
| **User Base**         | 200K+ users (via Ham Radio Prep partnership)                                                                                                                                                                                                                                                                                                                                                         |
| **Strengths**         | Modern web UI, real-time contest scoring, mobile app with native cloud sync, POTA support, WRTC 2026 partnership for real-time contesting, strong marketing via Ham Radio Prep                                                                                                                                                                                                                       |
| **Weaknesses**        | No propagation prediction, no 3D visualization, no bridge/CAT integration, no offline-first architecture, no equipment management, no WSJT-X decode integration, cloud-only (no offline operation)                                                                                                                                                                                                   |
| **Strategic Overlap** | Both target "modern, unified platform" positioning. WRL has first-mover advantage in user acquisition via Ham Radio Prep's exam-prep audience                                                                                                                                                                                                                                                        |
| **Defensive Moat**    | Propulse differentiates on: (1) ML propagation intelligence -- WRL shows conditions, Propulse predicts them; (2) 3D globe -- WRL has no visualization; (3) Bridge daemon -- WRL has no hardware integration; (4) Offline-first -- WRL is cloud-dependent; (5) Gamification depth -- WRL has basic features, Propulse has 7-tier system with visual effects; (6) Equipment management -- WRL has none |
| **Action Required**   | Monitor WRL feature releases closely. Accelerate Phase 1 (WSJT-X integration) and Phase 2 (ML predictions) to establish differentiation before WRL expands features. WRL's 200K user base is mostly exam-prep converts who may not be active operators yet -- focus on active operators who need real operating tools                                                                                |

---

### 5.2 WSJT-X 3.0

| Attribute             | Assessment                                                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Threat Level**      | **MEDIUM**                                                                                                                                                                                                                                                                            |
| **Timeline**          | Released September 2025; incremental updates ongoing                                                                                                                                                                                                                                  |
| **Strengths**         | Multithreaded FT8 decoder (MTD) -- most powerful decoding engine, gold standard for weak-signal digital modes, massive installed base, K1JT's scientific credibility, experimental APIs for external AI decoding, POTA/SOTA highlighting in 3.0, high-resolution monitor improvements |
| **Weaknesses**        | Not a logger, not a visualizer, not an alert system. Explicitly a decoder/transmitter. UI improvements are incremental (dark mode via fork merger). No cloud sync. No mobile. No equipment management. No propagation prediction                                                      |
| **Strategic Overlap** | LOW -- WSJT-X is a decoder, Propulse is a platform. They are complementary, not competitive. WSJT-X 3.0's experimental APIs actually benefit Propulse by enabling deeper integration                                                                                                  |
| **Defensive Moat**    | Do not compete with WSJT-X on decoding. Position Propulse as the best WSJT-X companion (replacing GridTracker + JTAlert + external logger). WSJT-X 3.0's APIs are an opportunity, not a threat                                                                                        |
| **Action Required**   | Study WSJT-X 3.0 API documentation. Ensure bridge daemon supports new API endpoints for external decoding. Consider early adoption of WSJT-X 3.0 features that enable deeper integration (AI-assisted decoding pipeline, improved metadata in UDP messages)                           |

---

### 5.3 GridTracker2

| Attribute             | Assessment                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Threat Level**      | **LOW-MEDIUM**                                                                                                                                                                                                                                                                                                                |
| **Timeline**          | Active development, 8+ releases in 2025                                                                                                                                                                                                                                                                                       |
| **User Base**         | 10,598 Chocolatey downloads (total much higher); active Discord/Groups.io community                                                                                                                                                                                                                                           |
| **Strengths**         | Open source (BSD), free, strong POTA integration, Call Roster with click-to-call, 30+ map layers, keyboard-driven workflow, cross-platform (including Raspberry Pi), established WSJT-X companion brand                                                                                                                       |
| **Weaknesses**        | Desktop-only (Electron), no mobile, no cloud sync, no logging (explicitly not a logger), WSJT-X dependency (useless without it), 2D map only, dense/overwhelming UI, Electron resource overhead, development concentrated in 2 developers, OAMS chat removed for performance                                                  |
| **Strategic Overlap** | MEDIUM -- both show spots on maps, both integrate with WSJT-X. But GT2 is a companion tool; Propulse is a platform. GT2 will never add: logging, equipment management, ML prediction, mobile, cloud sync, gamification                                                                                                        |
| **Defensive Moat**    | GridTracker2 cannot evolve into a unified platform -- its explicit philosophy is "NOT a logging program." Propulse's advantages (3D globe, ML, mobile, logging, equipment, gamification) are all outside GT2's stated scope. GT2's moat is the Call Roster click-to-call workflow; Propulse must match this for FT8 operators |
| **Action Required**   | Build the Call Roster equivalent (Phase 1). Once Propulse has WSJT-X integration + Call Roster + award tracking + logging, there is no reason for an operator to run GT2 alongside WSJT-X when Propulse provides all of that plus more                                                                                        |

---

### 5.4 Wavelog

| Attribute             | Assessment                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Threat Level**      | **LOW-MEDIUM**                                                                                                                                                                                                                                                                                                                                                                                        |
| **Timeline**          | Active development; forked from Cloudlog with momentum                                                                                                                                                                                                                                                                                                                                                |
| **User Base**         | Growing; self-hosted community is niche but dedicated                                                                                                                                                                                                                                                                                                                                                 |
| **Strengths**         | Web-based (browser access from any device), open source, modern Cloudlog fork with bug fixes, WSJT-X integration, LoTW/eQSL/QRZ/ClubLog upload, contest support, active development                                                                                                                                                                                                                   |
| **Weaknesses**        | Self-hosted (requires server setup, PHP/MySQL, "cryptic PHP error messages"), no mobile app, no propagation visualization, no equipment management, no offline-first, Docker unsupported officially, server maintenance burden                                                                                                                                                                        |
| **Strategic Overlap** | MEDIUM -- both are web-based loggers with WSJT-X integration and QSL upload. But Wavelog requires self-hosting; Propulse is a managed SPA                                                                                                                                                                                                                                                             |
| **Defensive Moat**    | Propulse eliminates Wavelog's #1 barrier: self-hosting. Propulse's offline-first architecture works without internet; Wavelog requires a running server. Propulse adds: 3D visualization, ML prediction, equipment management, gamification, mobile-responsive design, bridge daemon. The self-hosted audience is small and values control over convenience -- they are not Propulse's primary target |
| **Action Required**   | Offer ADIF import from Wavelog for easy migration. Consider Wavelog API compatibility for operators who want to run both during transition. Not a primary competitive concern                                                                                                                                                                                                                         |

---

### 5.5 QRV App

| Attribute             | Assessment                                                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Threat Level**      | **LOW**                                                                                                                                                                                                                                                  |
| **Timeline**          | Launched 2025, iOS only                                                                                                                                                                                                                                  |
| **User Base**         | Unknown; new entrant, App Store only                                                                                                                                                                                                                     |
| **Strengths**         | Modern mobile-first design, real-time band conditions, live spots and widgets, native iOS performance                                                                                                                                                    |
| **Weaknesses**        | iOS only (excludes Android, desktop), no logging, no operating capability, no WSJT-X integration, no equipment management, no contest support, no visualization beyond basic conditions display                                                          |
| **Strategic Overlap** | LOW -- QRV is a conditions checker, not an operating platform. It is the "weather app" of ham radio -- useful but shallow                                                                                                                                |
| **Defensive Moat**    | Propulse's mobile-responsive SPA works on both iOS and Android. Propulse combines conditions checking with logging, visualization, and operating -- QRV only does conditions. QRV cannot expand into a full platform without fundamental re-architecture |
| **Action Required**   | Monitor for feature expansion. If QRV adds Android + logging, re-evaluate. Currently not a meaningful competitive threat. Propulse's mobile solar dashboard (`MobileSolarPulse`) already matches QRV's core proposition                                  |

---

### Threat Summary Matrix

| Competitor             | Threat Level | Timeline | Primary Threat Vector                                               | Propulse Defensive Moat                                                                          |
| ---------------------- | ------------ | -------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **World Radio League** | HIGH         | NOW      | User acquisition via Ham Radio Prep pipeline, modern UI, mobile app | ML propagation, 3D globe, bridge daemon, offline-first, equipment management, gamification depth |
| **WSJT-X 3.0**         | MEDIUM       | Active   | Could absorb companion features, reducing need for external tools   | Complementary positioning; bridge integration makes Propulse the best WSJT-X companion           |
| **GridTracker2**       | LOW-MEDIUM   | Active   | Established WSJT-X companion brand, strong POTA integration         | Unified platform vs. companion tool; GT2 explicitly will not become a logger or platform         |
| **Wavelog**            | LOW-MEDIUM   | Active   | Web-based logging with growing community, open source credibility   | Managed service vs. self-hosted; Propulse adds visualization, ML, mobile, equipment              |
| **QRV App**            | LOW          | New      | Modern mobile design could attract younger operators                | Cross-platform SPA; Propulse is conditions + logging + operating, not just conditions            |

---

## Key Strategic Conclusions

1. **The window is open but closing.** World Radio League's 200K user base and Ham Radio Prep pipeline represent a real threat. Propulse must ship Phase 1 (WSJT-X integration, sync engine) and establish differentiation (Phase 2: ML predictions, smart suggestions) before WRL expands into propagation and visualization.

2. **Don't replace WSJT-X. Embrace it.** Every successful companion tool (GridTracker, JTAlert) succeeds by enhancing WSJT-X, not replacing it. Propulse's bridge daemon is the architectural advantage that makes this integration seamless.

3. **The ML propagation model is the ultimate moat.** No competitor has a real-time spot collector pipeline (21M spots/day), historical propagation database, or ML training infrastructure. The "Best Band Right Now" feature, once accurate, creates a switching reason no competitor can match within 6 months.

4. **Mobile is underserved and ready.** The only ham radio mobile apps are shallow conditions checkers (QRV) or basic loggers (HAMRS). A mobile-responsive platform with propagation, logging, and alerts is a completely unoccupied market position.

5. **Gamification is a wedge for the growth demographic.** Younger operators entering through YouTube, TikTok, and Ham Radio Prep expect modern app experiences. Propulse's rank system, achievements, and trading card aesthetics speak directly to this audience. No competitor will copy this -- it requires a design system overhaul that legacy desktop apps cannot execute.

6. **76% parity is nearly sufficient.** The remaining gaps (WSJT-X bridge completion, Call Roster, ClubLog upload, VUCC/WPX tracking) are bounded in scope. Phase 1 is a finishing sprint, not a marathon. After Phase 1, Propulse can shift from "catching up" to "pulling ahead."

---

_Document version: 1.0 | Last updated: 2026-02-14 | Based on research from GridTracker2 Competitive Analysis, Community Sentiment Analysis (40+ sources), and Competitive Analysis Matrix (60+ sources)_
