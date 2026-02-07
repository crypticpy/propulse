# Propulse Feature Tracker

> Master reference of all planned features, their delivery status, and remaining gaps.
> Generated 2026-02-05 from cross-referencing all PRDs/plans against CHANGELOG and codebase.

---

## Summary

| Source Document                    | Delivered | Partial | Not Started | Deferred | Total   |
| ---------------------------------- | --------- | ------- | ----------- | -------- | ------- |
| Implementation Plan (37 features)  | 31        | 4       | 2           | 0        | 37      |
| 2D Map Feature Parity PRD          | 36        | 1       | 5           | 1        | 43      |
| Contest PropSphere Integration PRD | 29        | 5       | 3           | 0        | 37      |
| Mobile Design Plan                 | 12        | 0       | 7           | 0        | 19      |
| UI Review Recommendations          | 4         | 3       | 6           | 0        | 13      |
| QoL PRD (20 items)                 | 13        | 2       | 5           | 0        | 20      |
| PWA Package                        | 0         | 0       | 7           | 0        | 7       |
| **Grand Total**                    | **125**   | **15**  | **35**      | **1**    | **176** |

**Delivery rate: 71% delivered, 9% partial, 20% not started** _(was 62/11/27 before Tier 1 work)_

---

## 1. Implementation Plan (Expert Review — 37 Features)

_Source: `docs/plans/IMPLEMENTATION-PLAN.md`_

### Delivered (30)

| ID    | Feature                          | Notes                                              |
| ----- | -------------------------------- | -------------------------------------------------- |
| C1    | Real-time solar data dashboard   | SolarPulse page with SFI, K-index, A-index, Bz     |
| C2    | Propagation prediction engine    | `calculateBandConditions()` with SFI+Kp model      |
| C3    | Band condition display           | BandConditions component with day/night matrix     |
| C4    | 3D globe visualization           | Three.js globe in PropSphere with terminator       |
| C5    | Spot overlay on globe            | LiveSpotArcs with great-circle arcs                |
| C6    | DX cluster integration           | PSKReporter + RBN + HamQTH APIs                    |
| C7    | Logbook with ADIF import/export  | Full logbook with CRUD, ADIF parsing               |
| C8    | DXCC tracking                    | dxccStore with entity resolution                   |
| C11   | Contest mode                     | Full contest engine: scoring, dupes, Cabrillo, ESM |
| C12   | Voice-assisted logging           | watchAudioService with Whisper integration         |
| C13   | Guest mode / session sharing     | guestStore with share codes                        |
| C14   | Bridge integration (CAT control) | WebSocket bridge for rig sync                      |
| C15   | DX Wizard                        | AI-powered propagation advice page                 |
| C16   | Alert system                     | useWatchAlerts with band/call/DXCC triggers        |
| C17   | Band planner                     | BandPlanner page with "Right Now" card             |
| C19   | QSL manager                      | QSLManager with LoTW/eQSL integration              |
| C20   | 2D flat map                      | Leaflet-based FlatMap with all overlays            |
| C21   | Solar cycle context              | SolarCycleContext with cycle 25 position           |
| C22   | Propagation index                | PropagationIndex composite score                   |
| C23   | Settings system                  | Multi-tab settings with persistence                |
| QoL2  | Dark theme                       | Full dark theme with space palette                 |
| QoL3  | Responsive layout                | Desktop layout with sidebar nav                    |
| QoL4  | Loading states                   | Skeleton loaders and spinners                      |
| QoL6  | Data export                      | ADIF, Cabrillo, CSV exports                        |
| QoL7  | Undo/redo                        | undoStore with history stack                       |
| QoL8  | Search/filter                    | Spot filtering, logbook search                     |
| QoL9  | Accessibility basics             | ARIA labels, keyboard nav on interactive elements  |
| QoL11 | Performance                      | React.memo, virtualized lists, lazy loading        |
| QoL12 | Error boundaries                 | ErrorBoundary components                           |
| QoL13 | IndexedDB persistence            | Zustand persist middleware with IDB                |

### Partial (5)

| ID      | Feature                     | Status                                    | Gap                                                         |
| ------- | --------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| C9      | Noise/propagation model     | Model exists in `calculateBandConditions` | No user-facing settings UI for noise floor parameters       |
| ~~C10~~ | ~~Antenna pattern library~~ | **DONE** (2026-02-06)                     | Wired into `getEnhancedBandConditions()` + Settings picker  |
| C18     | Bearing/distance overlay    | Available via spot clicks                 | No continuous hover-based bearing display                   |
| QoL1    | Keyboard shortcuts          | Alt+1-9 bands, Ctrl+Z undo, ESM keys      | No global shortcut help overlay or customization            |
| QoL5    | Smart notifications         | Alert system with toasts                  | Limited — no browser push notifications, no priority levels |

### Not Started (2)

| ID    | Feature               | Notes                                              |
| ----- | --------------------- | -------------------------------------------------- |
| QoL10 | Confidence intervals  | Propagation predictions show no uncertainty ranges |
| C24   | Multi-station support | Single station only; no station switching          |

---

## 2. 2D Map Feature Parity PRD

_Source: `docs/requirements/2d-map-feature-parity-prd.md`_

### Delivered (36)

Base map, tile layers, terminator overlay, gray line, spot markers, great-circle paths, grid square overlay, DXCC boundaries, zoom controls, layer toggles, spot popups, callsign labels, band-color coding, age-based opacity, frequency display, CQ zone overlay, ITU zone overlay, distance rings, bearing lines, day/night shading, aurora oval, MUF contours, signal strength heat map, propagation paths, solar position indicator, worked-grid highlighting, needed-grid highlighting, legend panel, coordinate display, measurement tool, fullscreen mode, screenshot capture, print layout, bookmark locations, quick-jump presets, map rotation.

### Partial (1)

| Feature            | Status                     | Gap                                        |
| ------------------ | -------------------------- | ------------------------------------------ |
| Multi-select spots | Can click individual spots | No lasso/box selection for bulk operations |

### Not Started (5)

| Feature                      | Priority | Notes                                                 |
| ---------------------------- | -------- | ----------------------------------------------------- |
| Auto-pan to new spots        | Medium   | Map doesn't follow incoming DX spots                  |
| Touch gesture support        | Medium   | Pinch-zoom, two-finger rotate not implemented         |
| WebGL tile rendering         | Low      | Still using Canvas renderer; WebGL would improve perf |
| Award overlay (WAS/WAZ/VUCC) | Medium   | No visual award progress on map                       |
| Offline tile caching         | Low      | Tiles require network; no Service Worker cache        |

### Deferred (1)

| Feature              | Reason                                          |
| -------------------- | ----------------------------------------------- |
| 3D terrain elevation | Scope creep — not needed for ham radio use case |

---

## 3. Contest Mode PropSphere Integration PRD

_Source: `docs/requirements/CONTEST-MODE-PROPSPHERE-INTEGRATION-PRD.md`_

### Delivered (29)

Ops Console with DX/Contest tabs, one-line entry in map context, contest spots panel, contest band map, Run/S&P mode toggle, ESM state machine, real-time scoring, dupe detection in spots, multiplier tagging on spots, band-specific spot filtering, spot click → prefill, band map frequency axis, band map time axis, spot color coding (dupe/mult/new), current frequency indicator, contest HUD pill (Lite Mode), voice entry toggle, Alt+E focus hotkey, session persistence across pages, contest-aware InsightsBar, Cabrillo export from map, ADIF import/export, call history SCP, keyboard hotkeys, QSO table in console, edit last QSO, undo last QSO, bridge frequency sync, bridge mode sync.

### Partial (5)

| Feature                 | Status                      | Gap                                                   |
| ----------------------- | --------------------------- | ----------------------------------------------------- |
| Multi-op support        | Bridge protocol defined     | No multi-op UI or shared logging                      |
| N1MM integration        | Bridge protocol spec exists | No actual N1MM data exchange implemented              |
| Contest timer/schedule  | Session tracks start time   | No visual countdown, break timer, or schedule display |
| Rate meter              | InsightsBar shows spots/min | No dedicated rate sheet (hourly/10-min breakdowns)    |
| Network score broadcast | Guest mode exists           | No dedicated contest score sharing/broadcast          |

### Not Started (3)

| Feature                | Priority | Notes                                                  |
| ---------------------- | -------- | ------------------------------------------------------ |
| Railway/cloud services | Low      | No server-side contest services (was aspirational)     |
| Health indicators      | Medium   | No connection quality, latency, or error rate displays |
| Sync/retry queue       | Medium   | No offline queue for QSOs logged during disconnection  |

---

## 4. Mobile Design Plan

_Source: `docs/requirements/MOBILE-DESIGN-PLAN.md`_

### Delivered (12) — added 2026-02-06

| Feature                  | Notes                                             |
| ------------------------ | ------------------------------------------------- |
| Bottom tab navigation    | BottomTabBar with 5 tabs + ToolsDrawer            |
| Mobile SolarPulse layout | MobileSolarPulse with accordion sections          |
| Mobile PropSphere layout | MobileMap with FlatMapView (no Three.js)          |
| Mobile DX Cluster layout | MobileDXWizard with step wizard flow              |
| Mobile Logbook layout    | MobileLogbook with card-per-QSO view              |
| Mobile Band Planner      | MobileBandPlanner with gradient band cards        |
| Compact header           | MobileHeader (48px) with ConditionsPill           |
| Safe area handling       | `viewport-fit=cover` + `pb-safe` CSS utilities    |
| MobileContestEntry       | Wired into `useIsMobile()` layout switching       |
| ContestLiteHudSheet      | Works within MobileLayout shell                   |
| Touch-friendly buttons   | 44px min touch targets on all mobile nav elements |
| Bottom sheet pattern     | MobileMap slide-up panel, ToolsDrawer overlay     |

### Not Started (7) — remaining

| Feature                 | Priority | Notes                               |
| ----------------------- | -------- | ----------------------------------- |
| Mobile Settings         | Medium   | Tab layout not mobile-friendly      |
| Swipe gestures          | Medium   | No swipe navigation between pages   |
| Pull-to-refresh         | Medium   | No pull-to-refresh on data pages    |
| Mobile-first typography | Medium   | Font sizes not optimized for mobile |
| Mobile onboarding       | Low      | Onboarding tour not mobile-adapted  |
| PWA install prompt      | Low      | No install banner or prompt         |
| Offline indicator       | Low      | No network status banner            |

---

## 5. UI Review Recommendations

_Source: `docs/reviews/UI-REVIEW-2026-02.md`_

### Delivered (4)

| Feature                        | Notes                                                    |
| ------------------------------ | -------------------------------------------------------- |
| Dark space theme               | Consistent void/deep-space palette                       |
| Modular page architecture      | Separate pages for each feature area                     |
| Unified dashboard at `/`       | Home page with metrics, propagation, bands, spots, logs  |
| Mobile-first responsive design | 6 mobile page variants, MobileLayout, lazy-loaded routes |

### Partial (3)

| Feature                  | Status                             | Gap                                                            |
| ------------------------ | ---------------------------------- | -------------------------------------------------------------- |
| Information density      | Dense InsightsBar, metrics cards   | Some pages still sparse (Band Planner before "Right Now" card) |
| Keyboard-first operation | Contest mode fully keyboard-driven | Other pages lack keyboard shortcuts                            |
| Accessibility            | ARIA on interactive elements       | No skip links, no high-contrast mode, no screen reader audit   |

### Not Started (6)

| Feature                        | Priority | Notes                                               |
| ------------------------------ | -------- | --------------------------------------------------- |
| Interactive tooltips/help      | Medium   | No tooltip system for explaining metrics            |
| ATNO badges on spots           | Medium   | All-Time New One indicators not shown on spot lists |
| Customizable dashboard widgets | Medium   | No drag-and-drop widget layout                      |
| Quick-action command palette   | Medium   | No Cmd+K style command palette                      |
| Guided first-run experience    | Low      | Onboarding tour exists but is basic                 |
| Theme customization            | Low      | Single dark theme, no user color preferences        |

---

## 6. QoL PRD (20 Items)

_Source: `.claude/plans/prd-qol-and-pwa-features.md`_

### Delivered (13)

Undo/redo system, ADIF export, Cabrillo export, dark theme, skeleton loaders, spot filtering, logbook search, error boundaries, IndexedDB persistence, React.memo optimization, virtualized lists, lazy route loading, data refresh indicators.

### Partial (2)

| Feature             | Status                           | Gap                                             |
| ------------------- | -------------------------------- | ----------------------------------------------- |
| Keyboard shortcuts  | Contest-specific shortcuts exist | No app-wide shortcut system with help overlay   |
| Smart notifications | Toast system + alert triggers    | No browser push notifications or priority queue |

### Not Started (5)

| Feature                        | Priority | Notes                                         |
| ------------------------------ | -------- | --------------------------------------------- |
| Double-click to center (map)   | Low      | Globe/map doesn't center on double-click      |
| Focus indicators (global)      | Medium   | Custom focus rings only on some elements      |
| Smooth scroll between sections | Low      | No scroll-snap or smooth section navigation   |
| Favorite bands quick-filter    | Medium   | No saved band preferences for quick filtering |
| Recent targets list            | Medium   | No "recently viewed" callsigns/entities list  |

---

## 7. PWA Package

_Source: `.claude/plans/prd-qol-and-pwa-features.md`_

All 7 items are **Not Started** (deferred as a package):

| Feature                | Priority | Notes                                |
| ---------------------- | -------- | ------------------------------------ |
| Service Worker         | Medium   | No offline support                   |
| Web App Manifest       | Medium   | No `manifest.json` for install       |
| Install prompt         | Low      | No A2HS banner                       |
| Offline data caching   | Medium   | No IndexedDB cache for API responses |
| Background sync        | Low      | No background data refresh           |
| Push notifications     | Medium   | No Web Push API integration          |
| App shell architecture | Medium   | No shell caching for instant load    |

---

## Gap Analysis — Priority Recommendations

### Tier 1: High-Impact Gaps ~~(address first)~~ ALL COMPLETE

1. ~~**Unified Dashboard**~~ DONE (2026-02-05) — Home page at `/` with PrimaryMetrics, PropagationIndex, SolarSummary, BandConditions, ClusterPulse, LogStats, Predictions, History cards.

2. ~~**Mobile Responsive Layout**~~ DONE (2026-02-06) — `useIsMobile()` hook, MobileLayout shell with BottomTabBar + MobileHeader, 6 mobile page variants, lazy-loaded routes (main bundle 1.0 MB → 435 KB), Three.js isolated from mobile `/map`.

3. ~~**Data Refresh Indicators**~~ DONE (2026-02-05) — `DataFreshnessIndicator` component on Home, SolarPulse, BandPlanner, DXWizard with "Updated X ago" + refresh button.

4. ~~**Antenna Pattern Integration (C10)**~~ DONE (2026-02-06) — `getAntennaGainForPath()` wired into `getEnhancedBandConditions()` → `predictSignalStrength()`, antenna picker in Settings, gain shown in DXWizard + map overlays.

### Tier 2: Medium-Impact Gaps

5. **App-Wide Keyboard Shortcuts** — Extend contest keyboard system to all pages. Add Cmd+K command palette and shortcut help overlay.

6. **Health/Status Indicators** — Connection quality for bridge, API latency, error rates. Users need confidence the data is current.

7. **ATNO Badges** — Show "All-Time New One" indicators on spot lists and map. High value for DXers chasing new entities.

8. **Award Overlays on Map** — WAS/WAZ/VUCC progress visualization on 2D/3D maps.

9. **Interactive Tooltips** — Help system explaining metrics, abbreviations, and controls for new users.

10. **Sync/Retry Queue** — Offline-resilient logging that queues QSOs during disconnection.

### Tier 3: Nice-to-Have

11. **PWA Package** — Service Worker, manifest, offline support, push notifications. Good for mobile users but requires significant infrastructure.

12. **Touch Gestures** — Pinch-zoom, two-finger rotate on maps.

13. **Auto-Pan to Spots** — Map follows incoming DX spots.

14. **Confidence Intervals (QoL10)** — Show uncertainty ranges on propagation predictions.

15. **Contest Rate Sheet** — Hourly/10-min QSO rate breakdowns.

16. **Theme Customization** — User-selectable color themes beyond dark mode.

---

## Source Documents Index

| Category     | File                                                           | Description                               |
| ------------ | -------------------------------------------------------------- | ----------------------------------------- |
| Requirements | `docs/requirements/2d-map-feature-parity-prd.md`               | 2D map feature parity with 3D globe       |
| Requirements | `docs/requirements/CONTEST-MODE-PROPSPHERE-INTEGRATION-PRD.md` | Contest mode in PropSphere map context    |
| Requirements | `docs/requirements/MOBILE-DESIGN-PLAN.md`                      | Mobile-first UI redesign                  |
| Plans        | `docs/plans/IMPLEMENTATION-PLAN.md`                            | Master 37-feature implementation plan     |
| Plans        | `docs/plans/IMPLEMENTATION-PLAN-PHASE1.md`                     | Phase 1 foundation (Vite + React + Solar) |
| Reviews      | `docs/reviews/UI-REVIEW-2026-02.md`                            | UI review with persona analysis           |
| Reviews      | `docs/reviews/DX-WIZARD-EXPERT-REVIEW.md`                      | Expert review: 23 features + 14 QoL       |
| Reviews      | `docs/reviews/CONTEST-MODE-QA.md`                              | Contest mode QA checklist                 |
| Guides       | `docs/guides/CONTEST-MODE-USER-GUIDE.md`                       | Contest mode user documentation           |
| Guides       | `docs/guides/CONTEST-BRIDGE-PROTOCOL.md`                       | WebSocket bridge protocol spec            |
| Internal     | `.claude/plans/prd-qol-and-pwa-features.md`                    | QoL (20 items) + PWA (7 items) PRD        |
| Internal     | `.claude/plans/deferred-bugs.md`                               | 13 deferred bugs from audit               |
