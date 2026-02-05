# Changelog

All notable changes to **Propulse** are documented here. Propulse is a real-time ham radio propagation dashboard, DX operations console, and contest logging platform built for amateur radio operators.

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
