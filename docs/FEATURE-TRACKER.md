# Propulse Feature Tracker

> Master reference of all planned features, their delivery status, and remaining gaps.
> Updated 2026-09-05: added section 13 (HamClock Wall) from `docs/designs/hamclock-wall-spec.md`, then extended it with HW-56 to HW-73 (the dedicated reports of spec section 26). Earlier sections last cross-referenced 2026-02-11.

---

## Summary

| Source Document                         | Delivered | Partial | Not Started | Deferred | Total   |
| --------------------------------------- | --------- | ------- | ----------- | -------- | ------- |
| Implementation Plan (37 features)       | 35        | 0       | 2           | 0        | 37      |
| 2D Map Feature Parity PRD               | 39        | 1       | 2           | 1        | 43      |
| Contest PropSphere Integration PRD      | 34        | 2       | 1           | 0        | 37      |
| Mobile Design Plan                      | 18        | 0       | 1           | 0        | 19      |
| UI Review Recommendations               | 9         | 0       | 1           | 0        | 10      |
| QoL PRD (20 items)                      | 19        | 1       | 0           | 0        | 20      |
| PWA Package                             | 6         | 0       | 1           | 0        | 7       |
| Profile/Shack/Settings Plan             | 10        | 0       | 0           | 0        | 10      |
| v0.13.x New Features (2026-02-08)       | 22        | 0       | 0           | 0        | 22      |
| v0.14.0 Polish & Infra (2026-02-10)     | 12        | 1       | 0           | 0        | 13      |
| v0.15.0 Spot Watch System (2026-02-10)  | 22        | 2       | 0           | 0        | 24      |
| v0.16.0 NCS Workflow + QSO (2026-02-11) | 38        | 0       | 0           | 0        | 38      |
| HamClock Wall (2026-09-05)              | 43        | 2       | 28          | 0        | 73      |
| **Grand Total**                         | **304**   | **9**   | **39**      | **1**    | **353** |

**Delivery rate: 86% delivered, 3% partial, 11% not started**

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

### Delivered (30)

Ops Console with DX/Contest tabs, one-line entry in map context, contest spots panel, contest band map, Run/S&P mode toggle, ESM state machine, real-time scoring, dupe detection in spots, multiplier tagging on spots, band-specific spot filtering, spot click → prefill, band map frequency axis, band map time axis, spot color coding (dupe/mult/new), current frequency indicator, contest HUD pill (Lite Mode), voice entry toggle, Alt+E focus hotkey, session persistence across pages, contest-aware InsightsBar, Cabrillo export from map, ADIF import/export, call history SCP, keyboard hotkeys, QSO table in console, edit last QSO, undo last QSO, bridge frequency sync, bridge mode sync, network score broadcast.

### Partial (2)

| Feature          | Status                      | Gap                                      |
| ---------------- | --------------------------- | ---------------------------------------- |
| Multi-op support | Bridge protocol defined     | No multi-op UI or shared logging         |
| N1MM integration | Bridge protocol spec exists | No actual N1MM data exchange implemented |

### Not Started (1)

| Feature                | Priority | Notes                                              |
| ---------------------- | -------- | -------------------------------------------------- |
| Railway/cloud services | Low      | No server-side contest services (was aspirational) |

### Recently Completed

| Feature                 | Date       | Notes                                                                     |
| ----------------------- | ---------- | ------------------------------------------------------------------------- |
| Health indicators       | 2026-02-06 | HealthStatusIndicator with per-service health monitoring                  |
| Sync/retry queue        | 2026-02-06 | syncQueueStore + useSyncQueue + SyncStatusIndicator in Header             |
| Contest timer           | 2026-02-07 | CountdownClock + BreakTimeIndicator + off-time tracking with optional end |
| Rate meter              | 2026-02-07 | ContestRateSheet with hourly/10-min toggle + band-by-hour heatmap         |
| Network score broadcast | 2026-02-07 | ContestScoreShare card + useContestScoreBroadcast with Unicode-safe share |

---

## 4. Mobile Design Plan

_Source: `docs/requirements/MOBILE-DESIGN-PLAN.md`_

### Delivered (18) — updated 2026-02-07

| Feature                  | Notes                                                      |
| ------------------------ | ---------------------------------------------------------- |
| Bottom tab navigation    | BottomTabBar with 5 tabs + ToolsDrawer                     |
| Mobile SolarPulse layout | MobileSolarPulse with accordion sections                   |
| Mobile PropSphere layout | MobileMap with FlatMapView (no Three.js)                   |
| Mobile DX Cluster layout | MobileDXWizard with step wizard flow                       |
| Mobile Logbook layout    | MobileLogbook with card-per-QSO view                       |
| Mobile Band Planner      | MobileBandPlanner with gradient band cards                 |
| Compact header           | MobileHeader (48px) with ConditionsPill                    |
| Safe area handling       | `viewport-fit=cover` + `pb-safe` CSS utilities             |
| MobileContestEntry       | Wired into `useIsMobile()` layout switching                |
| ContestLiteHudSheet      | Works within MobileLayout shell                            |
| Touch-friendly buttons   | 44px min touch targets on all mobile nav elements          |
| Bottom sheet pattern     | MobileMap slide-up panel, ToolsDrawer overlay              |
| Mobile Settings          | Accordion layout via useIsMobile in SettingsModal          |
| Pull-to-refresh          | usePullToRefresh + PullToRefreshIndicator                  |
| Offline indicator        | OfflineIndicator banner in MobileLayout                    |
| Swipe gestures           | useSwipeNavigation with touch event gesture detection      |
| Mobile-first typography  | touch-action:manipulation, mono letter-spacing, tap delay  |
| PWA install prompt       | PWAInstallPrompt with beforeinstallprompt + install banner |

### Not Started (1) — remaining

| Feature           | Priority | Notes                              |
| ----------------- | -------- | ---------------------------------- |
| Mobile onboarding | Low      | Onboarding tour not mobile-adapted |

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

| Feature                 | Date       | Notes                                                           |
| ----------------------- | ---------- | --------------------------------------------------------------- |
| Interactive tooltips    | 2026-02-06 | InfoTip component + centralized registry (40+ definitions)      |
| Dashboard redesign      | 2026-02-07 | Centered gauge, merged summary, widened bands, cluster data fix |
| Dashboard spacing       | 2026-02-07 | Wider band columns, spot activity column, scaled metrics        |
| Cluster Pulse explainer | 2026-02-07 | Data source footer, history CTA for new users                   |
| React hooks compliance  | 2026-02-07 | Fixed Rules of Hooks violation in BandConditions                |
| PWA meta/manifest fixes | 2026-02-07 | Cross-platform meta tags, VitePWA devOptions for dev server     |

---

## 6. QoL PRD (20 Items)

_Source: `.claude/plans/prd-qol-and-pwa-features.md`_

### Delivered (19)

Undo/redo system, ADIF export, Cabrillo export, dark theme, skeleton loaders, spot filtering, logbook search, error boundaries, IndexedDB persistence, React.memo optimization, virtualized lists, lazy route loading, data refresh indicators, confidence intervals on predictions, double-click to center (pre-existing), global focus indicators, favorite bands quick-filter, recent targets list, smooth scroll between sections.

### Partial (1)

| Feature             | Status                        | Gap                                             |
| ------------------- | ----------------------------- | ----------------------------------------------- |
| Smart notifications | Toast system + alert triggers | No browser push notifications or priority queue |

---

## 7. PWA Package

_Source: `.claude/plans/prd-qol-and-pwa-features.md`_

### Delivered (6)

| Feature                | Notes                                                           |
| ---------------------- | --------------------------------------------------------------- |
| Service Worker         | vite-plugin-pwa with workbox, 36 precache entries               |
| Web App Manifest       | manifest.webmanifest with app metadata + SVG icon               |
| Offline fallback       | offline.html page shown when SW can't fetch                     |
| App shell architecture | Precached shell with runtime caching for API (NetworkFirst)     |
| Update prompt          | PWAUpdatePrompt toast with "Reload" / "Dismiss" buttons         |
| Offline data caching   | IndexedDB cache layer (idbCache) with per-endpoint TTLs in noaa |

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

### Tier 5: Remaining Feasible Items — ALL COMPLETE

26. ~~**PWA Install Prompt**~~ DONE (2026-02-07) — PWAInstallPrompt component with `beforeinstallprompt` event capture, dismissible install banner, `appinstalled` auto-hide.

27. ~~**Smooth Scroll**~~ DONE (2026-02-07) — `scroll-behavior: smooth` gated behind `@media (prefers-reduced-motion: no-preference)` in globals.css.

28. ~~**Mobile Typography**~~ DONE (2026-02-07) — `touch-action: manipulation` on all interactive elements, mono letter-spacing for mobile readability, narrowed `[tabindex]` selector.

29. ~~**Swipe Navigation**~~ DONE (2026-02-07) — `useSwipeNavigation` hook with 80px horizontal threshold, 60px vertical guard, 300ms cooldown, merged callback refs with pull-to-refresh.

30. ~~**Offline Data Caching**~~ DONE (2026-02-07) — `idbCache.ts` IndexedDB wrapper with `getCachedResponse`/`setCachedResponse`/`clearExpiredCache`, per-endpoint TTLs in noaa.ts, startup cache cleanup.

31. ~~**Contest Score Broadcast**~~ DONE (2026-02-07) — `useContestScoreBroadcast` hook with Unicode-safe base64 share URL, `ContestScoreShare` card with 4-column stats grid + band breakdown + clipboard copy.

---

## 8. Profile/Shack/Settings Plan

_Source: `.claude/plans/composed-mixing-seahorse.md`_

### Delivered (10) — 2026-02-07

| Feature                  | Notes                                                                     |
| ------------------------ | ------------------------------------------------------------------------- |
| Store decomposition      | userStore → profileStore + settingsStore + shackStore with bridge shim    |
| Operator Profile page    | 4-tab page (Overview/Locations/Awards/Stats) with completeness ring       |
| Callsign auto-fill       | HamQTH lookup with 500ms debounce, one-click suggestions                  |
| Shack Builder page       | 7-tab page with antenna/feedline/accessory managers                       |
| Feedline loss engine     | sqrt(f) interpolation, SWR mismatch, 8 cable types, condition multipliers |
| Station presets          | Composite radio+antenna+feedline+accessories with per-band ERP            |
| Settings page redesign   | 5 sections, SVG icons, ARIA, escape key, band presets, high contrast      |
| Performance dashboard    | Per-band capability matrix, signal chain waterfall, system summary        |
| Active station gain hook | useActiveStationGain bridges presets → 5 map views                        |
| Navigation integration   | Profile/Shack icons in desktop header + mobile tools drawer               |

---

### Remaining Items (Not Feasible / Out of Scope)

The following 13 items remain undelivered. All are either infeasible without backend infrastructure, require external service integration, or are low-priority nice-to-haves:

| Feature                        | Section    | Reason Not Feasible                                     |
| ------------------------------ | ---------- | ------------------------------------------------------- |
| Smart notifications (push)     | QoL        | Requires push server infrastructure (VAPID keys, etc.)  |
| Multi-station support          | Impl. Plan | Requires multi-tenant architecture, auth system         |
| Customizable dashboard widgets | UI Review  | Drag-and-drop grid layout = major architectural effort  |
| Mobile onboarding              | Mobile     | Low ROI without user research on pain points            |
| WebGL tile rendering           | 2D Map     | Canvas renderer adequate; WebGL = different render path |
| Offline tile caching           | 2D Map     | Tile hosting/licensing prevents SW caching              |
| Multi-op support               | Contest    | Requires real-time sync server + conflict resolution    |
| N1MM integration               | Contest    | Requires N1MM protocol reverse-engineering              |
| Railway/cloud services         | Contest    | Server-side infrastructure (aspirational)               |
| Push notifications             | PWA        | Requires push server (see Smart notifications)          |
| Multi-select spots (lasso)     | 2D Map     | Canvas hit-testing for arbitrary shapes = complex       |
| 3D terrain elevation           | 2D Map     | Scope creep (deferred)                                  |
| QoL5 Smart notifications       | Impl. Plan | Duplicate of push notifications above                   |

---

## 9. v0.13.x New Features (2026-02-08)

_Delivered across v0.13.0, v0.13.1, and v0.13.2 releases._

### Callsign Ingestion & Profile (5)

| Feature                       | Notes                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------- |
| Multi-source callsign lookup  | HamQTH + QRZ ingestion service with bio, profile images, grid auto-fill       |
| Bio showcase section          | Markdown-capable bio with image uploads and larger character limits           |
| GMRS callsign validation      | WSLK349-format GMRS callsigns accepted alongside amateur radio formats        |
| Profile page audit (46 fixes) | Comprehensive usability audit across 25 files — spacing, labels, interactions |
| Dev mode auto-seed            | Auto-populate equipment and KB0EL profile data in development mode            |

### SDR & Radio Daemon (6)

| Feature                  | Notes                                                                   |
| ------------------------ | ----------------------------------------------------------------------- |
| Radio daemon workspace   | SDR console page with device picker, discovery UI, SoapySDR integration |
| SDR waterfall UI         | Interactive waterfall display with filter drag-select and IQ streaming  |
| Device scanning          | SoapySDR device discovery with automatic enumeration                    |
| SDRconnect backend       | Chrome daemon bridge with WebSocket API for SDR control                 |
| SDR setup guide          | Dedicated setup guide page with configuration resources                 |
| Daemon integration tests | Test suite for daemon communication and device management               |

### Shack & Equipment (4)

| Feature                      | Notes                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------ |
| Shack UX overhaul            | 3-tab layout (Equipment/Diagram/Performance), trading-card aesthetic           |
| S/M/L/XL equipment cards     | 4-size card system with holographic effects, gallery strips, type-colored bars |
| Image upload system          | Client-side compression (Canvas API), cropping (react-easy-crop), IDB storage  |
| Station Builder Lab overhaul | Shack Overview as primary view, drag-and-drop signal path builder              |

### Authentication & Sync (3)

| Feature               | Notes                                                                 |
| --------------------- | --------------------------------------------------------------------- |
| Email/password auth   | AuthModal with 5 views, magic link recovery, soft-prompt access tiers |
| Image cloud sync      | Supabase Storage `equipment-images` bucket with migration             |
| Sync engine expansion | DXCC, shack sub-tables, preferences consolidated; composite PK fix    |

### PropSphere Views (2)

| Feature                         | Notes                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Unified layout mode dropdown    | Single dropdown replacing LiteModeToggle + Pro View card — 4 modes           |
| HamClock dense-information view | Full-screen CSS Grid dashboard: DE/DX panels, solar indices, band conditions |

### Alerts & Preferences (2)

| Feature                        | Notes                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Greyline & band opening alerts | Two new alert types wired into full pipeline (detect → evaluate → sound)                                         |
| Preferences wiring (8 prefs)   | Text scale, time format, color blind mode, themes, quiet hours, hold duration, spotter labels, noise environment |

### Security & Fixes (2 — not counted in feature total)

| Fix                               | Notes                                                            |
| --------------------------------- | ---------------------------------------------------------------- |
| Security audit (20 + 6 findings)  | XSS, CSRF, input validation, CSP, rate limiting across 10+ files |
| Supabase onConflict composite PKs | Fixed 13 tables across 9 sync modules matching composite PKs     |

---

## 10. v0.14.0 Polish & Infrastructure (2026-02-10)

_Delivered in v0.14.0 release. Focus on UX consistency, map interaction quality, and propagation data architecture._

### Solar Dashboard Polish (1)

| Feature               | Notes                                                                          |
| --------------------- | ------------------------------------------------------------------------------ |
| Clickable solar cards | All 8 solar chart cards use whole-card click with hover expand icon + keyboard |

### Map Interaction Improvements (6)

| Feature                           | Notes                                                                      |
| --------------------------------- | -------------------------------------------------------------------------- |
| Hover-to-surface spot labels      | Stacked labels individually navigable with z-index boost on hover          |
| Band-color underline consistency  | 3px solid edge-to-edge underlines matching across globe and flat map views |
| Distance-aware globe occlusion    | Dynamic limb fading replaces fixed thresholds — labels fade at globe edge  |
| Portal-based time control popover | Presets/scenarios use portal popover with click-outside + Escape dismiss   |
| Map flyout polish                 | Indentation fix, shorter action labels                                     |
| Spot cluster improvements         | Minor rendering fixes for dense cluster display                            |

### UX Audit Fixes (5)

| Feature                       | Notes                                                                      |
| ----------------------------- | -------------------------------------------------------------------------- |
| Map toolbar consistency       | Dividers between 4 groups, per-preset accent colors with icons and borders |
| 404 catch-all route           | Ham-themed NotFound page instead of blank route fallback                   |
| Best Bands Now card           | Action-oriented descriptions, day/night indicator, SFI/Kp context footer   |
| Remove duplicate SolarSummary | Standalone card removed from SolarPulse (modal version kept)               |
| Mobile tools drawer parity    | Logbook entry added for nav parity with desktop dropdown                   |

### Partial (1)

| Feature                          | Status                        | Gap                                     |
| -------------------------------- | ----------------------------- | --------------------------------------- |
| Location-aware propagation model | Architecture plan doc written | Implementation pending 14+ days of data |

### Documentation

| Document                              | Notes                                                          |
| ------------------------------------- | -------------------------------------------------------------- |
| Location-aware propagation model plan | 3-level architecture (region stats → ML model → path-specific) |

---

## 11. v0.15.0 Spot Watch System (2026-02-10)

_Source: `docs/plans/SPOT-WATCH-PRD.md`. Full 4-phase implementation of the Spot Watch system — unified filter engine, grid glow effects, spot replay, and contest integration. All premium features gated behind subscription tier feature flags._

### Phase 1 — Watch Filter Engine + UI (10)

| Feature                       | Notes                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------- |
| watchStore v2→v3              | Single active watch model replacing multi-watch v1, unified WatchCriteria (AND)  |
| WatchPopover                  | Toolbar popover with quick presets, filter inputs, saved watches (max 20)        |
| WatchStatusPill               | Floating status pill: criteria summary, match count, rate, contest info          |
| Camera auto-pan               | Rate-limited panning in GlobeView (<0.2/s: pan, 0.2-2/s: debounced, >2/s: none)  |
| Arc highlighting              | Matched spots full opacity + 1.2x scale; non-matched dimmed to 30% on Globe+Flat |
| DXSpotList integration        | Matched spots pinned to top with green accent bar + filter banner                |
| Arc density slider            | Range 10-200 in LayersPopover, replacing hardcoded maxArcs=50                    |
| LayersPopover cleanup         | Auto-Follow toggle removed; density slider added; wired to mapStore              |
| Deprecated component removal  | Deleted WatchListPanel, WatchIndicator, LiteModeToggle, ViewModeToggle           |
| Operating profiles + popovers | Toolbar popover system (Layers, Colors, Profile, Views) with click-outside       |

### Phase 2 — Grid Glow + Visual Polish (4)

| Feature           | Notes                                                                              |
| ----------------- | ---------------------------------------------------------------------------------- |
| GridGlowOverlay   | Three.js shader overlay at r=1.003, pulse animation (800ms rise, 1200ms fade)      |
| GridGlowCanvas    | Canvas 2D grid glow for FlatMapView with additive blending                         |
| Grid glow pooling | Max 20 simultaneous glows, oldest recycled, additive intensity for same-grid spots |
| Ambient mode      | Pro fullscreen: auto-hide toolbar (3s), cursor (5s), minimal overlay when idle     |

### Phase 3 — Spot Replay (4, Premium)

| Feature         | Notes                                                                                |
| --------------- | ------------------------------------------------------------------------------------ |
| Feature flags   | `SubscriptionTier`, `FeatureFlags`, `useFeatureFlags()` hook, profileStore v8        |
| useSpotReplay   | TanStack Query hook querying Supabase `spot_history` with time window + filters      |
| ReplayIndicator | Timeline scrubber overlay with playback controls, Pro badge gate for non-subscribers |
| replayStore     | Ephemeral store converting ReplaySpot[] to LiveSpot[] for globe/flat-map consumption |

### Phase 4 — Contest Integration (4)

| Feature            | Notes                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| useContestWatch    | Bridge hook: watchStore ↔ contest multiplier engine, DXCC/CQ zone detection  |
| ContestRatePanel   | Floating panel: live QSO rate, band chart, trend arrows, band-switch advice  |
| Contest presets    | WatchPopover: CQWW CW/SSB, ARRL DX, Field Day presets + "Needed Only" toggle |
| DXSpotList contest | NEW MULT badges on needed multiplier spots, tri-sort (mult → match → rest)   |

### Partial (2)

| Feature                       | Status                 | Gap                                                             |
| ----------------------------- | ---------------------- | --------------------------------------------------------------- |
| ContestRatePanel band advisor | Renders with stub data | bandAdvisor receives placeholder args; advice limited to "stay" |
| ITU zone multiplier detection | Reuses CQ zone regex   | Won't match "ITU Zone X" patterns in spot comments              |

### Bug Fixes (3 — not counted in feature total)

| Fix                                | Notes                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------- |
| SpotHistoryRow schema mismatch     | Fixed column names to match spot_history table (rx_callsign, etc.)      |
| Infinite re-render loop            | Replaced ES5 getters in watchStore with explicit computed compat fields |
| PropSphere full-store subscription | Replaced `useWatchStore()` with targeted selectors to reduce re-renders |

### Documentation

| Document                       | Notes                                              |
| ------------------------------ | -------------------------------------------------- |
| Spot Watch PRD                 | Full product requirements for 4-phase watch system |
| Globe Toolbar & Modes Redesign | Architecture plan for toolbar popover system       |

---

## 12. v0.16.0 NCS Workflow + QSO Logging (2026-02-11)

_Two major feature sets: NCS Dashboard phase-based workflow redesign and full QSO logging system with ADIF support._

### NCS Dashboard Phase Workflow (12)

| Feature                        | Notes                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------- |
| Phase state machine            | Client-side `preamble → checkin → rounds → closeout` with forward/back nav    |
| PhaseIndicator pill bar        | Segmented pill bar with checkmarks, clickable completed phases, kbd hints     |
| PreamblePhase                  | Preamble text display with variable substitution, skip option if no template  |
| CheckinPhase                   | Center-stage CallsignInput + growing CheckinList, always-visible advance      |
| RoundsPhase                    | Two-column: SpeakerStage (60%) + fixed-width sidebar (320px) with roster      |
| SpeakerStage                   | Mission control card: hero callsign, inline timer, Done/Skip/No Show, On Deck |
| CloseoutPhase                  | Session summary stats (color-coded), notes textarea, dignified Close Net      |
| TurnTimer imperative control   | `forwardRef` + `useImperativeHandle` with `resetAndStart()` for auto-advance  |
| CheckinList compact mode       | `compact` prop for sidebar: smaller text, hidden drag handles, icon actions   |
| Always-visible action buttons  | Removed hover-only gate on CheckinList actions in both normal and compact     |
| SessionControls simplification | Stripped to session lifecycle only (start/close), preamble+notes moved out    |
| Phase keyboard shortcuts       | `1`-`4` jump phases, `Space`/`→` advance during rounds, `S` skip              |

### QSO Logging System (23)

| Feature                       | Notes                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------- |
| qsoStore                      | Zustand + IndexedDB persistence, CRUD, filtering, pagination, bulk operations |
| QSO types                     | Full QSO record type with 30+ fields, contest exchange, activation fields     |
| QSOEntryForm                  | Full entry form: callsign, frequency, mode, RST, notes, contest exchange      |
| QSOEntryCompact               | Inline compact entry for quick logging during operation                       |
| QSOLogTable                   | Sortable table view with inline editing, status icons, band-color coding      |
| QSOLogCards                   | Card-based mobile view with swipe actions                                     |
| QSOLogViewer                  | Unified viewer switching between table and card layouts                       |
| QSOLogFilters                 | Band, mode, date range, callsign search, DXCC entity filters                  |
| QSOLogPagination              | Page-based navigation with configurable page size                             |
| QSOLogStats                   | Real-time stats: QSO count, unique DXCCs, bands worked, modes used            |
| QSODetailModal                | Full QSO detail view with all fields and edit capability                      |
| QSOInlineEditor               | Edit QSO fields directly in table row                                         |
| QSOBulkActions                | Select multiple QSOs for bulk delete, export, or status change                |
| QSOExportMenu                 | ADIF, Cabrillo, CSV export with filter-aware selection                        |
| ADIF import/export library    | Full ADIF 3.1.4 parser and generator in `src/lib/adif/`                       |
| Cabrillo export               | Contest-aware Cabrillo 3.0 format export                                      |
| Conflict resolution           | Field-level conflict detection and merge UI for multi-device sync             |
| ConflictResolutionModal       | Side-by-side comparison with per-field accept/reject                          |
| ConflictBadge                 | Header badge showing unresolved conflict count                                |
| Dupe check engine             | Real-time duplicate detection with configurable rules                         |
| Offline write queue           | Queue mutations when offline, auto-sync on reconnect                          |
| OfflineIndicator enhancements | Reconnect flash, offline duration counter, pending sync count                 |
| Logbook page rewrite          | Simplified Logbook.tsx wiring QSO components together                         |

### Bridge & Infrastructure (3)

| Feature                   | Notes                                                                   |
| ------------------------- | ----------------------------------------------------------------------- |
| Bridge static file server | Serves built frontend on localhost:3173 for offline access without Vite |
| bridge build:full script  | Single command builds frontend + bridge together                        |
| Setup script offline info | Setup guide mentions offline serving endpoint after build               |

---

## 13. HamClock Wall (2026-09-05)

_Source: `docs/designs/hamclock-wall-spec.md` (feature register HW-01 to HW-73). Wall density shipped as the HamClock default across PRs #167, #169, #170 and #171. Open work is packaged as batch issues #197 to #212 under tracker #213 on the ProPulse Delivery project board; batches B17 to B25 (the dedicated reports of spec section 26) have briefs but no issues yet._

### Delivered (43)

| ID    | Feature                                                       | Notes                                                                                                                                                                          |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HW-01 | Wall shell: full-bleed map, header, paged rails, pager        | PR #167, `wall/HamClockWall.tsx`                                                                                                                                               |
| HW-02 | Theme token layer and pulse theme                             | PR #167, `src/styles/hamclock-themes.css`                                                                                                                                      |
| HW-03 | Display store: density, theme, units, page index, migrations  | PR #167, #169, `hamclockDisplayStore` v3                                                                                                                                       |
| HW-04 | Unit resolution (auto / imperial / metric)                    | PR #167, `src/lib/hamclock/units.ts`                                                                                                                                           |
| HW-05 | Keyboard paging and footer pager                              | PR #167                                                                                                                                                                        |
| HW-06 | Sixteen live tiles                                            | PR #169, `wall/tiles/index.ts`                                                                                                                                                 |
| HW-07 | Wall as default density                                       | PR #169                                                                                                                                                                        |
| HW-08 | Page taxonomy v1 (five pages)                                 | PR #169, `wall/pages.ts`                                                                                                                                                       |
| HW-09 | Report modal shell on `AccessibleDialog`                      | PR #170                                                                                                                                                                        |
| HW-10 | Six reports wired to thirteen tiles                           | PR #170                                                                                                                                                                        |
| HW-12 | Classic and brass themes, picker, fonts on demand             | PR #171                                                                                                                                                                        |
| HW-13 | Wall controls: map content, home region, Escape scoping       | PR #171                                                                                                                                                                        |
| HW-14 | Kiosk scene HamClock pinning                                  | PR #171, `src/lib/kiosk/applySceneToMap.ts`                                                                                                                                    |
| HW-15 | Accessibility baseline: sr-only tables, focus return          | PR #170, #171                                                                                                                                                                  |
| HW-16 | Style guide for tiles, reports and settings                   | `docs/guides/hamclock-tile-system.md`                                                                                                                                          |
| HW-21 | Layer registry with provenance text                           | PR #222, `src/lib/map/layerRegistry.ts`; feeds settings and help — no distinct wall status line component exists                                                               |
| HW-22 | Header parity: WALL/DESK toggle and reduced top rail          | PR #216                                                                                                                                                                        |
| HW-23 | Layers popover viewport clamp and trigger move                | PR #216                                                                                                                                                                        |
| HW-26 | Centered settings panel with tabs                             | PR #221                                                                                                                                                                        |
| HW-32 | Lightning bolt glyph (2D and 3D)                              | PR #217, `src/lib/map/lightningGlyph.ts`                                                                                                                                       |
| HW-39 | Map style chooser on the settings Map tab                     | PR #222, `wall/settings/MapTab.tsx`                                                                                                                                            |
| HW-50 | Duplicate guard: store validation and picker grey-out         | PR #218, `assertUniqueTilesPerPage`                                                                                                                                            |
| HW-51 | Hero text fit: clamp, container units, length classes, tests  | PR #218, `HamClockTile.tsx`, `tokens.ts`                                                                                                                                       |
| HW-54 | Both rails follow the page; de-duplicated shipped pages       | PR #218, `hamclockDisplayStore.ts`                                                                                                                                             |
| HW-55 | Persist a tile provider id in `mapStore`                      | PR #222, Esri / Mapbox and OSM / CARTO selectable                                                                                                                              |
| HW-27 | User-selected rails (Pages & Tiles tab)                       | PR #234, `railLayout` model                                                                                                                                                    |
| HW-52 | Use presets: five shipped, user-saved                         | PR #234, `wall/presets.ts`                                                                                                                                                     |
| HW-53 | No radio dependency: station tiles degrade to a neutral state | PR #234, `SET HOME IN SETTINGS`                                                                                                                                                |
| HW-20 | Auto-page dwell mode                                          | PR #236, `useWallAutoPage.ts`                                                                                                                                                  |
| HW-24 | Desk on wall tiles, paged, scale token                        | PR #238, `--hc-scale` in `hamclock-wall.css`, `HamClockWall` at both densities                                                                                                 |
| HW-25 | Desk cleanup: DE station block, duplicate weather, DX target  | PR #238, `HamClockSidebar.tsx`/`HamClockLocationConditions.tsx` deleted, `DxTargetTile`/`DxTargetReport` added                                                                 |
| HW-11 | Honest empty states and freshness in reports                  | PR #239, every report footer now follows `reportFooter()`'s `DATA: source · UPDATED hh:mm UTC · age` contract; `LocalWeatherData.observedAt` derives the true UTC instant      |
| HW-17 | Forecast horizon                                              | PR #239, `ForecastReport` marks matrix hour columns and adds a MODEL fact per activated `FUTURECAST_HORIZONS_HOURS`, overlaying the existing 24 h physics matrix               |
| HW-29 | Trend charts in reports; chart components read theme tokens   | PR #239, `SolarMiniChart`/`SolarSeriesChart` read `--hcr-chart-*` under `[data-hamclock-theme]` with unchanged hex fallbacks on `/solar`; `MetricCard` excluded (no sparkline) |
| HW-30 | Report pin                                                    | PR #239, `WallReport` PIN/UNPIN control + `HamClockPinnedReportHost`, session-only, survives page/scene changes                                                                |
| HW-31 | Best Band Now ranked table report                             | PR #239, new `wall/reports/BestBandReport.tsx` replacing `BandVerdictDetailsDialog` on `BestBandTile`                                                                          |
| HW-63 | Sun report: twilights, elevation curve, day-length trend      | PR #243, section 26.8; `SunReport.tsx`, `src/lib/hamclock/sunCurve.ts`; elevation curve with shaded twilights, polar day/night states                                          |
| HW-64 | Grey line report: per-band tiers, windows, target overlap     | PR #243, section 26.9; `GreyLineReport.tsx`, `getGreylineIntensityCurve` / `getMutualGreylineWindow` in `greyline.ts`; tiers, mutual overlap with the DX target                |
| HW-56 | `EngineComparisonStrip` on every model-backed report          | PR #246, section 26.1; `EngineComparisonStrip.tsx`, pure `compareEngines()` in `src/lib/hamclock/engineComparison.ts`; on the MUF and Best band reports                        |
| HW-57 | MUF report: ionosphere facts, hop table, usable window        | PR #246, section 26.2; `MufReport.tsx`, `useMUFHourlySeries`; PATH / HOPS tabs, shaded FOT–LUF usable window, hop rows flash the map                                           |
| HW-60 | Solar report: SFI, SSN, flux forecast, cycle 25               | PR #247, section 26.5; `SolarReport.tsx` rewritten with NOW / CYCLE tabs, flux trend with the 27-day outlook tail                                                              |
| HW-61 | X-ray and flares report: B/C/M/X curve, D-RAP, probabilities  | PR #247, section 26.6; `XrayReport.tsx`, FLUX (log axis, B/C/M/X rules, last flare marker) / ABSORPTION (D-RAP) / PROBABILITIES tabs                                           |
| HW-62 | Solar wind and geomagnetic report: Bz, Kp, Dst, aurora, CMEs  | PR #247, section 26.7; `SolarWindReport.tsx`, WIND / GEOMAGNETIC / EVENTS tabs, Bz zero rule, aurora map link                                                                  |

### Partial (2)

| ID    | Feature                 | Gap                                   |
| ----- | ----------------------- | ------------------------------------- |
| HW-18 | Weather alerts coverage | Nationwide feed, mapped geometry only |
| HW-19 | SDR decodes tile        | Idle until a shared receiver exists   |

### Not Started (28)

| ID    | Feature                                                          | Notes                                                  |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| HW-28 | World clocks bar                                                 | Open decision D1                                       |
| HW-33 | Earthquakes tile and report (USGS)                               | Open decision D4                                       |
| HW-34 | Volcanoes tile and report (Smithsonian GVP)                      | Open decision D4                                       |
| HW-35 | Page taxonomy v2 (six pages, new tiles)                          | Depends on HW-27, HW-33, HW-34                         |
| HW-36 | Widget config contract and `hamclockWidgetConfigStore`           | Segmented choices, no scroll, per-tile persistence     |
| HW-37 | News feeds config dialog (first configurable widget)             | Over `feedStore`; verify URLs via `api/feeds/rss.ts`   |
| HW-38 | Config dialogs: cluster, weather, band list, clocks, alerts      | One PR per widget                                      |
| HW-40 | Weather page with seven weather tiles                            | Spec section 16                                        |
| HW-41 | Weather report: hero, trend charts, 7-day strip, pointer details | Moved from B13 to B22 with the fetch extension         |
| HW-42 | Radar report with 2D and 3D scrubber                             |                                                        |
| HW-43 | Lightning report                                                 | After HW-32                                            |
| HW-44 | Weather configuration dialog                                     | HW-36 contract                                         |
| HW-45 | Weather layers category on the Layers tab                        | HW-21 registry                                         |
| HW-46 | AtmosPulse 2D layers available in 2D and 3D on the map           | Twelve layers                                          |
| HW-47 | Monitored regions and RIM scores as a report                     | Moved from B16 to B23 with the RIM tile                |
| HW-48 | EmComm forms and activation from the Emcomm tile                 |                                                        |
| HW-49 | `/atmos` redirect or deep link                                   | Open decision D7                                       |
| HW-58 | Reliability report: SNR, confidence, station inputs              | B18                                                    |
| HW-59 | Propagation forecast report: 48 h chart, FutureCast horizons     | B18                                                    |
| HW-65 | EME computation module `src/lib/utils/eme.ts`                    | New: path loss, sky noise, mutual window, Doppler; B21 |
| HW-66 | Moon and EME report                                              | B21; depends on HW-65                                  |
| HW-67 | Open-Meteo fetch extended to hourly and 7-day                    | `src/lib/api/openMeteo.ts`; B22                        |
| HW-68 | Alerts report: severity, area, expiry, map link                  | B22                                                    |
| HW-69 | Radio Impact Model tile                                          | Over `computeRIM` / `useRIM`; B23                      |
| HW-70 | Band activity report: history, mode split, top DX                | B24                                                    |
| HW-71 | Recent contacts report: log statistics, 30-day chart             | B24                                                    |
| HW-72 | DX cluster modal adopts the report chrome, pin and footer        | Chrome only; B24                                       |
| HW-73 | Model track: weather-derived features in NowCast                 | Backlog, after every panel is live; B25                |

---

## Source Documents Index

| Category     | File                                                           | Description                                 |
| ------------ | -------------------------------------------------------------- | ------------------------------------------- |
| Requirements | `docs/requirements/2d-map-feature-parity-prd.md`               | 2D map feature parity with 3D globe         |
| Requirements | `docs/requirements/CONTEST-MODE-PROPSPHERE-INTEGRATION-PRD.md` | Contest mode in PropSphere map context      |
| Requirements | `docs/requirements/MOBILE-DESIGN-PLAN.md`                      | Mobile-first UI redesign                    |
| Plans        | `docs/plans/IMPLEMENTATION-PLAN.md`                            | Master 37-feature implementation plan       |
| Plans        | `docs/plans/IMPLEMENTATION-PLAN-PHASE1.md`                     | Phase 1 foundation (Vite + React + Solar)   |
| Reviews      | `docs/reviews/UI-REVIEW-2026-02.md`                            | UI review with persona analysis             |
| Reviews      | `docs/reviews/DX-WIZARD-EXPERT-REVIEW.md`                      | Expert review: 23 features + 14 QoL         |
| Reviews      | `docs/reviews/CONTEST-MODE-QA.md`                              | Contest mode QA checklist                   |
| Guides       | `docs/guides/CONTEST-MODE-USER-GUIDE.md`                       | Contest mode user documentation             |
| Guides       | `docs/guides/CONTEST-BRIDGE-PROTOCOL.md`                       | WebSocket bridge protocol spec              |
| Internal     | `.claude/plans/prd-qol-and-pwa-features.md`                    | QoL (20 items) + PWA (7 items) PRD          |
| Internal     | `.claude/plans/deferred-bugs.md`                               | 13 deferred bugs from audit                 |
| Plans        | `docs/plans/LOCATION-AWARE-PROPAGATION-MODEL.md`               | Location-aware propagation model (3-level)  |
| Plans        | `docs/plans/SPOT-WATCH-PRD.md`                                 | Spot Watch system PRD (4 phases)            |
| Plans        | `docs/plans/GLOBE-TOOLBAR-MODES-REDESIGN.md`                   | Globe toolbar & modes redesign plan         |
| Plans        | `docs/plans/OFFLINE-FIRST-QSO-LOGGING.md`                      | Offline-first QSO logging PRD               |
| Designs      | `docs/designs/hamclock-wall-spec.md`                           | HamClock wall/desk spec + feature register  |
| Guides       | `docs/guides/hamclock-tile-system.md`                          | HamClock tile, report, settings style guide |
