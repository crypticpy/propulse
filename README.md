<p align="center">
  <img src="public/propulse.svg" alt="Propulse" width="100" height="100">
</p>

<h1 align="center">Propulse</h1>

<p align="center">
  <strong>The Ionosphere, Visualized.</strong><br>
  A real-time ham radio propagation dashboard, DX operations console, and contest logging platform.
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#getting-started">Getting Started</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#propsphere-bridge">Bridge Server</a> &bull;
  <a href="CHANGELOG.md">Changelog</a>
</p>

---

## Overview

Propulse gives amateur radio operators a single interface for monitoring solar weather, visualizing HF propagation, hunting DX, and running contests. It combines real-time data from NOAA, DX cluster networks, PSK Reporter, and the Reverse Beacon Network with physics-based propagation modeling to deliver actionable operating guidance.

**Key capabilities:**

- **Operational Dashboard** -- Transparent Global Conditions Score, heuristic band guidance with DX cluster spot counts, source-aged solar metrics, cluster pulse, log stats with 7-day activity chart, and operating projections -- all on the home screen
- **PropSphere** -- Interactive 3D globe, 2D flat map, and azimuthal equidistant projection with live DX spot overlays, great circle paths, day/night terminator, and award overlays
- **Solar Pulse** -- Source-attributed Kp, solar flux, X-ray, Bz, alert, forecast, and imagery products with explicit freshness and outage states
- **DX Wizard** -- Enter a target location and get recommended band, power, frequency, and operating tips based on propagation physics with antenna gain modeling
- **Contest Engine** -- 19 built-in contest definitions with real-time scoring, dupe checking, multiplier tracking, rate sheet, and Cabrillo export
- **Operator Profile** -- 4-tab profile page with completeness ring, callsign auto-fill, markdown bio, social links, awards progress rings (DXCC/WAS/WAZ), activity heatmap, and QR code sharing
- **Shack Builder** -- 7-tab equipment manager with antenna/feedline/accessory CRUD, station presets with per-band ERP computation, feedline loss engine, signal chain diagram, and performance dashboard
- **Settings** -- Full-page settings with 5 sections, high contrast mode, band presets, custom accent colors, and granular propagation/map controls
- **Logbook** -- QSO logging with DXCC tracking, ADIF import/export, and unified QSL management (LoTW, eQSL, Club Log)
- **Mobile-First PWA** -- Dedicated mobile layouts for all pages, offline support, install prompt, pull-to-refresh, swipe navigation, and 44px touch targets
- **ProPulse Bridge** -- Local WebSocket server for rig control (CAT), WSJT-X integration, and DX cluster telnet

---

## Features

### Operational Dashboard

The home page is a live operational view designed for at-a-glance situational awareness:

- Transparent Global Conditions Score with evidence coverage and disclosed inputs
- HF Band Conditions table with live DX cluster spot counts per band
- Primary solar metrics: observed SFI, official planetary Kp, monthly SSN, and IMF Bz
- Cluster Pulse showing spot rate, median age, and peak band from the DX cluster
- Log Stats with today/week/month/DXCC/total and 7-day activity bar chart
- Band opening predictions based on current solar conditions
- This Day in History showing past DX contacts on today's date
- Data freshness indicators with manual refresh buttons

### PropSphere -- Interactive Propagation Map

| View            | Description                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| **3D Globe**    | Photorealistic Earth with day/night terminator, night lights, country labels, and real-time DX spot plotting |
| **2D Flat Map** | Mercator projection with full feature parity -- spot overlays, paths, pins, and panels                       |
| **Azimuthal**   | Hardware-accelerated WebGL projection centered on your QTH showing true bearings and distances               |

- Live DX spots from DXHeat, PSK Reporter, and Reverse Beacon Network
- Great circle path rendering with bearing and distance
- MUF overlay, Sporadic-E visualization, and Aurora (OVATION) layer
- Satellite tracking with orbit traces
- Band conditions panel with path-aware propagation projections
- Time scrubber to visualize propagation changes throughout the day
- Pin markers, spot clustering, compass rose, and mini-map navigator
- Contest overlay engine showing needed multipliers on the map

### Solar Pulse -- Space Weather Dashboard

- Official planetary Kp observations, estimates, and predictions kept visibly distinct
- Chronological observed solar-flux, Bz, and monthly sunspot histories
- Official SWPC scales, alerts, flare probabilities, proton flux, X-ray flux, Dst, and D-RAP context
- Transparent general HF guidance based only on available evidence—never presented as a station-to-station forecast
- Cache-stable NOAA and NASA imagery with retry, age limits, and bounded on-demand animations
- Per-widget observation time, provider attribution, refresh, stale-data, partial-data, and unavailable states

### DX Wizard -- Propagation Analysis

- Target input by grid square, coordinates, city name, or callsign
- Multi-hop ray trace engine (Martyn's secant law) with D-layer absorption
- IGRF-13 geomagnetic latitude model
- ITU-R P.372 noise model for atmospheric and man-made noise floors
- Antenna pattern library (dipole, vertical, Yagi, loop)
- Radio-aware recommendations using the Sherwood Engineering database (200+ radios)
- NVIS analysis for near-vertical incidence skywave

### Contest Engine

- **19 contest definitions** -- ARRL DX, CQ WPX, CQWW, IARU HF, Field Day, Sweepstakes, All Asian, WAE, NAQP, Sprint, and more
- Real-time scoring with automatic multiplier extraction
- Automatic dupe checking per contest-specific rules
- Keyboard-first entry (Tab/Enter flow) and mobile-optimized touch interface
- Band map with DX cluster integration and one-click QSY
- Super Check Partial (SCP) for fast callsign lookup
- Cabrillo export, ADIF export, N1MM-compatible UDP broadcast
- Voice-driven contest entry via Web Speech API
- Contest Lite HUD and Contest Dock for map-integrated operation
- Multi-tab sync via BroadcastChannel
- Off-time tracking, QTC handling, call history import, and audit queue

### Operator Profile

Your station identity, achievements, and operating statistics in one place:

- Profile completeness ring with weighted scoring (callsign, name, grid, license, photo, bio, social links, radio)
- Callsign auto-fill via HamQTH lookup with one-click suggestions for name and grid
- Markdown bio editor with XSS-safe rendering (bold, italic, links, lists)
- Social links manager for QRZ, HamQTH, Twitter, YouTube, GitHub, and custom URLs
- License card with class badge, country flag, and expiration progress bar
- Awards tab with DXCC/WAS/WAZ progress rings showing worked vs. confirmed
- Stats tab with 365-day activity heatmap, QSO by mode donut chart, and band distribution bars
- QR code sharing with plasma-orange styling and error correction level H

### Shack Builder

Full equipment inventory, station presets, and RF performance analysis:

- 7-tab interface: Overview, Radios, Antennas, Feedlines, Accessories, Presets, Performance
- Antenna manager with 22 types, per-installation metadata (height, azimuth, polarization, mounting)
- Feedline manager with 8 cable types (RG-58 through hardline), inline loss display per band
- Feedline loss engine using sqrt(f) interpolation, connector loss, condition multipliers, and SWR mismatch modeling
- Accessory manager for amplifiers, tuners, filters, switches, power supplies, and grounding
- Station presets combining radio + antenna + feedline + accessories with live per-band ERP preview
- Performance dashboard with per-band capability matrix and signal chain waterfall
- SVG signal chain diagram (Radio → Accessories → Feedline → Antenna)
- Active station gain hook integrating presets into all map propagation calculations

### Settings

Comprehensive configuration with 5 sections:

- Preferences: visual style, high contrast, map/globe sub-settings, propagation projection controls, band presets (up to 5)
- Appearance: custom accent colors with live preview and 8 theme presets
- Notifications: sub-group headers, quiet hours with UTC hour selectors
- Data: settings backup/restore including all shack equipment
- About: version info and project details
- Shared UI primitives (SegmentedButton, SettingSlider, SettingRow) with full ARIA compliance

### Logbook & QSL Services

- QSO entry with HamQTH callbook integration
- DXCC tracking (worked + confirmed per entity/band/mode)
- ADIF import/export with configurable field mapping
- Unified QSL Manager for LoTW, eQSL, and Club Log
- AES-256-GCM encrypted credential vault with PBKDF2 key derivation
- Guest logging for Field Day and shack visitors

### Band Planner

- Current HF/VHF/UHF band conditions overview
- License class filtering (Technician, General, Extra)
- ITU region awareness for international regulatory compliance
- Favorite bands with star-toggle for quick filtering
- Modeled SNR ranges plus qualitative evidence coverage

### Mobile & PWA

Propulse is a fully installable Progressive Web App with dedicated mobile experiences:

- **6 mobile page variants** optimized for touch with 44px minimum targets
- Bottom tab navigation with tools drawer for secondary pages
- Pull-to-refresh and horizontal swipe navigation between pages
- Offline support with IndexedDB data caching and offline indicator
- PWA install prompt with standalone display mode
- Lazy-loaded routes (main bundle: 435 KB) with Three.js isolated from mobile builds

### Command Palette & Shortcuts

- **Cmd+K command palette** with fuzzy search across navigation, actions, and settings
- Context-aware keyboard shortcuts per route (press `?` for help)
- WCAG 2.1 focus indicators with theme-accent outlines
- Health status indicators for API and bridge connections in the header
- Sync/retry queue with background upload processing and status display

---

## Getting Started

### Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later

### Installation

```bash
git clone https://github.com/crypticpy/propulse.git
cd propulse
npm install
```

### Development

```bash
npm run dev
```

Opens the app at `http://localhost:5173` with hot module replacement.

### Production Build

```bash
npm run build
npm run preview   # serve the production build locally
```

### Linting

```bash
npm run lint
```

### ProPulse Bridge (Optional)

The bridge server enables rig control, WSJT-X integration, and DX cluster telnet. It runs locally and communicates with the frontend via WebSocket.

```bash
cd bridge
npm install
npm run dev       # starts on ws://localhost:9867
```

See [bridge/README.md](bridge/README.md) for protocol documentation and architecture details.

---

## Architecture

```
propulse/
├── api/                    Vercel Edge Functions (API proxies)
│   ├── solar/              NOAA SWPC data (K-index, flux, sunspots, Bz)
│   ├── spots/              DX cluster, PSK Reporter, RBN
│   ├── callsign/           HamQTH, callook.info, Club Log
│   ├── log/                LoTW, eQSL, Club Log upload
│   └── contest/            Super Check Partial lookup
│
├── bridge/                 Local WebSocket server (Node.js)
│   └── src/
│       ├── server.ts       WebSocket server + message routing
│       ├── cluster.ts      DX Cluster telnet client
│       ├── wsjtx.ts        WSJT-X UDP listener
│       └── rig.ts          Rig control (CAT via Hamlib)
│
├── src/
│   ├── pages/              10 route-level pages
│   ├── components/         Feature and UI components
│   │   ├── map/            Globe, flat map, azimuthal, overlays (75 files)
│   │   ├── contest/        Contest entry, scoring, band map (36 files)
│   │   ├── dx/             DX console, spots, band scope (24 files)
│   │   ├── solar/          Charts, metrics, propagation index (22 files)
│   │   ├── profile/        Operator profile, awards, stats, QR code (19 files)
│   │   ├── shack/          Equipment managers, presets, performance (10 files)
│   │   ├── settings/       Settings sections, UI primitives (20 files)
│   │   ├── ui/             Shared primitives (Badge, Card, Modal)
│   │   └── ...
│   ├── hooks/              48 custom hooks (data fetching, UI logic)
│   ├── stores/             21 Zustand stores (client state)
│   ├── lib/
│   │   ├── utils/          Propagation physics, scoring, helpers
│   │   ├── contest/        Contest engine (scoring, dupes, SCP)
│   │   ├── api/            API client modules
│   │   ├── data/           Static data (band plans, DXCC, radios)
│   │   ├── db/             IndexedDB (credential vault, log store)
│   │   └── services/       Alert service, band opening detection
│   └── types/              TypeScript type definitions
│
├── public/                 Static assets (textures, icon)
├── scripts/                Data generation scripts
└── docs/                   Design documents and PRDs
```

### Tech Stack

| Layer             | Technology                                      |
| ----------------- | ----------------------------------------------- |
| **UI**            | React 18, TypeScript, Tailwind CSS              |
| **3D Rendering**  | Three.js, @react-three/fiber, @react-three/drei |
| **State**         | Zustand (21 stores)                             |
| **Server State**  | TanStack React Query                            |
| **Routing**       | React Router DOM 7                              |
| **Build**         | Vite 6                                          |
| **Deployment**    | Vercel (Edge Functions + SPA)                   |
| **Bridge Server** | Node.js, ws (WebSocket)                         |
| **Local Storage** | IndexedDB (via idb)                             |
| **Encryption**    | Web Crypto API (AES-256-GCM, PBKDF2)            |

### Data Sources

| Source                 | Data                                                         |
| ---------------------- | ------------------------------------------------------------ |
| NOAA SWPC              | K-index, solar flux, sunspot number, Bz, flare probabilities |
| NOAA OVATION           | Aurora oval data                                             |
| HamQTH DX Cluster      | DX cluster spots                                             |
| PSK Reporter           | Digital mode reception reports                               |
| Reverse Beacon Network | CW/digital skimmer spots                                     |
| HamQTH / callook.info  | Callsign lookup                                              |
| LoTW / eQSL / Club Log | QSL confirmation services                                    |
| Sherwood Engineering   | Radio receiver performance data                              |

### Local Integrations (via Bridge)

| System       | Protocol         | Purpose                          |
| ------------ | ---------------- | -------------------------------- |
| Hamlib       | CAT (serial/TCP) | Rig frequency, mode, PTT control |
| WSJT-X       | UDP (port 2237)  | Decode reception, auto-logging   |
| DX Cluster   | Telnet           | Real-time DX spots               |
| N1MM Logger+ | UDP broadcast    | Contest interoperability         |

---

## Deployment

Propulse is configured for deployment on [Vercel](https://vercel.com):

```bash
npm run build           # produces dist/
vercel --prod           # deploy to production
```

The `api/` directory contains Vercel Edge Functions that proxy external APIs (NOAA, DXHeat, callsign services, QSL services) to avoid CORS restrictions. These functions run at the edge with no cold start.

---

## Accessibility

- WCAG 2.1 keyboard focus indicators
- Configurable text scaling (small / medium / large)
- High contrast mode
- Colorblind-friendly theme options
- `prefers-reduced-motion` and `prefers-contrast: more` support
- 44px minimum touch targets for mobile contest entry

---

## Security

- AES-256-GCM encrypted credential vault for QSL service passwords
- PBKDF2 key derivation with 100,000 iterations
- Auto-lock after 30 minutes of inactivity
- Bridge server binds to localhost only (127.0.0.1)
- All credential-bearing API requests use POST with JSON body
- CORS-aware Edge Functions with explicit origin allowlist
- No secrets in client-side code

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes following the existing code style (TypeScript strict, 2-space indent, Tailwind CSS)
4. Verify: `npm run lint && npm run build`
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, `docs:`)
6. Open a pull request with a summary, testing notes, and screenshots for UI changes

See [AGENTS.md](AGENTS.md) for detailed repository guidelines.

---

## License

This project is not yet licensed. All rights reserved.

---

<p align="center">
  Built for the amateur radio community. 73 de Propulse.
</p>

### Local testing with multiple agents

See [Local agent testing](docs/guides/LOCAL-AGENT-TESTING.md) for owned dev servers, isolated browser profiles, login/first-visit setup, and the HamClock regression check.
