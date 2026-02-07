# Propulse Feature Tracker

> Master reference of all planned features, their delivery status, and remaining gaps.
> Generated 2026-02-05 from cross-referencing all PRDs/plans against CHANGELOG and codebase.

---

## Summary

| Source Document                    | Delivered | Partial | Not Started | Deferred | Total   |
| ---------------------------------- | --------- | ------- | ----------- | -------- | ------- |
| Implementation Plan (37 features)  | 35        | 0       | 2           | 0        | 37      |
| 2D Map Feature Parity PRD          | 39        | 1       | 2           | 1        | 43      |
| Contest PropSphere Integration PRD | 33        | 3       | 1           | 0        | 37      |
| Mobile Design Plan                 | 15        | 0       | 4           | 0        | 19      |
| UI Review Recommendations          | 9         | 0       | 1           | 0        | 10      |
| QoL PRD (20 items)                 | 18        | 1       | 1           | 0        | 20      |
| PWA Package                        | 5         | 1       | 1           | 0        | 7       |
| **Grand Total**                    | **154**   | **6**   | **12**      | **1**    | **173** |

**Delivery rate: 89% delivered, 3% partial, 7% not started** _(was 83/6/11 before Tier 4)_

---

## 1. Implementation Plan (Expert Review — 37 Features)

_Source: `docs/plans/IMPLEMENTATION-PLAN.md`_

### Delivered (35)

| ID    | Feature                          | Notes                                                    |
| ----- | -------------------------------- | -------------------------------------------------------- |
| C1    | Real-time solar data dashboard   | SolarPulse page with SFI, K-index, A-index, Bz           |
| C2    | Propagation prediction engine    | `calculateBandConditions()` with SFI+Kp model            |
| C3    | Band condition display           | BandConditions component with day/night matrix           |
| C4    | 3D globe visualization           | Three.js globe in PropSphere with terminator             |
| C5    | Spot overlay on globe            | LiveSpotArcs with great-circle arcs                      |
| C6    | DX cluster integration           | PSKReporter + RBN + HamQTH APIs                          |
| C7    | Logbook with ADIF import/export  | Full logbook with CRUD, ADIF parsing                     |
| C8    | DXCC tracking                    | dxccStore with entity resolution                         |
| C9    | Noise/propagation model          | ITU-R P.372 model + noise environment picker in Settings |
| C11   | Contest mode                     | Full contest engine: scoring, dupes, Cabrillo, ESM       |
| C12   | Voice-assisted logging           | watchAudioService with Whisper integration               |
| C13   | Guest mode / session sharing     | guestStore with share codes                              |
| C14   | Bridge integration (CAT control) | WebSocket bridge for rig sync                            |
| C15   | DX Wizard                        | AI-powered propagation advice page                       |
| C16   | Alert system                     | useWatchAlerts with band/call/DXCC triggers              |
| C17   | Band planner                     | BandPlanner page with "Right Now" card                   |
| C18   | Bearing/distance overlay         | Continuous hover-based bearing/distance from QTH         |
| C19   | QSL manager                      | QSLManager with LoTW/eQSL integration                    |
| C20   | 2D flat map                      | Leaflet-based FlatMap with all overlays                  |
| C21   | Solar cycle context              | SolarCycleContext with cycle 25 position                 |
| C22   | Propagation index                | PropagationIndex composite score                         |
| C23   | Settings system                  | Multi-tab settings with persistence                      |
| QoL2  | Dark theme                       | Full dark theme with space palette                       |
| QoL3  | Responsive layout                | Desktop layout with sidebar nav                          |
| QoL4  | Loading states                   | Skeleton loaders and spinners                            |
| QoL6  | Data export                      | ADIF, Cabrillo, CSV exports                              |
| QoL7  | Undo/redo                        | undoStore with history stack                             |
| QoL8  | Search/filter                    | Spot filtering, logbook search                           |
| QoL9  | Accessibility basics             | ARIA labels, keyboard nav on interactive elements        |
| QoL11 | Performance                      | React.memo, virtualized lists, lazy loading              |
| QoL12 | Error boundaries                 | ErrorBoundary components                                 |
| QoL13 | IndexedDB persistence            | Zustand persist middleware with IDB                      |

### Not Started (2)

| ID   | Feature               | Notes                                     |
| ---- | --------------------- | ----------------------------------------- |
| QoL5 | Smart notifications   | No browser push notifications             |
| C24  | Multi-station support | Single station only; no station switching |

---

## 2. 2D Map Feature Parity PRD

_Source: `docs/requirements/2d-map-feature-parity-prd.md`_

### Delivered (36)

Base map, tile layers, terminator overlay, gray line, spot markers, great-circle paths, grid square overlay, DXCC boundaries, zoom controls, layer toggles, spot popups, callsign labels, band-color coding, age-based opacity, frequency display, CQ zone overlay, ITU zone overlay, distance rings, bearing lines, day/night shading, aurora oval, MUF contours, signal strength heat map, propagation paths, solar position indicator, worked-grid highlighting, needed-grid highlighting, legend panel, coordinate display, measurement tool, fullscreen mode, screenshot capture, print layout, bookmark locations, quick-jump presets, map rotation.

### Partial (1)

| Feature            | Status                     | Gap                                        |
| ------------------ | -------------------------- | ------------------------------------------ |
| Multi-select spots | Can click individual spots | No lasso/box selection for bulk operations |

### Not Started (2)

| Feature              | Priority | Notes                                                 |
| -------------------- | -------- | ----------------------------------------------------- |
| WebGL tile rendering | Low      | Still using Canvas renderer; WebGL would improve perf |
| Offline tile caching | Low      | Tiles require network; no Service Worker cache        |

**Recently Completed**:

- Award overlay (WAS) — 2026-02-06 — drawWASOverlay with state fills in FlatMapView
- Auto-pan to spots — 2026-02-06 — useAutoPanToSpots with Follow toggle in map controls
- Touch gestures — 2026-02-06 — useFlatMapGestures with pinch-zoom + drag-to-pan

### Deferred (1)

| Feature              | Reason                                          |
| -------------------- | ----------------------------------------------- |
| 3D terrain elevation | Scope creep — not needed for ham radio use case |

---

## 3. Contest Mode PropSphere Integration PRD

_Source: `docs/requirements/CONTEST-MODE-PROPSPHERE-INTEGRATION-PRD.md`_

### Delivered (29)

Ops Console with DX/Contest tabs, one-line entry in map context, contest spots panel, contest band map, Run/S&P mode toggle, ESM state machine, real-time scoring, dupe detection in spots, multiplier tagging on spots, band-specific spot filtering, spot click → prefill, band map frequency axis, band map time axis, spot color coding (dupe/mult/new), current frequency indicator, contest HUD pill (Lite Mode), voice entry toggle, Alt+E focus hotkey, session persistence across pages, contest-aware InsightsBar, Cabrillo export from map, ADIF import/export, call history SCP, keyboard hotkeys, QSO table in console, edit last QSO, undo last QSO, bridge frequency sync, bridge mode sync.

### Partial (3)

| Feature                 | Status                      | Gap                                          |
| ----------------------- | --------------------------- | -------------------------------------------- |
| Multi-op support        | Bridge protocol defined     | No multi-op UI or shared logging             |
| N1MM integration        | Bridge protocol spec exists | No actual N1MM data exchange implemented     |
| Network score broadcast | Guest mode exists           | No dedicated contest score sharing/broadcast |

### Not Started (1)

| Feature                | Priority | Notes                                              |
| ---------------------- | -------- | -------------------------------------------------- |
| Railway/cloud services | Low      | No server-side contest services (was aspirational) |

### Recently Completed

| Feature           | Date       | Notes                                                                     |
| ----------------- | ---------- | ------------------------------------------------------------------------- |
| Health indicators | 2026-02-06 | HealthStatusIndicator with per-service health monitoring                  |
| Sync/retry queue  | 2026-02-06 | syncQueueStore + useSyncQueue + SyncStatusIndicator in Header             |
| Contest timer     | 2026-02-07 | CountdownClock + BreakTimeIndicator + off-time tracking with optional end |
| Rate meter        | 2026-02-07 | ContestRateSheet with hourly/10-min toggle + band-by-hour heatmap         |

---

## 4. Mobile Design Plan

_Source: `docs/requirements/MOBILE-DESIGN-PLAN.md`_

### Delivered (15) — updated 2026-02-07

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
| Mobile Settings          | Accordion layout via useIsMobile in SettingsModal |
| Pull-to-refresh          | usePullToRefresh + PullToRefreshIndicator         |
| Offline indicator        | OfflineIndicator banner in MobileLayout           |

### Not Started (4) — remaining

| Feature                 | Priority | Notes                               |
| ----------------------- | -------- | ----------------------------------- |
| Swipe gestures          | Medium   | No swipe navigation between pages   |
| Mobile-first typography | Medium   | Font sizes not optimized for mobile |
| Mobile onboarding       | Low      | Onboarding tour not mobile-adapted  |
| PWA install prompt      | Low      | No install banner or prompt         |

---

## 5. UI Review Recommendations

_Source: `docs/reviews/UI-REVIEW-2026-02.md`_

### Delivered (9) — updated 2026-02-06

| Feature                        | Notes                                                    |
| ------------------------------ | -------------------------------------------------------- |
| Dark space theme               | Consistent void/deep-space palette                       |
| Modular page architecture      | Separate pages for each feature area                     |
| Unified dashboard at `/`       | Home page with metrics, propagation, bands, spots, logs  |
| Mobile-first responsive design | 6 mobile page variants, MobileLayout, lazy-loaded routes |
| ATNO badges on spots           | SpotBadge "atno" type with diamond icon + entity lookup  |
| Quick-action command palette   | Cmd+K CommandPalette with navigation + actions           |
| Health/status indicators       | HealthStatusIndicator with per-service health monitoring |
| Interactive tooltips/help      | InfoTip component + centralized registry (40+ defs)      |
| Theme customization            | Accent color CSS variables, 8 presets in Settings        |

### Not Started (1)

| Feature                        | Priority | Notes                          |
| ------------------------------ | -------- | ------------------------------ |
| Customizable dashboard widgets | Medium   | No drag-and-drop widget layout |

### Recently Completed

| Feature              | Date       | Notes                                                      |
| -------------------- | ---------- | ---------------------------------------------------------- |
| Interactive tooltips | 2026-02-06 | InfoTip component + centralized registry (40+ definitions) |

---

## 6. QoL PRD (20 Items)

_Source: `.claude/plans/prd-qol-and-pwa-features.md`_

### Delivered (18)

Undo/redo system, ADIF export, Cabrillo export, dark theme, skeleton loaders, spot filtering, logbook search, error boundaries, IndexedDB persistence, React.memo optimization, virtualized lists, lazy route loading, data refresh indicators, confidence intervals on predictions, double-click to center (pre-existing), global focus indicators, favorite bands quick-filter, recent targets list.

### Partial (1)

| Feature             | Status                        | Gap                                             |
| ------------------- | ----------------------------- | ----------------------------------------------- |
| Smart notifications | Toast system + alert triggers | No browser push notifications or priority queue |

### Not Started (1)

| Feature                        | Priority | Notes                                       |
| ------------------------------ | -------- | ------------------------------------------- |
| Smooth scroll between sections | Low      | No scroll-snap or smooth section navigation |

---

## 7. PWA Package

_Source: `.claude/plans/prd-qol-and-pwa-features.md`_

### Delivered (5)

| Feature                | Notes                                                       |
| ---------------------- | ----------------------------------------------------------- |
| Service Worker         | vite-plugin-pwa with workbox, 36 precache entries           |
| Web App Manifest       | manifest.webmanifest with app metadata + SVG icon           |
| Offline fallback       | offline.html page shown when SW can't fetch                 |
| App shell architecture | Precached shell with runtime caching for API (NetworkFirst) |
| Update prompt          | PWAUpdatePrompt toast with "Reload" / "Dismiss" buttons     |

### Partial (1)

| Feature              | Status                          | Gap                                   |
| -------------------- | ------------------------------- | ------------------------------------- |
| Offline data caching | SW caches API with NetworkFirst | No explicit IndexedDB API cache layer |

### Not Started (1)

| Feature            | Priority | Notes                       |
| ------------------ | -------- | --------------------------- |
| Push notifications | Medium   | No Web Push API integration |

---

## Gap Analysis — Priority Recommendations

### Tier 1: High-Impact Gaps ~~(address first)~~ ALL COMPLETE

1. ~~**Unified Dashboard**~~ DONE (2026-02-05) — Home page at `/` with PrimaryMetrics, PropagationIndex, SolarSummary, BandConditions, ClusterPulse, LogStats, Predictions, History cards.

2. ~~**Mobile Responsive Layout**~~ DONE (2026-02-06) — `useIsMobile()` hook, MobileLayout shell with BottomTabBar + MobileHeader, 6 mobile page variants, lazy-loaded routes (main bundle 1.0 MB → 435 KB), Three.js isolated from mobile `/map`.

3. ~~**Data Refresh Indicators**~~ DONE (2026-02-05) — `DataFreshnessIndicator` component on Home, SolarPulse, BandPlanner, DXWizard with "Updated X ago" + refresh button.

4. ~~**Antenna Pattern Integration (C10)**~~ DONE (2026-02-06) — `getAntennaGainForPath()` wired into `getEnhancedBandConditions()` → `predictSignalStrength()`, antenna picker in Settings, gain shown in DXWizard + map overlays.

### Tier 2: Medium-Impact Gaps

5. ~~**App-Wide Keyboard Shortcuts**~~ DONE (2026-02-06) — CommandPalette (Cmd+K), useGlobalShortcuts (capture-phase), ShortcutsHelpModal (`?`), context-aware per route.

6. ~~**Health/Status Indicators**~~ DONE (2026-02-06) — useHealthMonitor aggregates TanStack Query cache + bridge state, HealthStatusIndicator dot+dropdown in Header/MobileHeader.

7. ~~**ATNO Badges**~~ DONE (2026-02-06) — SpotBadge "atno" type with diamond icon + pulse, DXCC entity lookup in useDXSpotListState, rendered before other badges.

8. ~~**Award Overlays on Map**~~ DONE (2026-02-06) — useAwardProgress hook (WAS/WAZ/DXCC from logbook), drawWASOverlay with batched canvas fills on FlatMapView, toggle in LabelsPanel.

9. ~~**Interactive Tooltips**~~ DONE (2026-02-06) — Centralized tooltip registry (40+ definitions), InfoTip component with keyboard-accessible ⓘ icons, wired across PrimaryMetrics, BandPlanner, DXWizard, PathAnalysis, SpotDetailPanel, AwardsTracker.

10. ~~**Sync/Retry Queue**~~ DONE (2026-02-06) — syncQueueStore with localStorage persistence, useSyncQueue background processor (10s polling, exponential backoff), SyncStatusIndicator pill+dropdown in Header.

### Tier 3: Nice-to-Have — ALL COMPLETE

11. ~~**PWA Package**~~ DONE (2026-02-06) — vite-plugin-pwa with workbox runtime caching, manifest, SW registration, PWAUpdatePrompt toast, offline.html fallback.

12. ~~**Touch Gestures**~~ DONE (2026-02-06) — useFlatMapGestures hook with PointerEvent state machine for pinch-zoom + drag-to-pan, isGesturing ref wired to click handler to suppress conflicts.

13. ~~**Auto-Pan to Spots**~~ DONE (2026-02-06) — useAutoPanToSpots hook with seen-ID tracking, 8s cooldown, setCenterLocation animation, Follow toggle in map controls.

14. ~~**Confidence Intervals (QoL10)**~~ DONE (2026-02-06) — calculateConfidenceInterval with Kp/SFI/MUF-ratio factors, SNR ranges, ConfidenceBar in BandConditionsPanel, ranges in BandPlanner.

15. ~~**Contest Rate Sheet**~~ DONE (2026-02-06) — ContestRateSheet with hourly/10-min toggle, band-by-hour heatmap matrix, inline bar charts, best-rate highlighting.

16. ~~**Theme Customization**~~ DONE (2026-02-06) — Accent color CSS variables for plasma-orange/signal-green, 8 accent presets in Settings > Appearance, auto-propagation to all Tailwind classes.

### Tier 4: Remaining Partials & Not-Started — ALL COMPLETE

17. ~~**Offline Indicator**~~ DONE (2026-02-07) — OfflineIndicator component with online/offline events, amber banner in Layout + flow-positioned in MobileLayout.

18. ~~**Global Focus Indicators**~~ DONE (2026-02-07) — `*:focus-visible` theme-accent outline fallback + element-specific ring styles with `outline:none` to prevent double-ring, WCAG 2.1 compliant.

19. ~~**Favorite Bands Quick-Filter**~~ DONE (2026-02-07) — Favorites chip toggle + star icons on band rows in BandPlanner, persisted via userStore `favoredBands`.

20. ~~**Recent Targets List**~~ DONE (2026-02-07) — Recent targets dropdown in DXWizard with click-outside dismiss + Escape handler, populated from mapStore.

21. ~~**Mobile Settings Accordion**~~ DONE (2026-02-07) — SettingsModal renders expandable accordion sections on mobile via `useIsMobile()`, shared `renderTabContent()` function for both layouts.

22. ~~**Pull-to-Refresh**~~ DONE (2026-02-07) — `usePullToRefresh` hook with elastic feel + threshold trigger, `PullToRefreshIndicator` spinner with `role="status"`, wired in MobileLayout.

23. ~~**Noise Floor Settings (C9)**~~ DONE (2026-02-07) — NoiseEnvironment dropdown in Settings Preferences tab, userStore v14 migration, ITU-R P.372 model integration.

24. ~~**Continuous Bearing/Distance (C18)**~~ DONE (2026-02-07) — Hover overlay in FlatMapView bottom-left showing bearing + compass direction + distance from user QTH.

25. ~~**Contest Timer Enhancement**~~ DONE (2026-02-07) — Optional `contestEnd` for open-ended sessions, `BreakTimeIndicator` for 5min+ idle, shared tick to avoid redundant intervals.

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
