# QLog Competitive Intelligence Report

**Date:** 2026-02-14
**Analyst:** Propulse Dev Team
**Subject:** QLog v0.48.0 (foldynl/QLog)
**Comparison Target:** Propulse v0.14.0

---

## 1. QLog Overview

| Attribute       | Detail                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Repository      | [github.com/foldynl/QLog](https://github.com/foldynl/QLog)                                                                       |
| Version         | v0.48.0 (Jan 30, 2026)                                                                                                           |
| License         | GPL-3.0                                                                                                                          |
| Stars / Forks   | 277 / 43                                                                                                                         |
| Stack           | C++ (96%), Qt 5/6, SQLite                                                                                                        |
| Platforms       | Linux (primary), Windows, macOS (experimental)                                                                                   |
| Release Cadence | ~monthly (10 releases in 2025)                                                                                                   |
| Philosophy      | "As simple as possible, but to provide everything the operator expects." NOT contest-focused. No ads, no tracking, no telemetry. |
| Maintainer      | Ladislav Foldyna (OK1MLG) -- single primary maintainer (bus factor risk)                                                         |

---

## 2. Feature Matrix

### Legend

- **QLog**: Full = fully implemented, Partial = basic/limited, None = absent
- **Propulse**: Same scale
- **Priority**: P0 = must-have parity, P1 = high-value, P2 = differentiator, P3 = nice-to-have
- **Persona**: V = Veteran, N = Newbie, E = Elmer, C = Contester, D = DXer, A = Activator (POTA/SOTA)

### 2.1 Core Logging

| Feature                  | Persona | QLog                                                                               | Propulse                                                                                           | Sentiment                     | Priority |
| ------------------------ | ------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------- | -------- |
| QSO entry form           | All     | Full -- tabbed entry with detail/DXCC/station/notes tabs                           | Full -- flat mode-aware panel, operating mode pills, Enter-to-log                                  | QLog praised for completeness | Parity   |
| Duplicate checking       | C, D    | Full -- configurable, gray highlight, contest-aware                                | Full -- real-time non-blocking, amber badge, worked bands pills                                    | Neutral                       | Parity   |
| Search/filter            | All     | Full -- band, mode, country, club, custom filters, AND logic                       | Full -- 9 filter dimensions (search, band, mode, date range, activation, contest, confirmed, dupe) | Neutral                       | Parity   |
| Inline editing           | V       | Full -- CTRL+E or double-click opens edit dialog                                   | Full -- in-place cell editing, Enter saves                                                         | Neutral                       | Parity   |
| QSO table customization  | V       | Full -- draggable columns, layout auto-saved                                       | Partial -- fixed columns, sortable headers                                                         | QLog praised                  | P2       |
| Callsign color coding    | D       | Full -- Red=new DXCC, Green=new band/mode, Blue=new mode, Orange=worked, Gray=dupe | None                                                                                               | QLog highly praised for this  | **P0**   |
| Activity profiles        | V       | Full -- save/recall layout + device + field configurations                         | None                                                                                               | Praised by QLog users         | P2       |
| QSY wiping               | V       | Full -- auto-clears form when frequency changes (configurable)                     | None                                                                                               | Useful workflow feature       | P3       |
| Callsign whisperer       | D       | Full -- shows spotted callsigns at current frequency, auto-fills                   | None                                                                                               | Unique QLog feature           | P1       |
| Manual entry mode        | V       | Full -- isolated time/freq/profile for historical logs                             | None -- form handles this via manual input                                                         | Minor                         | P3       |
| Propagation data display | All     | Full -- solar indices in main window footer, 15-min updates                        | Full -- dedicated solar panels, SFI/K/A/Bz in multiple views                                       | Propulse advantage            | --       |
| Timer/time management    | V, C    | Full -- play/stop, auto-start on RST focus, F8/F9                                  | None -- uses real-time clock                                                                       | Minor                         | P3       |

### 2.2 Contesting

| Feature                   | Persona | QLog                                                  | Propulse                                                                       | Sentiment                                      | Priority           |
| ------------------------- | ------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------ |
| Contest mode              | C       | Partial -- basic mode, auto-activates on contest QSO  | Full -- dedicated operating mode with contest/field day, serial auto-increment | QLog explicitly "not contest-focused"          | **Propulse ahead** |
| Cabrillo export           | C       | None                                                  | Full -- Cabrillo 3.0 with full header categories                               | QLog pain point, users must convert externally | **Propulse ahead** |
| Multiplier tracking       | C       | None                                                  | Partial -- useQsoBadge checks worked mults                                     | --                                             | P2                 |
| Rate display              | C       | None                                                  | None                                                                           | Not expected from either                       | P3                 |
| Built-in contest rules    | C       | None                                                  | None                                                                           | Neither targets serious contesters             | P3                 |
| N+1 / Super Check Partial | C       | None                                                  | None                                                                           | N1MM territory                                 | P3                 |
| Sequence counter          | C       | Partial -- selectable types, can't change mid-contest | Full -- auto-increment, mode-specific                                          | --                                             | Parity             |

### 2.3 DXing & Awards

| Feature                      | Persona | QLog                                                             | Propulse                                     | Sentiment                                 | Priority |
| ---------------------------- | ------- | ---------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------- | -------- |
| DXCC tracking                | D       | Full -- 13 award programs, color-coded progress, click-to-filter | Partial -- DXCC count only, no dashboard/map | QLog's award tracking is a major strength | **P0**   |
| WAS tracking                 | D       | Full                                                             | None                                         | Expected by US operators                  | P1       |
| WAZ tracking                 | D       | Full                                                             | None                                         | Expected by DXers                         | P1       |
| IOTA tracking                | D       | Full -- auto-completion                                          | None                                         | Popular in EU                             | P2       |
| SOTA tracking                | A       | Full -- auto-completion                                          | Partial -- mySig field only                  | Growing demand                            | P1       |
| POTA tracking                | A       | Full -- activator+hunter, pota.app enrichment, dedicated export  | Partial -- mySig field only                  | High demand, QLog praised                 | **P0**   |
| WWFF tracking                | A       | Full -- auto-completion                                          | None                                         | Niche                                     | P3       |
| WPX tracking                 | D       | Full                                                             | None                                         | Popular for DXers                         | P2       |
| Gridsquare tracking          | V, D    | Full -- 2/4/6 char variants                                      | Partial -- count only                        | --                                        | P1       |
| Award progress visualization | D       | Full -- green=confirmed, yellow=worked cells                     | None                                         | QLog praised                              | **P0**   |

### 2.4 QSL Management

| Feature                   | Persona | QLog                                   | Propulse                                      | Sentiment               | Priority |
| ------------------------- | ------- | -------------------------------------- | --------------------------------------------- | ----------------------- | -------- |
| LoTW upload/download      | D       | Full -- requires TQSL, batch dialogs   | None -- fields tracked but no API integration | Core DXer need          | **P0**   |
| eQSL upload/download      | D       | Full -- includes QSL picture downloads | None -- fields tracked only                   | --                      | P1       |
| QRZ.com logbook sync      | D       | Full -- upload + download              | None                                          | --                      | P1       |
| Clublog upload            | D       | Full -- real-time + batch              | None -- status field only                     | --                      | P2       |
| HRDLog.net upload         | D       | Full                                   | None                                          | Minor                   | P3       |
| Cloudlog/Wavelog sync     | V       | Full -- per-profile config             | None                                          | Growing demand          | P2       |
| Paper QSL management      | D       | Full -- double-click status columns    | None                                          | Old-school but expected | P3       |
| Secure credential storage | All     | Full -- qtkeychain (platform-native)   | Partial -- settingsStore (localStorage)       | QLog praised            | P1       |

### 2.5 DX Cluster & Spots

| Feature                       | Persona | QLog                                                                                   | Propulse                                            | Sentiment           | Priority |
| ----------------------------- | ------- | -------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------- | -------- |
| DX cluster connection         | D       | Full -- custom servers, 5 view modes, filtering, spot preservation                     | Partial -- via bridge/collector, spot_history table | QLog strong here    | P1       |
| Band map                      | D, C    | Full -- multi-window, color-coded DXCC status, click-to-tune, spot aging, custom marks | None as standalone widget                           | Highly praised      | **P0**   |
| 15-min intercontinental trend | D       | Full -- works without active DXC connection                                            | None                                                | Unique QLog feature | P2       |
| ON4KST chat                   | V       | Full -- integrated                                                                     | None                                                | Niche               | P3       |
| Spot alerts / rules           | D       | Full -- configurable rules engine with 12+ match criteria                              | None                                                | Praised feature     | P1       |
| POTA auto-enrichment          | A       | Full -- cross-references pota.app, `[+]` marking                                       | None                                                | Praised             | P1       |

### 2.6 Radio Integration

| Feature                  | Persona | QLog                                                          | Propulse                           | Sentiment                               | Priority |
| ------------------------ | ------- | ------------------------------------------------------------- | ---------------------------------- | --------------------------------------- | -------- |
| Hamlib rig control       | V       | Full -- CIV addressing, RTS/DTR, poll interval                | Full -- via bridge daemon (Hamlib) | Pain point for both (rig-specific bugs) | Parity   |
| OmniRig                  | V       | Full -- V1 and V2 (Windows)                                   | None                               | Windows-specific                        | P3       |
| TCI protocol             | V       | Full                                                          | None                               | Expert feature                          | P3       |
| FLRig interface          | V       | Full                                                          | None                               | --                                      | P3       |
| Mouse frequency tuning   | V       | Full -- CTRL+Mouse Wheel                                      | None                               | Nice touch                              | P3       |
| Click-to-tune from spots | D       | Full -- band map, DX cluster, WSJT-X                          | None                               | Praised                                 | P1       |
| Split mode support       | D       | Partial -- known VFO-B bug                                    | None                               | --                                      | P3       |
| Rotator control          | V       | Full -- Hamlib + PSTRotator, compass UI, 4 presets, map click | None                               | --                                      | P2       |

### 2.7 CW & Digital Modes

| Feature             | Persona | QLog                                                                      | Propulse                                  | Sentiment               | Priority |
| ------------------- | ------- | ------------------------------------------------------------------------- | ----------------------------------------- | ----------------------- | -------- |
| WSJT-X integration  | V       | Full -- bidirectional UDP, color-coded status, CQ tracking, click-to-tune | Partial -- bridge can receive WSJT-X QSOs | QLog praised            | P1       |
| CW console/keyer    | V, C    | Full -- WinKey, Morse over CAT, CWDaemon, FLDigi; F1-F7 macros            | None                                      | Praised by CW operators | P2       |
| CW macro automation | C       | Full -- interval repeat, speed sync                                       | None                                      | --                      | P2       |

### 2.8 Maps & Visualization

| Feature                     | Persona | QLog                                               | Propulse                                           | Sentiment              | Priority |
| --------------------------- | ------- | -------------------------------------------------- | -------------------------------------------------- | ---------------------- | -------- |
| World map                   | All     | Full -- OpenStreetMap, online + offline tiles      | Full -- 3D Three.js globe with 12+ overlay layers  | **Propulse far ahead** | --       |
| MUF layer                   | V       | Full -- map overlay                                | Full -- globe overlay                              | Parity                 | --       |
| Aurora layer                | V       | Full                                               | Full                                               | Parity                 | --       |
| Heatmap layer               | V       | Full -- activity density                           | Full -- spot heatmap                               | Parity                 | --       |
| IBP beacons                 | V       | Full -- interactive, click tunes to CW beacon freq | None as standalone                                 | Unique QLog            | P3       |
| Antenna beam pattern        | V       | Full -- radiation pattern overlay                  | None                                               | Unique                 | P3       |
| Gray line display           | V       | Implicit -- day/night terminator                   | Full -- real-time terminator on globe              | Parity                 | --       |
| QSO arc visualization       | V       | None                                               | Full -- arcs from home to worked stations on globe | **Propulse ahead**     | --       |
| Satellite visualization     | V       | None                                               | Full -- ISS, AMSAT overlays                        | **Propulse ahead**     | --       |
| Propagation sphere overlays | V       | None                                               | Full -- 12 new sphere overlays                     | **Propulse far ahead** | --       |

### 2.9 Platform & Architecture

| Feature              | Persona | QLog                                                                          | Propulse                                                        | Sentiment                         | Priority |
| -------------------- | ------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------- | -------- |
| Desktop app          | All     | Full -- native C++/Qt                                                         | N/A -- web app                                                  | QLog users like native feel       | --       |
| Web/mobile access    | N, A    | None -- desktop only                                                          | Full -- responsive PWA, works on any device                     | **Propulse major advantage**      | --       |
| Offline capability   | A       | Full -- SQLite local DB, offline map                                          | Full -- IndexedDB, PWA, service worker caching                  | Parity in capability              | --       |
| Multi-device sync    | V       | None -- single machine, #255 requested                                        | Planned -- conflict resolution UI built, Supabase sync deferred | QLog pain point                   | **P0**   |
| Cloud backup         | All     | None -- manual file backup                                                    | Planned -- Supabase backend configured                          | QLog pain point                   | P1       |
| Cross-platform       | All     | Partial -- Linux+Windows full, macOS experimental (dealbreaker for Mac users) | Full -- any browser, any OS                                     | **Propulse major advantage**      | --       |
| Themes               | N       | Full -- Native, Light, Dark                                                   | Full -- dark theme with custom palette                          | Parity                            | --       |
| Internationalization | N       | Partial -- English, Spanish, community translations                           | None                                                            | Minor for English-speaking market | P3       |

---

## 3. Sentiment Summary

### What Users Love About QLog

- **Modern, clean UI** -- "intuitive for N1MM refugees," consistently praised vs. CQRLog's dated GTK interface
- **Active development** -- Monthly releases, responsive maintainer (hours to respond to issues)
- **FOSS philosophy** -- "No ads, no tracking, no telemetry" resonates strongly
- **Comprehensive award tracking** -- 13 award programs with color-coded progress is a standout feature
- **SQLite simplicity** -- No MySQL setup (unlike CQRLog), portable single-file database
- **Cross-platform** -- Linux + Windows from one codebase (CQRLog is Linux-only)
- **DX cluster integration** -- Multi-view, filtering, spot preservation across reconnects
- **POTA/SOTA enrichment** -- Auto pota.app cross-reference praised by activators
- **Accessibility** -- Recognized by CQ Blind Hams community (Episode 32)
- **Secure credential storage** -- Platform-native keychain integration

### What Frustrates Users About QLog

- **macOS support** -- Experimental, map display bugs, crashes after sleep. Maintainer dropped Mac support (no hardware). **Dealbreaker** for Mac users who switched to Wavelog
- **Rig control reliability** -- Multiple high-engagement issues (#472 K3, #612 FT-DX10, #473 FT857/OmniRig, #679 FLRig lag, #799 split VFO-B). PTT timing "late and unpredictable" on Linux via FLRig
- **Wayland crashes** -- Core dump in Wayland session (#646), forces X11 fallback. Growing concern as Linux desktops migrate
- **QSL upload status bug** -- v0.45.0-0.46.1 incorrectly marked upload status when station profile filters applied. **Data integrity issue** eroded trust
- **No multi-device sync** -- #255 open since 2023. Users want remote log access: "I want to be able to access my journal when I'm away from QTH"
- **No Cabrillo export** -- Serious contesters must convert ADIF externally
- **Learning curve** -- "Not extremely easy to use but after you learn it it's pretty good" (Linux Mint forums)
- **No contest scoring** -- Explicitly not contest-focused, losing potential users to CQRLog/N1MM
- **Layout restoration bugs** -- Qt library bug prevents reliable window layout save/restore on Linux

### What Users Wish QLog Had

| Request                               | Demand | Source                              |
| ------------------------------------- | ------ | ----------------------------------- |
| Multi-device sync / cloud backup      | HIGH   | Discussion #255, multiple users     |
| Better POTA/SOTA activation workflows | HIGH   | #878, SOTA discussion (17 comments) |
| Custom alert sounds                   | MEDIUM | #925                                |
| LoTW station location parameter       | MEDIUM | #921                                |
| REGEXP in QSO filter                  | MEDIUM | #919                                |
| QRZ.com QSL download                  | MEDIUM | #906                                |
| Band dropdown in logbook              | MEDIUM | #905                                |
| Computer migration tool               | MEDIUM | #535                                |
| Auto LoTW/eQSL upload                 | MEDIUM | #658                                |
| Two-rig support                       | MEDIUM | Discussion #2                       |
| US Counties award                     | LOW    | #785                                |
| Snap packaging                        | LOW    | #393 (20 comments)                  |
| Shell script execution on alerts      | LOW    | Discussion                          |

---

## 4. UI/UX Scorecard

| Element                        | QLog Score | Notes                                                                                                                   | Propulse Score | Notes                                                                         |
| ------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------- |
| **First-run experience**       | 6/10       | Functional but requires manual setup (rig, profiles, DX cluster). No wizard.                                            | 7/10           | SetupWizard for shack, SetupGuidePage for bridge. No QSO-specific onboarding. |
| **QSO entry speed**            | 8/10       | Tab-based with auto-fill from rig + cluster + callbook. Callsign whisperer is fast. F8/F9 time shortcuts.               | 7/10           | Flat form, Enter-to-log, auto-fill from rig. No callsign whisperer.           |
| **Visual feedback**            | 9/10       | Callsign color coding (red/green/blue/orange/gray) gives instant DX status. Award cells color-coded. Dupe highlighting. | 5/10           | Amber dupe badge, green CAT indicator. No DXCC status coloring.               |
| **Keyboard efficiency**        | 8/10       | F1-F7 macros, F8/F9 time, Page Up/Down band switch, ALT+arrows, CTRL+E edit                                             | 6/10           | Enter-to-log, Escape clear, Tab navigation. No macro keys.                    |
| **Information density**        | 8/10       | Dockable windows (band map, DX cluster, WSJT-X, rig, rotator, CW) + main log                                            | 6/10           | Two-column logbook layout. Stats popover. Globe is separate page.             |
| **Customization**              | 9/10       | Draggable columns, dockable windows, activity profiles, themes, language                                                | 5/10           | Fixed layout, dark theme, settings page. No column customization.             |
| **Mobile/responsive**          | 1/10       | Desktop-only, 1920x1080 recommended                                                                                     | 8/10           | Full responsive, mobile card view, bottom tab bar                             |
| **Accessibility**              | 6/10       | Qt-native a11y, recognized by blind ham community                                                                       | 7/10           | ARIA roles, keyboard navigation, focus-visible rings throughout               |
| **Error handling**             | 6/10       | Basic error display, some data integrity bugs in QSL sync                                                               | 7/10           | Error states in forms, offline indicator, conflict resolution UI              |
| **Cross-platform consistency** | 5/10       | Varies by OS, macOS broken, Wayland crashes                                                                             | 9/10           | Browser-based, consistent everywhere                                          |

---

## 5. Gap Analysis: Propulse vs QLog

### Where QLog Has Clear Advantage

| Area                                        | Gap Severity | Details                                                                                                                                                |
| ------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Award tracking (DXCC/WAS/WAZ/IOTA etc.)** | CRITICAL     | QLog has 13 award programs with visual progress. Propulse has DXCC count only.                                                                         |
| **QSL service integration**                 | CRITICAL     | QLog uploads/downloads to LoTW, eQSL, QRZ, Clublog, HRDLog, Cloudlog. Propulse tracks fields but has zero API integration.                             |
| **DX cluster / band map**                   | HIGH         | QLog has full DX cluster with 5 views, band map with DXCC color coding, click-to-tune. Propulse has collector data but no interactive band map widget. |
| **Callsign color coding**                   | HIGH         | QLog's instant visual DXCC status (new entity/band/mode) during QSO entry is a workflow accelerator. Propulse has no equivalent.                       |
| **Spot alert rules engine**                 | HIGH         | QLog has configurable alert rules with 12+ match criteria. Propulse has no alert system for spots.                                                     |
| **WSJT-X integration depth**                | MEDIUM       | QLog has bidirectional UDP with color feedback, CQ tracking. Propulse can receive QSOs but no bidirectional control.                                   |
| **CW keyer/console**                        | MEDIUM       | QLog supports 4 keyer protocols with macros. Propulse has none.                                                                                        |
| **Rotator control**                         | MEDIUM       | QLog has compass UI, 4 presets, map-click-to-aim. Propulse has none.                                                                                   |
| **Column customization**                    | LOW          | QLog has draggable columns with auto-save. Propulse has fixed columns.                                                                                 |
| **Activity profiles**                       | LOW          | QLog saves entire layout/device/field configs. Propulse has no equivalent.                                                                             |

### Where Propulse Has Clear Advantage

| Area                           | Advantage Level | Details                                                                                                                                        |
| ------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **3D globe visualization**     | MAJOR           | Three.js globe with 12+ overlay layers (MUF, aurora, D-layer, gray line, satellite, propagation spheres) vs QLog's flat OpenStreetMap.         |
| **Cross-platform / mobile**    | MAJOR           | PWA works on any device, any OS. QLog is desktop-only with broken macOS.                                                                       |
| **Propagation intelligence**   | MAJOR           | Real-time solar panels, collector pipeline (21M spots/day, 11 ML features), location-aware band activity. QLog shows basic solar indices only. |
| **Cabrillo export**            | SIGNIFICANT     | Full Cabrillo 3.0 with headers. QLog has none.                                                                                                 |
| **Contest/Field Day modes**    | SIGNIFICANT     | Dedicated operating modes with auto-increment serials. QLog has basic contest logging.                                                         |
| **Offline-first architecture** | SIGNIFICANT     | IndexedDB + PWA + service worker + bridge static server. QLog is offline by nature (SQLite) but no sync/cloud story.                           |
| **Multi-device sync design**   | SIGNIFICANT     | Conflict resolution UI built, device ID system, field-level merge. QLog has none.                                                              |
| **Modern tech stack**          | MODERATE        | React/TS/Tailwind enables rapid iteration. QLog's C++/Qt has high contribution barrier (3.6M lines, 17 contributors).                          |
| **Shack management**           | MODERATE        | Full equipment system (radios, antennas, feedlines, accessories, signal paths, performance analysis). QLog has basic station info fields.      |
| **Operator rank/gamification** | MODERATE        | 7-tier rank system with visual progression. QLog has nothing comparable.                                                                       |
| **Import compatibility**       | MODERATE        | Logger-specific ADIF profiles (N1MM+, Log4OM detection). QLog has generic import with some compatibility issues reported.                      |

### At Parity

| Area                   | Notes                                             |
| ---------------------- | ------------------------------------------------- |
| Core QSO entry         | Both fully functional, different UX approaches    |
| Duplicate checking     | Both real-time, non-blocking                      |
| Search and filter      | Both comprehensive                                |
| ADIF import/export     | Both ADIF 3.1.4+ compliant                        |
| Callbook lookups       | Both support QRZ.com and HamQTH                   |
| Offline capability     | Both work without internet for core logging       |
| Dark theme             | Both supported                                    |
| Rig control via Hamlib | Both supported (QLog direct, Propulse via bridge) |

---

## 6. Prioritized Roadmap Recommendations

### Tier 0: Must-Have Parity (blocks user adoption)

These features are expected by any serious ham radio logger. Their absence will cause users to dismiss Propulse immediately.

| #   | Feature                                         | Rationale                                                                                                                                                | Effort                                                   |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | **Callsign DXCC status coloring in entry form** | QLog's most praised workflow feature. Instant visual: red=new entity, green=new band/mode, orange=worked. Without this, DXers won't switch.              | Small -- requires DXCC entity lookup against logged QSOs |
| 2   | **Award tracking dashboard (DXCC at minimum)**  | DXCC progress is the #1 motivation for most DXers. Grid map would also be high value. QLog has 13 award programs; start with DXCC, WAS, WAZ, gridsquare. | Medium -- entity/state/zone tables, progress grid UI     |
| 3   | **LoTW integration**                            | Non-negotiable for serious DXers. QLog supports upload+download. At minimum: ADIF upload to LoTW via TQSL, download confirmations.                       | Medium -- TQSL wrapper or direct API                     |
| 4   | **Band map widget**                             | DXers and contesters expect a frequency-domain view of cluster spots, color-coded by DXCC status. QLog's is multi-window with click-to-tune.             | Medium -- new component, integrates with collector data  |
| 5   | **Supabase sync engine (wire it up)**           | Conflict resolution UI is built. The #1 QLog pain point is no multi-device sync. Delivering this makes Propulse categorically better.                    | Medium -- sync push/pull logic, queue integration        |

### Tier 1: High-Value Differentiators (drives switching)

These features would make Propulse compelling enough for QLog users to switch.

| #   | Feature                              | Rationale                                                                                                                                                                                                                                                                                          | Effort       |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 6   | **POTA/SOTA activation workflow**    | Growing segment. QLog has pota.app enrichment but no purpose-built activation UI. Propulse has operating modes but no reference auto-complete or activation-specific dashboard. A dedicated activation view (park picker, reference lookup, running tally, one-tap export) would win this persona. | Medium       |
| 7   | **eQSL integration**                 | Second most popular confirmation service after LoTW. Upload + download with QSL card image display.                                                                                                                                                                                                | Small-Medium |
| 8   | **Spot alert rules engine**          | QLog has 12+ match criteria for DX alerts. Propulse's propagation intelligence + alerts = unique combo. "Alert me when a new DXCC entity appears on 20m from my grid."                                                                                                                             | Medium       |
| 9   | **WSJT-X bidirectional integration** | FT8/FT4 is the most popular digital mode. QLog sends color-coded DXCC status back to WSJT-X. Propulse bridge could do this with the collector data.                                                                                                                                                | Medium       |
| 10  | **QRZ.com logbook sync**             | Many operators use QRZ.com as their public logbook. Upload QSOs to confirm contacts.                                                                                                                                                                                                               | Small        |
| 11  | **Secure credential storage**        | Currently localStorage. Use Web Crypto API or at minimum encrypt service credentials at rest.                                                                                                                                                                                                      | Small        |

### Tier 2: Competitive Differentiators (delight features)

Features that would make Propulse categorically better than QLog.

| #   | Feature                               | Rationale                                                                                                                                                      | Effort                                                    |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 12  | **Propagation-aware DX alerts**       | Combine collector data + location-aware propagation model + alert rules. "This DXCC entity is workable from your QTH right now on 17m." No logger does this.   | Large -- builds on existing collector + propagation model |
| 13  | **Live band map on 3D globe**         | Render DX cluster spots as pins on the globe, color-coded by DXCC status, filterable by band. Click spot to tune rig via bridge. QLog has flat 2D map only.    | Medium                                                    |
| 14  | **Mobile-first POTA activation mode** | Purpose-built mobile UI for field activations: large buttons, GPS park detection, offline-first, quick export. QLog/HAMRS can't match this from a desktop app. | Medium                                                    |
| 15  | **Award progress on globe**           | Render DXCC entities on the 3D globe: green=confirmed, yellow=worked, gray=needed. Interactive -- click entity to see QSOs. No logger has this visualization.  | Medium                                                    |
| 16  | **QSO replay / propagation playback** | Animate logged QSOs on globe over time, showing propagation paths. Unique educational and sharing feature.                                                     | Medium                                                    |
| 17  | **Social QSL cards**                  | Generate shareable QSO confirmation cards (canvas-rendered, already partially built for profile). Share via link, no paper needed.                             | Small                                                     |

### Tier 3: Nice-to-Have (polish)

| #   | Feature                           | Rationale                                                               | Effort     |
| --- | --------------------------------- | ----------------------------------------------------------------------- | ---------- |
| 18  | Column customization in log table | QLog has draggable columns. Nice but not switching trigger.             | Small      |
| 19  | CW keyer integration              | QLog supports 4 protocols. Bridge daemon could relay. Niche audience.   | Large      |
| 20  | Rotator control                   | QLog has compass UI + presets. Bridge daemon could support. Niche.      | Medium     |
| 21  | Activity profiles                 | Save/recall operating configurations. Nice workflow feature.            | Small      |
| 22  | Internationalization              | QLog has English + Spanish. Low priority for English-dominated market.  | Medium     |
| 23  | IBP beacon layer                  | International Beacon Project with click-to-tune. Niche but appreciated. | Small      |
| 24  | Clublog/HRDLog upload             | Additional QSL service integrations.                                    | Small each |

---

## 7. Strategic Takeaways

### QLog's Moat

1. **Mature DXer workflow** -- 13 award programs, callsign color coding, band map, spot alerts, QSL service integrations. This is 5+ years of accumulated DXer-focused development.
2. **Desktop rig integration depth** -- Direct Hamlib, OmniRig, TCI, FLRig, CW keyer, rotator control. Native C++ enables low-latency hardware interaction.
3. **Loyal Linux community** -- CQRLog's stagnation gifted QLog a captive audience.

### QLog's Vulnerabilities

1. **Single maintainer** -- Bus factor of 1. C++ contributor barrier is high.
2. **No cloud/sync story** -- #1 user request, architecturally difficult to retrofit into SQLite.
3. **macOS broken** -- Maintainer dropped support. Growing segment abandoned.
4. **Desktop-only** -- No mobile, no web. Can't serve field activators or remote access.
5. **No propagation intelligence** -- Shows solar indices but no prediction, no path analysis, no ML.
6. **No contest depth** -- Explicitly won't compete with N1MM/DXLog.

### Propulse's Strategic Position

Propulse should NOT try to replicate QLog's desktop DXer workflow feature-for-feature. Instead:

1. **Match the table stakes** (Tier 0) -- DXCC coloring, award tracking, LoTW, band map, sync. Without these, serious operators won't consider Propulse.

2. **Exploit QLog's architectural weaknesses** -- Multi-device sync, mobile/web access, and cloud backup are impossible for QLog to retrofit. Propulse already has the architecture (IndexedDB + conflict resolution + Supabase).

3. **Differentiate on intelligence** -- Propagation-aware alerts, ML-powered band recommendations, and the 3D globe visualization are capabilities no desktop logger can match. This is Propulse's unique moat.

4. **Own the activator segment** -- POTA/SOTA operators need mobile-first, offline-capable, quick-export logging. QLog and HAMRS are both desktop-bound. A purpose-built mobile activation mode would capture this fast-growing segment.

5. **Let N1MM own contests** -- Don't invest heavily in contest features beyond what's built. The contest market is dominated by N1MM (Windows) and has thin margins.

---

## 8. Sources

- [QLog GitHub Repository](https://github.com/foldynl/QLog) -- README, wiki, issues, discussions
- [QLog Releases](https://github.com/foldynl/QLog/releases) -- v0.43.1 through v0.48.0 changelogs
- [hamradio.my QLog Review](https://hamradio.my/2025/03/qlog-a-comprehensive-amateur-radio-logging-application-for-the-modern-ham/)
- [itshamradio.com QLog Review](https://itshamradio.com/qlog-cross-platform-amateur-radio-logging-software/)
- [radio-hobbyist.com Linux Logging Comparison](https://radio-hobbyist.com/best-ham-radio-logging-software-for-linux/)
- [Linux in the Ham Shack Episode #537 -- QLog Deep Dive](https://lhspodcast.info/2024/03/show-notes-537-qlog-deep-dive/)
- [OK1GOD Blog -- Why I Switched to Wavelog](https://melik.cz/posts/wavelog-my-logging-choice/)
- [Linux Mint Forums -- Ham Radio Thread](https://forums.linuxmint.com/viewtopic.php?t=377296)
- [CQ Blind Hams Podcast Episode 32](https://podtail.com/podcast/cq-blind-hams/)
- [eHam.net QLog Product Page](https://www.eham.net/reviews/view-product/16146)
- [QRZ Online QLog Article](https://qrzonline.com/qlog-amateur-radio-logging-application-for-linux-windows-and-mac-os/)
- [Flathub QLog Listing](https://flathub.org/en/apps/io.github.foldynl.QLog)
