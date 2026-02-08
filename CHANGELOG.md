# Changelog

All notable changes to **Propulse** are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [0.12.0] — 2026-02-07

### Operator Profile, Shack Builder, Settings Redesign, and Supabase Foundation

This release adds three major station management pages — Operator Profile (4 tabs), Shack Builder (7 tabs), and a redesigned Settings page — along with a feedline loss calculation engine, station preset system with per-band ERP computation, and the foundation for Supabase cloud sync. The monolithic `userStore` is decomposed into three focused stores. Feature delivery reaches 170/173 (98%).

#### Operator Profile (`/profile`)

- **4-tab profile page** — Overview, Locations, Awards, and Stats tabs with desktop sidebar and mobile-responsive layout.
- **Profile completeness ring** — Weighted SVG ring scoring callsign (20), name (10), grid (15), license (15), photo (10), bio (5), social links (5), radio (10), expiration (5), and timezone (5). Tiers from "Getting Started" to "All-Star".
- **Callsign auto-fill** — When entering a callsign (3+ chars), queries HamQTH with 500ms debounce and shows one-click suggestions for name and grid square. Never overwrites without confirmation.
- **Markdown bio** — Rich-text bio with XSS-safe markdown rendering supporting bold, italic, links (http/https/mailto only), unordered lists, and line breaks.
- **Social links** — Editable social link manager with display icons for QRZ, HamQTH, Twitter, YouTube, GitHub, and custom URLs.
- **License card** — Enhanced license display with colored class badge, country flag, and expiration progress bar (green >180d, amber 90-180d, red <90d, urgent <30d). UTC-safe date parsing.
- **Awards tab** — Three SVG concentric progress rings for DXCC (worked/confirmed out of ~340), WAS (out of 50), and WAZ (out of 40) with color-coded segments.
- **Stats tab** — Activity heatmap (SVG 53x7 grid, 365-day, signal-green intensity), QSO by mode donut chart (FT8/SSB/CW/FT4/RTTY), QSO by band horizontal bars, and stat cards with big numbers.
- **QR code modal** — Full-screen QR code with plasma-orange coloring, callsign header, and error correction level H.

#### Shack Builder (`/shack`)

- **7-tab shack page** — Overview, Radios, Antennas, Feedlines, Accessories, Presets, and Performance tabs.
- **Antenna manager** — Card-grid CRUD for antennas with 22 antenna types, per-installation metadata (height, azimuth, polarization, mounting, SWR by band), and band selection.
- **Feedline manager** — Card list CRUD with inline loss display per band. Supports 8 cable types (RG-58 through hardline) with connector and condition tracking.
- **Feedline loss engine** — Static loss tables at 10 HF frequencies (1.8–50 MHz), sqrt(f) interpolation, connector loss defaults per type (PL-259: 0.5 dB, N-type: 0.2 dB), condition multipliers, and SWR mismatch loss via reflection coefficient model.
- **Accessory manager** — Grouped cards by category (amplifier, tuner, filter, switch, power supply, grounding) with adaptive form fields and type-safe discriminated unions.
- **Station presets** — Composite radio + antenna + feedline + accessories configurations with per-band ERP computation. Up to 10 presets with one-click activation.
- **Performance dashboard** — Per-band capability matrix (TX Power, Feedline Loss, Accessory Loss, Power at Antenna, Antenna Gain, ERP), signal chain waterfall, and system summary.
- **Signal chain diagram** — SVG block flow visualization: Radio → Accessories → Feedline → Antenna with unique marker IDs via `useId()`.
- **Band capability strip** — Horizontal band pills colored by capability (green <3 dB loss, amber 3–6 dB, red >6 dB, gray unsupported).
- **Active station gain integration** — `useActiveStationGain` hook bridges shack presets to all 5 map views (Globe, Flat, Azimuthal, plus overlays), replacing direct antenna type reads.
- **Overview tab** — Equipment count cards, active preset summary with mini signal chain, band capability strip, and quick action buttons.

#### Settings Redesign (`/settings`)

- **Full-page settings** — Migrated from modal to dedicated route with 5-section sidebar navigation (Preferences, Appearance, Notifications, Data, About).
- **SVG section icons** — Custom SVG icons replacing emoji in the sidebar for a professional look.
- **Preferences section** — Visual style, high contrast, map & globe sub-settings (spot clustering, compass rose, spot age, spotter labels), propagation forecast controls (band mode, SNR values, hours to show), interaction tuning (hold duration, flyout auto-dismiss), and band presets (up to 5 saved presets with add/edit/delete).
- **Appearance section** — Custom accent color hex inputs with live preview card and Apply/Reset controls.
- **Notifications section** — Sub-group headers (Propagation Alerts, Audio, Watch Alerts) and quiet hours UI.
- **High contrast mode** — Toggle that adds `.contrast-more` to `<html>` with increased border opacity, brighter text, and stronger focus rings.
- **Escape key handler** — Pressing Escape navigates back from settings.
- **ARIA compliance** — `role="radiogroup"` on segmented buttons, `role="slider"` on range inputs, proper label associations.
- **Shared UI primitives** — Reusable `SegmentedButton`, `SectionHeader`, `SettingSelect`, `SettingSlider`, `SettingRow`, and `ConditionalSubSettings` components extracted to `settings/ui/`.

#### Store Decomposition

- **Three canonical stores** — `profileStore` (callsign, bio, social links, license), `settingsStore` (preferences, appearance, notifications), and `shackStore` (radios, antennas, feedlines, accessories, presets) replace the monolithic `userStore`.
- **Bridge shim** — `userStore` rewritten as a thin adapter over the three canonical stores for backward compatibility during migration.
- **Full migration** — All 15+ consumer modules migrated to import from canonical stores directly. Zero remaining `userStore` direct usage.
- **Persist v2 migrations** — Each store has versioned migrations that preserve existing user data through the transition.

#### Supabase Foundation

- **Database schema** — 19 tables covering profiles, locations, equipment, logbook, contest sessions, QSL tracking, and sync metadata.
- **3 storage buckets** — Profile photos, QSL card images, and ADIF file uploads.
- **Supabase client** — `src/lib/supabase.ts` with auth store integration.
- **3-tier sync engine** — Offline write queue with background sync, conflict resolution, and retry with exponential backoff.
- **Auth store** — `src/stores/authStore.ts` for session management (sign up, sign in, sign out, password reset).

#### Navigation

- **Desktop header links** — Profile (person icon) and Shack (flask icon) buttons next to the Settings gear with active state highlighting.
- **Mobile tools drawer** — "My Station" section with Operator Profile and Shack Builder links, separated from the Tools section.
- **Route awareness** — Bottom tab bar highlights Tools tab when on /profile or /shack. Swipe navigation includes new pages.

#### Cleanup

- **Deleted SettingsModal.tsx** — 1,367-line dead code file removed.
- **Settings backup extended** — Export/import now includes shack equipment (antennas, feedlines, accessories, presets).

---

## [0.11.0] — 2026-02-07

### Unified Dashboard, Mobile-First Layout, PWA, and 92% Feature Completion

This release transforms Propulse into a fully operational, mobile-ready Progressive Web App. It replaces the splash page with a data-rich operational dashboard, adds a complete mobile experience with dedicated page variants, introduces a command palette and keyboard shortcuts system, and delivers real-time health monitoring, PWA offline support, and a polished contest operations workflow. Feature delivery reaches 160/173 (92%).

#### Unified Operational Dashboard

- **Home page redesign** — The splash page is replaced with a live operational dashboard showing primary solar metrics (SFI, K-index, SSN, A-index, Bz), a composite Propagation Index with centered gauge score and merged summary, HF band conditions with live DX cluster spot counts, Cluster Pulse activity card, Log Stats with 7-day bar chart, band opening predictions, and this-day-in-history. Everything an operator needs at a glance.
- **Propagation Index** — Composite 0-100 score with animated SVG gauge, score breakdown by SFI/K-index/Bz, and integrated propagation summary with best-bands chips. Replaces the separate Propagation Summary tile.
- **Live spot activity column** — The HF Band Conditions table now shows real-time DX cluster spot counts per band from the last 30 minutes, with color-coded activity indicators (green/amber/gray).
- **Cluster Pulse** — Real-time DX cluster health metrics (spot rate/min, median age, peak band) with data source explainer footer. Scaled-up typography fills the card properly.
- **Log Stats** — Logbook statistics (today/week/month/DXCC/total) with 7-day CSS bar chart and evenly distributed layout.
- **History Card CTA** — For new users without a logbook, a call-to-action links to the logbook page for ADIF import.
- **Data freshness indicators** — "Updated X ago" badges with manual refresh buttons on Home, Solar Pulse, Band Planner, and DX Wizard.

#### Mobile-First Layout

- **Responsive layout switching** — `useIsMobile()` viewport detection with dedicated mobile page variants for all 6 main pages. Three.js globe is isolated from mobile builds for performance.
- **Bottom tab navigation** — 5-tab BottomTabBar with ToolsDrawer for secondary navigation. Touch-friendly 44px minimum targets throughout.
- **6 mobile page variants** — MobileSolarPulse (accordion sections), MobileMap (FlatMapView with slide-up panel), MobileDXWizard (step wizard), MobileLogbook (card-per-QSO), MobileBandPlanner (gradient band cards), MobileContestEntry (optimized for tablets).
- **Pull-to-refresh** — Elastic pull gesture with threshold-triggered data refresh across all mobile pages.
- **Swipe navigation** — Horizontal swipe gestures between adjacent pages with cooldown and vertical guard.
- **Offline indicator** — Amber banner that appears when network connectivity is lost.
- **Mobile settings** — Accordion layout for the settings modal on small screens.
- **PWA install prompt** — `beforeinstallprompt` event capture with dismissible install banner.

#### Progressive Web App

- **Service Worker** — Workbox-powered with precache for app shell and NetworkFirst runtime caching for API requests (5-minute TTL, 50-entry limit).
- **Offline data caching** — IndexedDB cache layer with per-endpoint TTLs for NOAA solar data. Stale data served when offline with freshness indicators.
- **Web app manifest** — Standalone display mode with themed splash screen.
- **Update prompt** — Toast notification when a new version is available with reload/dismiss options.

#### Command Palette & Keyboard Shortcuts

- **Command palette (Cmd+K)** — Quick navigation to any page, action, or setting. Fuzzy search across all registered commands.
- **Global keyboard shortcuts** — Context-aware hotkeys per route. Press `?` for the shortcuts help modal.
- **Focus management** — `*:focus-visible` theme-accent outlines with WCAG 2.1 compliance.

#### Health Monitoring & Reliability

- **Health status indicators** — Per-service health monitoring (NOAA APIs, DX cluster, bridge) with colored dot and dropdown in the header. Aggregates TanStack Query cache states.
- **Sync/retry queue** — Background queue for QSO uploads to eQSL and Club Log with localStorage persistence, 10s polling, and exponential backoff. Status pill in the header.
- **Reduced-motion support** — `scroll-behavior: smooth` gated behind `prefers-reduced-motion: no-preference`.

#### Dashboard Polish & UX

- **Wider band condition columns** — Day/Night columns widened from 70px to 90px with increased gap to prevent badge overlap.
- **Cluster Pulse explainer** — Footer text explaining data source and metric meaning.
- **Scaled-up card metrics** — ClusterPulseCard (text-4xl), LogStatsCard (text-3xl) with `justify-evenly` distribution.
- **React Rules of Hooks fix** — Hooks in BandConditions moved before conditional returns, eliminating the "Expected static flag" console warning.
- **PWA meta tags** — Both `apple-mobile-web-app-capable` and `mobile-web-app-capable` for cross-platform PWA support.
- **VitePWA dev mode** — `devOptions.enabled` for correct manifest serving during development.

#### Additional Features

- **ATNO badges** — All-Time New One diamond badges on DX spot lists and map when an entity hasn't been worked before.
- **Award overlay (WAS)** — Worked All States overlay on the flat map with batched canvas state fills.
- **Interactive tooltips** — 40+ ham radio metric definitions accessible via ⓘ icons on PrimaryMetrics, BandPlanner, DXWizard, and more.
- **Auto-pan to spots** — Map automatically centers on new DX spots with follow toggle and 8-second cooldown.
- **Touch gestures** — Pinch-zoom and drag-to-pan on the 2D flat map via pointer events.
- **Accent color customization** — 8 theme presets in Settings > Appearance with CSS custom property propagation.
- **Contest rate sheet** — Hourly and 10-minute rate views with band-by-hour heatmap matrix.
- **Confidence intervals** — Visual uncertainty bands on propagation forecasts showing prediction reliability.
- **Contest timer enhancement** — Optional end time for open-ended sessions, break-time indicator for 5-minute idle periods.
- **Bearing/distance overlay** — Continuous bearing and distance readout on hover in the flat map.
- **Noise floor settings** — ITU-R P.372 noise environment dropdown (residential, rural, quiet rural, city) in Settings.
- **Antenna pattern integration** — Radiation patterns (dipole, vertical, Yagi, loop) factored into signal predictions.
- **Favorite bands** — Star-toggle on band rows in Band Planner, persisted per user.
- **Recent targets list** — Dropdown in DX Wizard populated from map store history.
- **Contest score sharing** — Unicode-safe base64 share URL with 4-column stats grid and clipboard copy.

---

## [0.10.1] — 2026-02-05

### Spot API Robustness & Band Planner Real-Time UX

#### Spot API Parsing Fixes

- **PSKReporter XML parsing** — Added browser-native DOMParser support so the dev proxy (which returns raw XML from PSKReporter) works seamlessly alongside the JSON Edge Function format in production. Responses are tried as JSON first, falling back to XML automatically.
- **RBN response handling** — HamQTH sometimes returns JSON with non-standard content-type headers (e.g. `text/html`). Responses are now parsed as text first and then attempted as JSON, preventing silent failures from strict content-type checking.
- **Type-safe RBN data access** — Replaced unsafe optional chaining with proper `in` type guards and explicit casts for the RBN spot wrapper format.
- **Unique PSKReporter spot IDs** — Spot IDs now include both sender and receiver callsigns, preventing deduplication collisions when the same station is heard by multiple receivers.

#### Band Planner Enhancements

- **"Right Now" card** — New prominent card at the top of the Band Planner showing the best band at the current UTC hour with status, SNR, and a plain-language operating suggestion.
- **Smart window sorting** — Operating windows are now sorted by relevance: active windows first (ranked by current SNR), then upcoming, then passed. Past windows are dimmed at 50% opacity.
- **Active/upcoming/passed labels** — Each window card shows whether it's currently active, when it opens, or that it has passed — replacing the static "Recommended" label on the first card.
- **Real-time mode and power guidance** — The suggested modes and power guidance sections now reference the current best band's live SNR and status instead of the static peak values from the first window.

---

## [0.10.0] — 2026-02-05

### Contest Mode PropSphere Integration — Ops Console, Voice Entry, and Map Overlays

Deep integration of contest operations into the PropSphere map experience, replacing the DX-only console with a unified operations hub and adding voice-assisted logging.

#### Unified Ops Console

- **Ops Console with DX + Contest tabs** — The bottom panel now switches between DX cluster operations and full contest controls without leaving the map. Run a contest while watching propagation in real time — no more jumping between pages.
- **Contest Dock** — A dockable contest panel that sits alongside the map with entry form, log preview, and score summary. Collapse it when you're hunting DX, expand it when the contest heats up.
- **Contest Run Controls** — Dedicated run/search-and-pounce mode toggle with visual indicators so you always know your operating posture.
- **End Contest Modal** — Clean session wrap-up with confirmation dialog showing final stats before closing out.

#### Voice-Driven Contest Entry

- **Voice entry via Web Speech API** — Say "november one mike mike five nine oh five" and watch it populate the callsign and exchange fields. Uses the browser's built-in speech recognition — no external services or API keys needed.
- **Transcript-to-entry pipeline** — Raw voice transcripts are parsed into candidate entries with callsign, RST, and exchange extraction. Review before applying so misheard words don't cost you a QSO.
- **Voice controls and hotkeys** — Toggle voice on/off with a global hotkey. Visual indicators show when the mic is active and what's been recognized.
- **Contest Voice Manager** — Coordinates voice state across components — handles mic access, transcript buffering, and automatic silence detection.

#### Contest Map Overlays

- **Renderer-agnostic overlay system** — A shared overlay model that works across globe, flat map, and azimuthal views. Contest markers render consistently regardless of which projection you're using.
- **Contest overlay engine** — Highlights needed multipliers directly on the map. See at a glance which DXCC entities or zones you still need, color-coded by priority.
- **3D overlay layers** — Globe-specific overlay rendering with proper occlusion and depth so contest markers don't float in space.

#### Lite Mode & Mobile Contest

- **Contest Lite HUD** — A minimal heads-up display pill that floats over the map showing your score, QSO count, and current rate. Maximum map visibility with just enough contest info.
- **Lite HUD bottom sheet** — Swipe up from the Lite HUD pill to get a quick-entry form without leaving the map view. Log a contact and dismiss — the map never leaves your sight.
- **Pending draft replace banner** — When a spot prefills your entry form while you're mid-contact, a banner warns you instead of silently overwriting your work.

#### Shared State & Reliability

- **Contest UI Store** — Per-session band, mode, one-line drafts, and dock tab selection persist across route changes and component remounts. Switch from Contest page to PropSphere and back without losing your place.
- **Contest event bus** — Typed events for session lifecycle, QSO mutations, and mode changes. Optional BroadcastChannel mirroring lets multiple browser tabs stay in sync.
- **Idempotent QSO logging** — Action IDs prevent duplicate submissions from double-clicks, key repeats, or race conditions. Every contact is logged exactly once.
- **Spot-to-entry prefill** — Click a DX spot on the map or band map to prefill the contest entry form with callsign, band, and mode. Respects your run/S&P preference.
- **Global contest hotkeys** — Focus the entry field and toggle voice from anywhere in the app, not just the Contest page.

---

## [0.9.0] — 2026-02-05

### 37-Feature Implementation — Propagation Physics, QSL Services, Contest Engine, and Advanced Dashboard

This release delivers a comprehensive upgrade to every major subsystem: physics-based propagation modeling, encrypted QSL credential management, a full contest scoring engine, satellite Doppler calculations, and an advanced customizable dashboard.

#### Propagation Physics Engines

- **Multi-hop ray trace engine** — Implements Martyn's secant law for Maximum Usable Frequency (MUF) with D-layer absorption modeling. Computes ionospheric refraction paths for up to 5 hops, giving you realistic signal predictions instead of lookup-table estimates.
- **Geomagnetic latitude model** — IGRF-13 coordinate transforms that calculate your true geomagnetic latitude. Critical for accurate auroral zone predictions and understanding why high-latitude paths degrade during geomagnetic storms.
- **ITU-R P.372 noise model** — Computes atmospheric, galactic, and man-made noise floors per band and location. When the DX Wizard says "80m will be noisy tonight," it's using real ITU noise curves, not guesswork.
- **Antenna pattern library** — Radiation patterns for dipole, vertical, Yagi, and loop antennas with gain calculations. The path analysis now factors in your actual antenna's performance at different takeoff angles.
- **Propagation mode classifier** — Automatically identifies whether a path uses ground wave, NVIS, single-hop F2, multi-hop skip, or greyline propagation. Each mode has different characteristics that affect your operating strategy.
- **Terrain-aware path analysis** — Integrates elevation profiles into signal predictions. A mountain range between you and Europe matters — now the model accounts for it.

#### QSL Services & Encrypted Credentials

- **Encrypted credential vault** — Your LoTW and eQSL passwords are stored using AES-256-GCM encryption with PBKDF2 key derivation (100,000 iterations). Set a passphrase, and credentials auto-lock after 30 minutes of inactivity. No more plaintext passwords in localStorage.
- **LoTW integration** — Upload ADIF records and download QSL confirmations directly from the app. Confirmations are cross-referenced with your DXCC tracking to identify newly confirmed entities.
- **eQSL integration** — Upload logs and check your eQSL inbox through proxied edge functions. Incoming confirmations are parsed and displayed in the QSL Manager.
- **Unified QSL Manager panel** — One interface to manage LoTW, eQSL, and Club Log sync. See confirmation stats, trigger syncs, and track upload history across all services.

#### Contest Operations

- **19 contest definitions** — ARRL DX, CQ WPX, CQWW, IARU HF Championship, ARRL Field Day, Sweepstakes, All Asian DX, WAE, NAQP, Sprint, ARRL 10-Meter, ARRL 160-Meter, Stew Perry, CQ 160, RAC Canada Day, Oceania DX, SAC, and more. Each with correct exchange formats, point rules, and multiplier definitions.
- **Automatic dupe checking** — The contest engine flags duplicate contacts in real-time based on each contest's specific dupe rules (per-band, per-mode, or combined).
- **Multiplier extraction** — Automatically identifies new multipliers (DXCC entities, zones, states, etc.) as you log contacts and highlights them so you know when to prioritize a new mult.
- **Mobile contest entry** — Touch-optimized interface with 44px minimum touch targets, large callsign input, and mode-dependent RST defaults (59 for phone, 599 for CW/digital). Designed for tablets at Field Day.
- **ADIF import profiles** — Configurable field mapping for importing logs from other software. Map your ADIF fields to Propulse's format and save the profile for repeated imports.

#### Satellite & Specialized Propagation

- **Satellite Doppler calculator** — Real-time frequency correction for satellite passes. As a satellite moves across the sky, the uplink and downlink frequencies shift — this calculates the exact correction so you stay on frequency.
- **Sporadic-E alert service** — Monitors spot activity for signs of sporadic-E openings on 6m and 10m. When Es conditions appear, you get notified so you can jump on the band before the opening fades.
- **DXCC entity database** — Complete database of ~340 DXCC entities with prefix matching. Type a callsign and instantly see the entity, continent, and whether you need it.
- **DXCC tracking store** — Track worked and confirmed status per entity, per band, per mode. See your DXCC progress at a glance and know exactly what you still need.

#### Intelligence & Correlation

- **Spot-model correlation engine** — Compares live DX cluster spots against the propagation model's predictions. If the model says 15m is closed but spots are appearing, it flags the discrepancy and adjusts confidence scores.
- **Model accuracy dashboard** — Shows per-band prediction confidence with an overall accuracy score. "Model is 82% accurate today" or "Caution: predictions need verification" — so you know how much to trust the forecasts.
- **Anomaly detection** — Automatically detects surprise band openings, sudden activity bursts, activity drops, and model overestimates. Anomalies appear as alerts so you can react to changing conditions.
- **Condition match card** — Finds historical dates with similar propagation conditions to today and shows what DX was worked. "Conditions today are similar to January 15 when operators worked JA on 20m" — gives you concrete operating targets.

#### UX & Workflow Polish

- **Smart notifications** — Configurable alerts for band openings, DX spots matching your needs list, and contest multiplier opportunities. Set your criteria and get notified when it matters.
- **Forecast confidence intervals** — Visual uncertainty bands on propagation forecasts so you can see not just the prediction but how reliable it is.
- **Bearing/distance overlay** — Great circle path lines on the map showing exact bearing and distance to your target.
- **QSO scheduling system** — Create skeds with target callsigns, pick your band and mode, set a date range. Track whether you worked them, missed them, or need to reschedule.
- **Keyboard shortcuts** — Navigate the spot list, select spots, and perform quick actions without reaching for the mouse during pileups.

#### Advanced Dashboard Features

- **BandScope waterfall** — When connected to WSJT-X, see decoded signals as colored dots across the audio passband. Signal strength is color-coded so strong stations pop visually. Appears automatically in PropSphere when WSJT-X is connected.
- **Draggable panel system** — Dashboard panels can be collapsed, hidden, or reordered with hover controls. Customize your operating view to show only what matters during a session.
- **Layout manager** — Save and load dashboard configurations. Switch between a contest layout, DX hunting layout, or casual monitoring setup.

#### Security & Quality

- **Credentials moved to POST body** — LoTW and eQSL passwords are no longer sent as URL query parameters. All credential-bearing requests now use POST with JSON body, preventing exposure in server logs and browser history.
- **Type-safe spot correlation** — Eliminated unsafe type casts in the correlation engine with a proper `CorrelationSpot` interface. The model accuracy panel now uses structural typing instead of forced casts.
- **Canvas Retina support** — The BandScope waterfall renders crisply on high-DPI displays using proper devicePixelRatio scaling.
- **Alert memory management** — Dismissed sporadic-E alerts are automatically pruned after one hour to prevent unbounded memory growth during long operating sessions.

---

## [0.8.0] — 2026-02-04

### PropSphere Visual Overhaul & Map Enhancements

Major visual refresh of the PropSphere map experience with new projections, satellite tracking, and comprehensive labeling.

- **Azimuthal equidistant projection** — New map projection centered on your QTH, showing true bearings and distances. Essential for antenna pointing and understanding great circle paths.
- **Satellite tracking layer** — Live satellite positions overlaid on the map with orbit traces and pass predictions.
- **Satellite/standard map style toggle** — Switch between standard terrain and satellite imagery basemaps.
- **Configurable propagation forecast** — 24-hour band condition forecast with per-band confidence scoring and greyline countdown timer.
- **DX console panel cards** — Expandable detail modals for each DX console metric with historical context and trend data.
- **Spot detail panel** — Click any DX spot for a detailed flyout showing propagation analysis, trend sparklines, and one-click QSY.
- **Unified insights strip** — Consolidated bottom bar showing spot count, band activity, and operating suggestions at a glance.
- **Pin hover detection and flyout** — Hover over any map pin to see details without clicking. Edit mode for managing saved pins.
- **Visual style system** — Band-specific coloring throughout the UI, greyline zone visualization, and a compact band activity grid.
- **DX news ticker** — Scrolling feed of DX expedition and special event announcements.
- **Comprehensive country labels** — Every country labeled on the map with smart occlusion to prevent overlap. Labels stack when close together and fade based on zoom level.
- **High-Viz 2D mode** — High contrast map preset optimized for readability in bright operating environments.

---

## [0.7.0] — 2026-02-04

### Globe Rendering & Label Readability

- **Globe occlusion system** — Labels and pins on the far side of the globe fade and hide properly. No more seeing through the earth.
- **Dark-pill label style** — Spot labels use a consistent dark background pill style across both 2D and 3D views for readability.
- **Label stacking** — Nearby labels stack vertically instead of overlapping, so you can read every callsign even in crowded areas.
- **Fixed occlusion thresholds** — Consistent fade behavior regardless of zoom level.

---

## [0.6.0] — 2026-02-03

### Contest Engine & DX Operations

A complete contest logging system and major DX operations improvements.

#### Contest Engine (8-Phase Build)

- **Contest engine foundation** — Score computation, multiplier tracking, and Cabrillo export framework.
- **Composable UI panels** — Modular contest panels (entry form, log view, score display, multiplier tracker) that can be arranged for your workflow.
- **Keyboard-first contest entry** — Tab through fields, Enter to log, function keys for common actions. Designed for high-rate CW contesting.
- **Strategy layer** — Real-time multiplier needs display, band-change suggestions based on rate and multiplier availability.
- **Spots/bandmap integration** — DX cluster spots filtered by contest relevance with one-click QSY to spotted stations.
- **Interoperability** — Cabrillo export, ADIF export, and N1MM-compatible UDP broadcast for integration with existing contest software.
- **ProPulse Bridge** — Local WebSocket server for rig control (CAT), WSJT-X integration, and DX cluster telnet connections. Runs on localhost only.

#### DX Operations

- **Watch alert audio notifications** — Audible alerts when a watched callsign or entity appears in the DX cluster.
- **DX cluster spot management** — Band sync, spot aging, and spot filtering by mode/band/continent.
- **Map keyboard shortcuts** — Quick grid input, keyboard-driven map navigation, and shortcut overlay (press `?`).
- **Spot clustering** — Nearby spots on the globe are grouped into clusters at low zoom levels to reduce visual clutter.
- **Compass rose overlay** — Bearing reference overlay on the PropSphere globe.
- **Greyline and path visualization** — Enhanced greyline rendering with smooth day/night transitions and great circle path lines.
- **Comprehensive QOL features** — Dozens of small improvements: better tooltips, smoother animations, responsive panel sizing, and more.
- **Pin markers** — Drop distinctive pins on the map for locations of interest with clear-all functionality.
- **Modular DXSpotList** — Refactored into composable modules (sorting, filtering, state management) for better performance.

---

## [0.5.0] — 2026-02-02

### Solar Dashboard & Accessibility

- **Geomagnetic storm alert system** — Automatic alerts for solar events affecting HF propagation with severity classification (minor/moderate/major/extreme).
- **Text accessibility system** — Configurable font sizes and high-contrast mode for operators with visual needs.
- **PropSphere panel redesign** — Unified panel styling with consistent spacing, typography, and interaction patterns.
- **DX Operations Console** — Dedicated console with BandMap, spot focus mode, and quick-action buttons.
- **Enhanced spot list** — Improved sorting, band filtering, and operator insights integration.
- **Map pins and watch list** — Save locations and callsigns for monitoring. Globe UX upgrades including smoother rotation and better click detection.
- **Expanded solar dashboard** — New chart modals for K-index, A-index, Bz, and solar flux with interactive zoom and time range selection.

---

## [0.4.0] — 2026-02-01

### Solar Weather & Band Planning

- **Comprehensive solar dashboard** — Real-time K-index, solar flux, sunspot number, Bz, and flare probability with auto-updating charts.
- **Band planner** — Plan your operating based on current band conditions with license class and ITU region awareness.
- **Redesigned PropSphere entry point** — Cleaner Pro View access with contextual help and onboarding.
- **Contest logging** — Initial contest QSO logging with HamQTH callbook integration.
- **Cloud sync** — Foundation for syncing settings and logs across devices.
- **Sherwood radio database** — Comprehensive receiver performance data for 200+ radios, integrated with the radio picker for meaningful comparison.
- **Guest logging** — Support for Field Day and shack visitor logging under a guest callsign.

---

## [0.3.0] — 2026-02-01

### DX Wizard & Radio Profiles

- **DX Wizard** — Enter a target location (grid square, coordinates, city name, or callsign), pick your mode and constraints, and get actionable transmit guidance: recommended band, required power, target frequency, and operating tips.
- **Radio picker** — Select from 200+ radios in the database or create custom radio profiles. Radio capabilities (bands, modes, max power) automatically constrain the DX Wizard recommendations.
- **Custom radio profiles** — Define your own radio with specific band coverage, power limits, and receiver specs for operators with modified or homebrew equipment.

---

## [0.2.0] — 2026-01-31

### PropSphere Interactive Map

- **PropSphere globe view** — 3D interactive globe with real-time DX spot plotting, day/night terminator, and great circle path rendering.
- **PropSphere flat map** — 2D Mercator projection with the same spot overlay capabilities for operators who prefer a flat view.
- **WebGL azimuthal renderer** — Hardware-accelerated azimuthal equidistant projection for true bearing visualization.
- **Night lights layer** — City lights visible on the dark side of the globe for geographic reference.
- **Labels layer** — Configurable country, city, and grid square labels.
- **Live DX spots** — Real-time spot feed from DX cluster with band/mode filtering and spot age indicators.
- **Path analysis** — Click any spot to see the great circle path, distance, bearing, and estimated propagation conditions.
- **Band conditions panel** — Current HF band status based on solar indices with confidence indicators.
- **Recommendations panel** — Suggested bands and operating modes based on your location, target, and current conditions.
- **Time control** — Scrub forward/backward in time to see how propagation conditions change throughout the day.

---

## [0.1.0] — 2026-01-31

### Initial Release

- **Project foundation** — Vite + React + TypeScript with Tailwind CSS dark theme.
- **Solar dashboard** — K-index, solar flux, and basic band condition display using NOAA SWPC data.
- **Routing** — SPA with React Router: Home, Solar Pulse, PropSphere, DX Wizard, Band Planner, Logbook, and Contest pages.
- **Design system** — Custom color tokens (signal-green, plasma-orange, caution-amber, alert-red, cosmic-cyan, aurora-purple) with Orbitron headings and backdrop-blur panels.
- **Responsive layout** — Mobile-first design with collapsible sidebar navigation.
- **Vercel Edge Functions** — API proxy layer for NOAA, callsign lookup, and QSL services to avoid CORS issues.

---

[0.12.0]: https://github.com/crypticpy/propulse/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/crypticpy/propulse/compare/v0.10.0...v0.11.0
[0.10.1]: https://github.com/crypticpy/propulse/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/crypticpy/propulse/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/crypticpy/propulse/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/crypticpy/propulse/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/crypticpy/propulse/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/crypticpy/propulse/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/crypticpy/propulse/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/crypticpy/propulse/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/crypticpy/propulse/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/crypticpy/propulse/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/crypticpy/propulse/releases/tag/v0.1.0
