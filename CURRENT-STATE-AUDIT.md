# Propulse Ham Radio Toolset - Current State Audit

**Audit Date:** January 31, 2026
**Working Directory:** `/Users/aiml/Projects/propulse-dev`

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Feature Inventory - Built and Working](#feature-inventory---built-and-working)
3. [Partial Implementations](#partial-implementations)
4. [UI Components Available](#ui-components-available)
5. [API Integrations Active](#api-integrations-active)
6. [State Management](#state-management)
7. [Data Utilities and Libraries](#data-utilities-and-libraries)
8. [Known Issues and Bugs](#known-issues-and-bugs)

---

## Executive Summary

Propulse is a ham radio propagation visualization tool built with React, TypeScript, Vite, and Three.js. The application has three main pages:

1. **Home** - Landing page with entry point to Solar Dashboard
2. **Solar Pulse** (`/solar`) - Solar weather dashboard with NOAA data
3. **PropSphere** (`/map`) - Interactive propagation map with 3D globe, 2D flat map, and azimuthal projections

The application fetches live data from NOAA SWPC via Vercel Edge Function proxies, and can optionally fetch spot data from PSKReporter and Reverse Beacon Network.

---

## Feature Inventory - Built and Working

### 1. Solar Dashboard (SolarPulse Page)

**Location:** `/Users/aiml/Projects/propulse-dev/src/pages/SolarPulse.tsx`

| Feature           | Status  | Description                                               |
| ----------------- | ------- | --------------------------------------------------------- |
| K-Index Display   | Working | Shows current Kp index (0-9 scale) with real-time updates |
| Solar Flux Index  | Working | Shows current 10.7 cm radio flux (SFI)                    |
| Sunspot Number    | Working | Displays current SSN                                      |
| A-Index Display   | Working | Calculated from Kp via `kpToAp()` conversion              |
| Bz IMF Display    | Working | Shows interplanetary magnetic field Bz component          |
| K-Index Chart     | Working | Time-series chart of Kp values with Recharts              |
| Solar Flux Chart  | Working | Time-series chart of SFI values                           |
| Band Conditions   | Working | Estimated HF band openings based on Kp/SFI                |
| Flare Probability | Working | C/M/X-class flare probability from NOAA                   |
| Solar Summary     | Working | Plain-language summary of current conditions              |
| Expandable Modals | Working | All cards have expandable detail modals                   |

**Data Sources:**

- K-Index: NOAA `planetary_k_index_1m.json` (1-minute refresh)
- Solar Flux: NOAA `f107_cm_flux.json` (4-hour refresh)
- Probabilities: NOAA forecast probabilities (6-hour refresh)
- Sunspots: NOAA sunspot data (6-hour refresh)
- Magnetometer: NOAA solar wind data (1-minute refresh)

### 2. Propagation Map (PropSphere Page)

**Location:** `/Users/aiml/Projects/propulse-dev/src/pages/PropSphere.tsx`

#### Map Views

| Feature        | Status  | Description                                                          |
| -------------- | ------- | -------------------------------------------------------------------- |
| 3D Globe View  | Working | Three.js-based interactive globe with NASA Blue Marble texture       |
| 2D Flat Map    | Working | Canvas-based equirectangular projection                              |
| Azimuthal View | Working | WebGL + Canvas azimuthal equidistant projection centered on user QTH |
| View Switching | Working | Tabs to switch between globe/flat/azimuthal                          |

#### Map Overlays

| Overlay              | Status  | Description                                                      |
| -------------------- | ------- | ---------------------------------------------------------------- |
| Day/Night Terminator | Working | Shows terminator line based on actual subsolar point calculation |
| Night Side Darkening | Working | Gradual darkening on night side of Earth                         |
| Greyline Band        | Working | Golden/amber twilight zone (75-105 degrees from subsolar)        |
| Aurora Overlay       | Working | NOAA OVATION aurora probability data visualization               |
| MUF Overlay          | Working | Color-coded Maximum Usable Frequency grid based on SFI           |
| Night Lights         | Working | City lights visualization on dark side                           |
| Labels Overlay       | Working | Country borders and major city names                             |
| Live Spot Arcs       | Working | Curved arcs showing DX spots on map                              |

#### Map Interactions

| Feature                | Status  | Description                                  |
| ---------------------- | ------- | -------------------------------------------- |
| Click to Select Target | Working | Click anywhere on map to set target location |
| Path Arc Display       | Working | Great circle path between home and target    |
| Scroll Wheel Zoom      | Working | Zoom in/out on 2D and azimuthal views        |
| Panel Resize (Desktop) | Working | Drag handles to resize left/right panels     |
| Panel Collapse         | Working | Collapse/expand side panels                  |
| Layer Presets          | Working | DX Hunter, Contest, VHF, Emergency presets   |
| Layer Toggles          | Working | Toggle individual overlays on/off            |

#### Path Analysis Panel

| Feature                 | Status  | Description                                       |
| ----------------------- | ------- | ------------------------------------------------- |
| Path Distance           | Working | Great circle distance calculation                 |
| Bearing                 | Working | Heading to target                                 |
| Difficulty Indicator    | Working | Easy/Moderate/Difficult/Extreme based on distance |
| Difficulty Color Coding | Working | Green/yellow/orange/red markers and paths         |
| Short/Long Path Toggle  | Planned | UI exists but toggle not fully functional         |

#### Band Conditions Panel

| Feature         | Status  | Description                        |
| --------------- | ------- | ---------------------------------- |
| HF Band Status  | Working | Per-band opening status (160m-10m) |
| VHF Band Status | Working | 6m and 2m status                   |
| Color Coding    | Working | Green/yellow/red for band openings |

#### Time Machine

| Feature                  | Status  | Description                              |
| ------------------------ | ------- | ---------------------------------------- |
| Time Offset Slider       | Working | Adjust time +/- 24 hours                 |
| Display Time Calculation | Working | All overlays update based on offset time |

### 3. DX Cluster / Spot List

**Location:** `/Users/aiml/Projects/propulse-dev/src/components/dx/DXSpotList.tsx`

| Feature             | Status  | Description                             |
| ------------------- | ------- | --------------------------------------- |
| Spot Table          | Working | Tabular display of DX spots             |
| Band Filtering      | Working | Filter by HF band                       |
| Mode Filtering      | Working | Filter by CW/SSB/FT8 etc.               |
| Age Filtering       | Working | Filter by spot age (minutes)            |
| Search Filter       | Working | Text search on callsigns/comments       |
| Simulated Real-Time | Working | New demo spots added every 5-15 seconds |
| Collapsible Drawer  | Working | DX Cluster drawer on xl screens         |

### 4. User Settings

**Location:** `/Users/aiml/Projects/propulse-dev/src/components/settings/SettingsModal.tsx`

| Feature                 | Status  | Description                                   |
| ----------------------- | ------- | --------------------------------------------- |
| Callsign Input          | Working | Set operator callsign                         |
| Grid Square Input       | Working | Set Maidenhead grid locator                   |
| Address Geocoding       | Working | Search by address via OpenStreetMap Nominatim |
| GPS Coordinate Input    | Working | Manual lat/lon or DMS entry                   |
| Radio Equipment Manager | Working | Add/remove radios from equipment library      |
| Time Format Preference  | Working | 12h/24h toggle                                |
| Distance Units          | Working | Metric/Imperial toggle                        |
| Persistent Storage      | Working | Settings saved to localStorage                |

### 5. Recommendations System

| Feature                  | Status  | Description                            |
| ------------------------ | ------- | -------------------------------------- |
| Band Recommendations     | Working | Suggests optimal band for current path |
| 24h Propagation Forecast | Working | Visual forecast timeline               |
| Recommendations Badge    | Working | Quick view of optimal band             |
| Recommendations Panel    | Working | Detailed recommendations for path      |

### 6. Fullscreen Pro View

| Feature           | Status  | Description                  |
| ----------------- | ------- | ---------------------------- |
| Fullscreen Toggle | Working | Enter fullscreen map mode    |
| Exit Fullscreen   | Working | Click button or press Escape |

---

## Partial Implementations

### 1. NVIS (Near Vertical Incidence Skywave)

**Status:** UI Present, Limited Functionality

**Files:**

- `/Users/aiml/Projects/propulse-dev/src/components/map/NVISAnalysis.tsx`
- `/Users/aiml/Projects/propulse-dev/src/components/map/NVISCoverage.tsx`
- `/Users/aiml/Projects/propulse-dev/src/lib/utils/nvis.ts`

**What's Built:**

- NVIS calculation utilities exist
- NVIS layer toggle in mapStore
- Basic coverage visualization

**What's Missing:**

- NVIS is not integrated into the main layer toggles UI
- NVIS coverage circle not rendering in globe/flat views
- Emergency preset enables NVIS but overlay doesn't appear

### 2. Logbook

**Status:** Backend Complete, No UI

**Files:**

- `/Users/aiml/Projects/propulse-dev/src/hooks/useLogbook.ts`
- `/Users/aiml/Projects/propulse-dev/src/lib/db/logStore.ts`
- `/Users/aiml/Projects/propulse-dev/src/lib/utils/adifParser.ts`

**What's Built:**

- Full IndexedDB-based logbook storage
- CRUD operations for QSO entries
- ADIF import/export parser
- Callsign lookup with worked-before detection
- Band/mode tracking per callsign

**What's Missing:**

- No logbook page (route commented in Header: `// Future: { path: "/log", label: "LogBook", icon: "...", }`)
- No QSO entry form
- No logbook table/list view

### 3. Alert System

**Status:** Backend Complete, No UI

**Files:**

- `/Users/aiml/Projects/propulse-dev/src/hooks/useAlerts.ts`
- `/Users/aiml/Projects/propulse-dev/src/lib/db/alertStore.ts`
- `/Users/aiml/Projects/propulse-dev/src/lib/utils/alertMatcher.ts`
- `/Users/aiml/Projects/propulse-dev/src/lib/utils/notifications.ts`

**What's Built:**

- Alert rule CRUD in IndexedDB
- Spot matching against rules
- Browser notification integration
- Duplicate alert prevention
- Alert history tracking

**What's Missing:**

- No alert management UI
- No alert rule creation form
- No alert notification display in UI

### 4. Export Functionality

**Status:** Backend Complete, Limited UI

**Files:**

- `/Users/aiml/Projects/propulse-dev/src/components/export/ExportModal.tsx`
- `/Users/aiml/Projects/propulse-dev/src/lib/export/adif.ts`
- `/Users/aiml/Projects/propulse-dev/src/lib/export/cabrillo.ts`

**What's Built:**

- ADIF file generation
- Cabrillo file generation
- Export modal component

**What's Missing:**

- Export modal not integrated into any page
- No trigger button in UI

### 5. PSKReporter/RBN Live Spots

**Status:** API Ready, Demo Mode Active

**Files:**

- `/Users/aiml/Projects/propulse-dev/api/spots/pskreporter.ts`
- `/Users/aiml/Projects/propulse-dev/api/spots/rbn.ts`
- `/Users/aiml/Projects/propulse-dev/src/lib/api/pskreporter.ts`
- `/Users/aiml/Projects/propulse-dev/src/lib/api/rbn.ts`

**What's Built:**

- Vercel Edge Function proxies for PSKReporter and RBN
- API client functions with spot transformation
- `useLiveSpots` hook that merges multiple sources

**Current Behavior:**

- In dev mode, API routes return empty arrays (graceful fallback)
- Demo spots generator fills the gap with realistic simulated data
- Real data works when deployed to Vercel

### 6. Event Alert Banner

**Status:** Component Exists, Not Functional

**File:** `/Users/aiml/Projects/propulse-dev/src/components/solar/EventAlert.tsx`

**Current State:**

- Renders with `eventType={null}` in SolarPulse
- Comment: `// TODO: detect from X-ray data`
- No X-ray flux data fetching implemented

---

## UI Components Available

### Layout Components

| Component | Location                           | Description                     |
| --------- | ---------------------------------- | ------------------------------- |
| Layout    | `src/components/layout/Layout.tsx` | Main app layout wrapper         |
| Header    | `src/components/layout/Header.tsx` | Navigation header with settings |

### Solar Components

| Component        | Location                                    | Description                   |
| ---------------- | ------------------------------------------- | ----------------------------- |
| PrimaryMetrics   | `src/components/solar/PrimaryMetrics.tsx`   | Top-level metric cards        |
| MetricCard       | `src/components/solar/MetricCard.tsx`       | Reusable metric display       |
| SolarSummary     | `src/components/solar/SolarSummary.tsx`     | Plain-language summary        |
| BandConditions   | `src/components/solar/BandConditions.tsx`   | Band opening table            |
| BandRow          | `src/components/solar/BandRow.tsx`          | Individual band row           |
| KIndexChart      | `src/components/solar/KIndexChart.tsx`      | Kp time-series chart          |
| SolarFluxChart   | `src/components/solar/SolarFluxChart.tsx`   | SFI time-series chart         |
| FlareProbability | `src/components/solar/FlareProbability.tsx` | Flare probability bars        |
| EventAlert       | `src/components/solar/EventAlert.tsx`       | Alert banner (not functional) |

### Solar Modals

| Component             | Location                                                | Description     |
| --------------------- | ------------------------------------------------------- | --------------- |
| KIndexModal           | `src/components/solar/modals/KIndexModal.tsx`           | Kp explanation  |
| AIndexModal           | `src/components/solar/modals/AIndexModal.tsx`           | Ap explanation  |
| SolarFluxModal        | `src/components/solar/modals/SolarFluxModal.tsx`        | SFI explanation |
| SunspotModal          | `src/components/solar/modals/SunspotModal.tsx`          | SSN explanation |
| BzModal               | `src/components/solar/modals/BzModal.tsx`               | Bz explanation  |
| KIndexChartModal      | `src/components/solar/modals/KIndexChartModal.tsx`      | Expanded chart  |
| SolarFluxChartModal   | `src/components/solar/modals/SolarFluxChartModal.tsx`   | Expanded chart  |
| BandConditionsModal   | `src/components/solar/modals/BandConditionsModal.tsx`   | Band details    |
| FlareProbabilityModal | `src/components/solar/modals/FlareProbabilityModal.tsx` | Flare details   |
| SolarSummaryModal     | `src/components/solar/modals/SolarSummaryModal.tsx`     | Full summary    |

### Map Components

| Component                | Location                                                 | Description                |
| ------------------------ | -------------------------------------------------------- | -------------------------- |
| GlobeView                | `src/components/map/GlobeView.tsx`                       | 3D Three.js globe          |
| FlatMapView              | `src/components/map/FlatMapView.tsx`                     | 2D canvas map              |
| AzimuthalView            | `src/components/map/AzimuthalView.tsx`                   | Azimuthal projection       |
| EarthSphere              | `src/components/map/EarthSphere.tsx`                     | 3D Earth mesh              |
| Terminator               | `src/components/map/Terminator.tsx`                      | Day/night line (3D)        |
| Greyline                 | `src/components/map/Greyline.tsx`                        | Greyline band (3D)         |
| NightOverlay             | `src/components/map/NightOverlay.tsx`                    | Night darkening (3D)       |
| NightLightsOverlay       | `src/components/map/NightLightsOverlay.tsx`              | City lights (3D)           |
| LabelsOverlay            | `src/components/map/LabelsOverlay.tsx`                   | Labels (3D)                |
| AuroraOverlay            | `src/components/map/AuroraOverlay.tsx`                   | Aurora (3D)                |
| MUFOverlay               | `src/components/map/MUFOverlay.tsx`                      | MUF colors (3D)            |
| PathArc                  | `src/components/map/PathArc.tsx`                         | Great circle path (3D)     |
| LocationMarker           | `src/components/map/LocationMarker.tsx`                  | Location marker (3D)       |
| LiveSpotArcs             | `src/components/map/LiveSpotArcs.tsx`                    | Spot arcs (3D)             |
| NVISCoverage             | `src/components/map/NVISCoverage.tsx`                    | NVIS circle (3D)           |
| NVISAnalysis             | `src/components/map/NVISAnalysis.tsx`                    | NVIS analysis panel        |
| PathAnalysis             | `src/components/map/PathAnalysis.tsx`                    | Path analysis panel        |
| BandConditionsPanel      | `src/components/map/BandConditionsPanel.tsx`             | Band conditions side panel |
| OptimalBandsPanel        | `src/components/map/OptimalBandsPanel.tsx`               | Optimal band pop-out       |
| RecommendationsPanel     | `src/components/map/RecommendationsPanel.tsx`            | Full recommendations       |
| RecommendationsBadge     | `src/components/map/RecommendationsBadge.tsx`            | Quick badge                |
| PropagationForecast      | `src/components/map/PropagationForecast.tsx`             | Forecast component         |
| PropagationForecastMini  | `src/components/map/PropagationForecastMini.tsx`         | Compact forecast           |
| PropagationForecastModal | `src/components/map/modals/PropagationForecastModal.tsx` | Forecast modal             |
| TimeControl              | `src/components/map/TimeControl.tsx`                     | Time machine slider        |
| ViewModeToggle           | `src/components/map/ViewModeToggle.tsx`                  | View switcher              |
| MUFLegend                | `src/components/map/MUFLegend.tsx`                       | MUF color legend           |
| QuickTargets             | `src/components/map/QuickTargets.tsx`                    | Saved targets              |
| FullscreenPropSphere     | `src/components/map/FullscreenPropSphere.tsx`            | Fullscreen mode            |

### DX Components

| Component     | Location                              | Description             |
| ------------- | ------------------------------------- | ----------------------- |
| DXSpotList    | `src/components/dx/DXSpotList.tsx`    | Spot table with filters |
| DXSpotOverlay | `src/components/dx/DXSpotOverlay.tsx` | Spot overlay for map    |
| SpotBadge     | `src/components/dx/SpotBadge.tsx`     | Spot info badge         |

### Settings Components

| Component     | Location                                    | Description             |
| ------------- | ------------------------------------------- | ----------------------- |
| SettingsModal | `src/components/settings/SettingsModal.tsx` | Main settings dialog    |
| LocationInput | `src/components/settings/LocationInput.tsx` | Grid/address input      |
| RadioManager  | `src/components/settings/RadioManager.tsx`  | Radio equipment manager |

### Band Plan Components

| Component       | Location                                   | Description             |
| --------------- | ------------------------------------------ | ----------------------- |
| BandPlanDisplay | `src/components/bands/BandPlanDisplay.tsx` | Band plan visualization |

### Base UI Components

| Component      | Location                               | Description            |
| -------------- | -------------------------------------- | ---------------------- |
| Card           | `src/components/ui/Card.tsx`           | Glass-morphism card    |
| Badge          | `src/components/ui/Badge.tsx`          | Status badge           |
| DetailModal    | `src/components/ui/DetailModal.tsx`    | Reusable modal wrapper |
| HelpModal      | `src/components/ui/HelpModal.tsx`      | Help/info modal        |
| LoadingSpinner | `src/components/ui/LoadingSpinner.tsx` | Loading indicator      |
| ProgressBar    | `src/components/ui/ProgressBar.tsx`    | Progress bar           |
| Tooltip        | `src/components/ui/Tooltip.tsx`        | Hover tooltip          |
| ErrorBoundary  | `src/components/ErrorBoundary.tsx`     | React error boundary   |

---

## API Integrations Active

### Backend Proxy Endpoints (Vercel Edge Functions)

| Endpoint                   | Source            | File                         | Status              |
| -------------------------- | ----------------- | ---------------------------- | ------------------- |
| `/api/solar/k-index`       | NOAA SWPC         | `api/solar/k-index.ts`       | Working             |
| `/api/solar/flux`          | NOAA SWPC         | `api/solar/flux.ts`          | Working             |
| `/api/solar/probabilities` | NOAA SWPC         | `api/solar/probabilities.ts` | Working             |
| `/api/solar/sunspots`      | NOAA SWPC         | `api/solar/sunspots.ts`      | Working             |
| `/api/solar/magnetometer`  | NOAA SWPC         | `api/solar/magnetometer.ts`  | Working             |
| `/api/spots/pskreporter`   | PSKReporter.info  | `api/spots/pskreporter.ts`   | Working (prod only) |
| `/api/spots/rbn`           | ReverseBeacon.net | `api/spots/rbn.ts`           | Working (prod only) |

### Client-Side API Functions

| Function                | File                         | Description               |
| ----------------------- | ---------------------------- | ------------------------- |
| `fetchKIndex`           | `src/lib/api/noaa.ts`        | Fetch planetary K-index   |
| `fetchSolarFlux`        | `src/lib/api/noaa.ts`        | Fetch 10.7 cm flux        |
| `fetchProbabilities`    | `src/lib/api/noaa.ts`        | Fetch flare probabilities |
| `fetchSunspots`         | `src/lib/api/noaa.ts`        | Fetch sunspot numbers     |
| `fetchMagnetometer`     | `src/lib/api/noaa.ts`        | Fetch solar wind Bz       |
| `fetchPSKReporterSpots` | `src/lib/api/pskreporter.ts` | Fetch PSKReporter spots   |
| `fetchRBNSpots`         | `src/lib/api/rbn.ts`         | Fetch RBN spots           |
| `fetchAuroraData`       | `src/lib/api/aurora.ts`      | Fetch NOAA OVATION aurora |
| `geocodeAddress`        | `src/lib/api/geocoding.ts`   | OpenStreetMap Nominatim   |

### External Services Used

| Service                 | Purpose            | Rate Limits      |
| ----------------------- | ------------------ | ---------------- |
| NOAA SWPC               | Solar weather data | No strict limits |
| PSKReporter.info        | Digital mode spots | Rate limited     |
| ReverseBeacon.net       | CW/RTTY spots      | Rate limited     |
| OpenStreetMap Nominatim | Address geocoding  | 1 req/sec        |

---

## State Management

### Zustand Stores

| Store      | File                       | Persisted          | Purpose                             |
| ---------- | -------------------------- | ------------------ | ----------------------------------- |
| mapStore   | `src/stores/mapStore.ts`   | No                 | View mode, layers, target, zoom     |
| userStore  | `src/stores/userStore.ts`  | Yes (localStorage) | Station, preferences, saved targets |
| solarStore | `src/stores/solarStore.ts` | No                 | Data freshness tracking             |
| dxStore    | `src/stores/dxStore.ts`    | No                 | DX spots, filters, UI state         |

### TanStack Query Hooks

| Hook               | File                         | Purpose                  |
| ------------------ | ---------------------------- | ------------------------ |
| `useKIndex`        | `src/hooks/useSolarData.ts`  | K-index with caching     |
| `useSolarFlux`     | `src/hooks/useSolarData.ts`  | SFI with caching         |
| `useProbabilities` | `src/hooks/useSolarData.ts`  | Flare probs with caching |
| `useSunspots`      | `src/hooks/useSolarData.ts`  | SSN with caching         |
| `useMagnetometer`  | `src/hooks/useSolarData.ts`  | Bz with caching          |
| `useAuroraData`    | `src/hooks/useAuroraData.ts` | Aurora data              |
| `useMUFData`       | `src/hooks/useMUFData.ts`    | MUF grid calculation     |
| `useDXCluster`     | `src/hooks/useDXCluster.ts`  | DX spots management      |
| `useLiveSpots`     | `src/hooks/useLiveSpots.ts`  | Merged spot sources      |
| `useLogbook`       | `src/hooks/useLogbook.ts`    | Logbook CRUD             |
| `useAlerts`        | `src/hooks/useAlerts.ts`     | Alert management         |

### IndexedDB Storage

| Store       | File                  | Tables                           |
| ----------- | --------------------- | -------------------------------- |
| Propulse DB | `src/lib/db/index.ts` | `logs`, `alerts`, `alertHistory` |

---

## Data Utilities and Libraries

### Solar/Propagation Utilities

| Utility              | File                                | Description                  |
| -------------------- | ----------------------------------- | ---------------------------- |
| MUF Estimation       | `src/lib/api/muf.ts`                | SFI-based MUF calculation    |
| LUF Calculation      | `src/lib/api/muf.ts`                | D-layer absorption model     |
| FOT/HPF              | `src/lib/api/muf.ts`                | Frequency of Optimum Traffic |
| Ionosphere Model     | `src/lib/utils/ionosphere.ts`       | f0F2, M3000F2, layer heights |
| NVIS Calculation     | `src/lib/utils/nvis.ts`             | NVIS coverage estimation     |
| Signal Strength      | `src/lib/utils/signal.ts`           | S-unit calculations          |
| Band Recommendations | `src/lib/utils/recommendations.ts`  | Optimal band selection       |
| Solar Conversions    | `src/lib/utils/solarConversions.ts` | Kp to Ap, etc.               |

### Geometry/Path Utilities

| Utility              | File                         | Description                   |
| -------------------- | ---------------------------- | ----------------------------- |
| Path Calculation     | `src/lib/utils/path.ts`      | Great circle distance/bearing |
| Azimuthal Projection | `src/lib/utils/azimuthal.ts` | Azimuthal equidistant math    |
| Grid Conversion      | `src/lib/utils/grid.ts`      | Maidenhead grid utilities     |
| Sun Position         | `src/lib/utils/sun.ts`       | Subsolar point calculation    |

### Amateur Radio Data

| Data             | File                              | Description                 |
| ---------------- | --------------------------------- | --------------------------- |
| Band Plans       | `src/lib/data/bandplans.ts`       | ITU region band allocations |
| Radio Equipment  | `src/lib/data/radios.ts`          | Radio model database        |
| Prefix Locations | `src/lib/data/prefixLocations.ts` | Callsign prefix geolocation |

### Export Utilities

| Utility            | File                          | Description          |
| ------------------ | ----------------------------- | -------------------- |
| ADIF Parser        | `src/lib/utils/adifParser.ts` | ADIF import/export   |
| ADIF Generator     | `src/lib/export/adif.ts`      | ADIF file generation |
| Cabrillo Generator | `src/lib/export/cabrillo.ts`  | Cabrillo log format  |

---

## Known Issues and Bugs

### 1. NVIS Layer Not Rendering

**Location:** MapStore layer handling
**Issue:** NVIS layer toggle exists but `NVISCoverage` component is not rendered in any view
**Impact:** Emergency preset enables NVIS but nothing appears

### 2. Event Alert Never Triggers

**Location:** `/Users/aiml/Projects/propulse-dev/src/pages/SolarPulse.tsx:73-77`

```typescript
<EventAlert
  eventType={null} // TODO: detect from X-ray data
  severity="minor"
  message=""
/>
```

**Issue:** `eventType` is hardcoded to `null`, so banner never shows
**Missing:** X-ray flux data fetching and event detection logic

### 3. Short/Long Path Toggle Not Functional

**Location:** PathAnalysis component
**Issue:** UI shows short path info but no toggle for long path
**Impact:** Users cannot see long path heading/distance

### 4. Demo Spots in Dev Mode

**Location:** PSKReporter/RBN API calls
**Issue:** In development, API routes return empty arrays
**Behavior:** Falls back to demo spot generator (intended behavior, but may confuse developers)

### 5. getActiveRadio Returns Null

**Location:** `/Users/aiml/Projects/propulse-dev/src/stores/userStore.ts:214-217`

```typescript
getActiveRadio: () => {
  // Note: This returns null as a placeholder. Use the useActiveRadio hook instead.
  return null;
},
```

**Issue:** Store method doesn't work, requires using hook instead
**Impact:** Inconsistent API pattern

### 6. Time Machine Limited to +/- 24 Hours

**Location:** MapStore `setTimeOffset`
**Issue:** Offset clamped to `-24` to `+24` hours
**Impact:** Cannot simulate conditions further in advance

### 7. No Aurora Data Source Fallback Display

**Location:** Aurora overlay
**Issue:** When NOAA OVATION data unavailable, demo data is generated but no indicator shows
**Impact:** Users may not know data is simulated

### 8. PSKReporter XML Response Handling

**Location:** `/Users/aiml/Projects/propulse-dev/api/spots/pskreporter.ts:114-127`
**Issue:** If PSKReporter returns XML instead of JSON, it silently returns empty array
**Impact:** No error indication when PSKReporter API format changes

### 9. Canvas DPI Scaling Not Dynamic

**Location:** FlatMapView, AzimuthalView
**Issue:** Canvas uses fixed dimensions (1024x512, 600x600) regardless of device pixel ratio
**Impact:** May appear blurry on high-DPI displays

### 10. Logbook Page Route Commented Out

**Location:** `/Users/aiml/Projects/propulse-dev/src/components/layout/Header.tsx:27`

```typescript
// Future: { path: "/log", label: "LogBook", icon: "..." },
```

**Issue:** Logbook backend exists but no page/route
**Impact:** Feature is completely inaccessible

---

## Files Summary

### Source Structure

```
src/
├── App.tsx                    # Main router
├── pages/
│   ├── Home.tsx               # Landing page
│   ├── SolarPulse.tsx         # Solar dashboard
│   └── PropSphere.tsx         # Propagation map
├── components/
│   ├── bands/                 # Band plan display
│   ├── dx/                    # DX cluster/spots
│   ├── export/                # Export modal
│   ├── layout/                # Header, Layout
│   ├── map/                   # All map components
│   ├── settings/              # Settings modal
│   ├── solar/                 # Solar widgets
│   └── ui/                    # Base UI components
├── hooks/                     # React Query hooks
├── stores/                    # Zustand stores
├── lib/
│   ├── api/                   # API clients
│   ├── data/                  # Static data (bands, radios)
│   ├── db/                    # IndexedDB stores
│   ├── export/                # Export generators
│   ├── utils/                 # Calculation utilities
│   └── webgl/                 # WebGL renderers
├── types/                     # TypeScript types
└── constants/                 # Map presets, etc.

api/
├── solar/                     # NOAA proxy endpoints
└── spots/                     # PSK/RBN proxy endpoints
```

### Technology Stack

- **Framework:** React 18 with TypeScript
- **Build:** Vite
- **Styling:** Tailwind CSS
- **3D Graphics:** Three.js with React Three Fiber
- **Charts:** Recharts
- **State:** Zustand (stores) + TanStack Query (server state)
- **Storage:** localStorage (preferences) + IndexedDB (logs, alerts)
- **Deployment:** Vercel with Edge Functions

---

_End of Audit_
