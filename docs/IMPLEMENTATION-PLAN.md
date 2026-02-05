# Propulse / DX Wizard — Master Implementation Plan

Created: 2026-02-04
Status: PENDING APPROVAL
Source: [DX-WIZARD-EXPERT-REVIEW.md](./DX-WIZARD-EXPERT-REVIEW.md)

---

## Summary

This plan implements all 37 features from the Expert Review across 8 sequential phases, ordered by dependency chain and impact. Each feature has complete acceptance criteria, file ownership, and verification steps. The architecture is a two-tier system: Vercel Edge Functions (cloud) + local Node.js bridge (hardware integration). Features are grouped so that foundational data models and APIs land first, enabling dependent features in later phases.

## Architecture Context

| Tier  | Stack                                | Role                                                      |
| ----- | ------------------------------------ | --------------------------------------------------------- |
| Cloud | Vite SPA + Vercel Edge Functions     | UI, propagation models, spot proxies, QSL service proxies |
| Local | Node.js WebSocket bridge (`bridge/`) | CAT control, WSJT-X UDP, antenna rotor, hardware I/O      |

**Existing infrastructure leveraged:**

- 11 Vercel Edge Function proxies (CORS + transform pattern)
- Bridge scaffold with WebSocket protocol, types, and React hook (`useBridge`)
- TanStack Query for data fetching with caching
- Zustand stores with localStorage persistence
- IndexedDB via `idb` for logbook storage
- Three.js/R3F for 3D globe rendering

---

## Phase 1: Foundation — Data Models & Propagation Physics

**Objective**: Build the authoritative DXCC entity database and upgrade the propagation physics engine. Everything else depends on these two pillars.

**Duration estimate**: Large phase — 6 parallel workstreams

---

### Feature C7: Complete DXCC Entity Database & Awards Intelligence

**Review Reference**: Concrete #7 — "DXCC / Awards Tracking with Worked-Before Intelligence"

**Problem**: Three separate, incomplete, inconsistent DXCC databases exist (`multipliers.ts` ~75 entities, `gridUtils.ts` ~120 entities, `prefixLocations.ts` ~60 names). The full ARRL DXCC list has ~340 current entities. No `cty.dat` or BigCTY import. Awards tracking recomputes on every render from raw callsigns.

**Implementation**:

1. **Create authoritative DXCC entity data file** (`src/lib/data/dxccEntities.ts`):
   - Parse and embed the AD1C BigCTY database (public domain, ~340 current entities)
   - Data structure per entity: `{ entityId: number, name: string, prefix: string, continent: string, cqZones: number[], ituZones: number[], adifCode: number, deleted: boolean, startDate?: string, endDate?: string, aliases: string[] }`
   - Include ALL prefix-to-entity mappings (primary prefix + aliases + special prefixes)
   - Export `lookupEntity(callsign): DXCCEntity | null` using longest-prefix-match algorithm
   - Export `getAllEntities(): DXCCEntity[]`, `getEntityByAdif(code): DXCCEntity | null`
   - Export `getEntityByPrefix(prefix): DXCCEntity | null`

2. **Create DXCC tracking store** (`src/stores/dxccStore.ts`):
   - Track per-entity status: `{ entityId, workedBands: Set<string>, workedModes: Set<string>, confirmedBands: Set<string>, confirmedModes: Set<string>, firstWorked: Date, lastWorked: Date }`
   - Derived selectors: `selectEntitiesWorked`, `selectEntitiesConfirmed`, `selectEntitiesNeeded`, `selectNeededOnBand(band)`, `selectNeededOnMode(mode)`, `selectBandEntityStatus(entityId, band)`
   - Persist to IndexedDB (not localStorage — this can be large)
   - `rebuildFromLog(entries[])` — full recompute from logbook entries
   - `markConfirmed(entityId, band, mode)` — manual or LoTW-driven confirmation

3. **Refactor all DXCC consumers** to use the authoritative database:
   - `src/lib/contest/multipliers.ts` — replace `DXCC_DATA` with imports from `dxccEntities.ts`
   - `src/lib/utils/gridUtils.ts` — replace `DXCC_ENTITIES` with imports from `dxccEntities.ts`
   - `src/components/logbook/AwardsTracker.tsx` — replace local `getDXCCEntity()` with authoritative `lookupEntity()`
   - `src/lib/contest/strategy.ts` — replace `COMMON_DXCC_PREFIXES` (47 entries) with full entity list
   - `src/components/dx/LogStatsCard.tsx`, `InsightsBar.tsx`, `LogStatsDetailModal.tsx` — use `dxccStore` selectors

4. **Enhance AwardsTracker component**:
   - DXCC Honor Roll progress (current entities, mixed, phone, CW, digital)
   - 5-Band DXCC tracking matrix (entity x band grid with worked/confirmed indicators)
   - Challenge award tracking (bands x entities, need 1000+ band-entities)
   - WAS with proper state extraction from exchange/QTH
   - WAZ with proper zone data from entity database (not hardcoded ~20 entries)
   - Visual progress rings/bars for each award milestone (100, 200, 250, 300, 325, 340)

5. **Integrate DXCC status into spot display**:
   - `SpotRow.tsx` — color-coded DXCC status badge: 🔴 new entity, 🟡 new band-entity, 🟢 new mode-entity, ⚪ already confirmed
   - `LiveSpotArcs.tsx` — arc color/glow intensity based on DXCC need status
   - `DXSpotOverlay.tsx` — marker pulsing for new-entity spots
   - `useDXSpotListState.ts` — "needed only" filter uses `dxccStore` instead of raw logbook scan

**Acceptance Criteria**:

- [ ] `lookupEntity("W1AW")` returns `{ name: "United States", adifCode: 291, ... }`
- [ ] `lookupEntity("VP8LP")` returns `{ name: "Falkland Islands", ... }` (not generic "VP8" match)
- [ ] `lookupEntity("3DA0WW")` returns `{ name: "Eswatini", ... }` (complex prefix)
- [ ] All 340 current DXCC entities are present in the database
- [ ] Entity-to-prefix mapping handles aliases (e.g., DL, DA-DR all → Germany)
- [ ] AwardsTracker shows accurate DXCC count matching the authoritative database
- [ ] Spot rows display correct DXCC need status badges with appropriate colors
- [ ] "Needed Only" filter correctly excludes entities already worked on the current band
- [ ] DXCC tracking persists across page reloads (IndexedDB)
- [ ] `rebuildFromLog()` processes 10,000 QSOs in under 2 seconds
- [ ] No duplicate entity counts (one callsign = one entity, regardless of prefix variant)
- [ ] Contest multiplier extraction uses the same database (no data inconsistency)
- [ ] Award milestone badges render at 100, 200, 250, 300, 325, 340 thresholds
- [ ] 5-Band DXCC matrix scrolls smoothly with 340 entity rows

**Files Created**:

- `src/lib/data/dxccEntities.ts` — Authoritative entity database (~340 entities, all prefix mappings)
- `src/stores/dxccStore.ts` — DXCC tracking state with IndexedDB persistence

**Files Modified**:

- `src/lib/contest/multipliers.ts` — Replace DXCC_DATA with imports
- `src/lib/utils/gridUtils.ts` — Replace DXCC_ENTITIES with imports
- `src/lib/contest/strategy.ts` — Replace COMMON_DXCC_PREFIXES
- `src/components/logbook/AwardsTracker.tsx` — Full rewrite using dxccStore
- `src/components/dx/LogStatsCard.tsx` — Use dxccStore selectors
- `src/components/dx/InsightsBar.tsx` — Use dxccStore selectors
- `src/components/dx/modals/LogStatsDetailModal.tsx` — Use dxccStore selectors
- `src/components/dx/DXSpotList/SpotRow.tsx` — Add DXCC need status badge
- `src/components/dx/DXSpotList/useDXSpotListState.ts` — Use dxccStore for "needed" filter
- `src/components/map/LiveSpotArcs.tsx` — DXCC-aware arc coloring
- `src/components/dx/DXSpotOverlay.tsx` — DXCC-aware marker pulsing

---

### Feature C8: Geomagnetic Latitude Calculations (IGRF Dipole Model)

**Review Reference**: Concrete #8 — "Geomagnetic Latitude Calculations"

**Problem**: All ionospheric calculations use geographic latitude. Geomagnetic latitude differs by up to ~11.5° (the dipole tilt), causing significant errors for stations near the magnetic poles/equator.

**Implementation**:

1. **Create geomagnetic coordinate utility** (`src/lib/utils/geomagnetic.ts`):
   - Implement IGRF-13 centered dipole approximation (dipole pole at ~80.65°N, 72.68°W for epoch 2025)
   - `geoToGeomagnetic(lat, lon): { geomagLat, geomagLon }` — spherical rotation to geomagnetic coordinates
   - `geomagneticToGeo(geomagLat, geomagLon): { lat, lon }` — inverse transform
   - `getGeomagneticLatitude(lat, lon): number` — convenience for the common case
   - `isAuroralZone(lat, lon): boolean` — geomagnetic latitude > 60°
   - `isPolarCap(lat, lon): boolean` — geomagnetic latitude > 75°
   - `getInvariantLatitude(lat, lon): number` — for L-shell calculations (auroral absorption)

2. **Integrate into ionosphere model** (`src/lib/utils/ionosphere.ts`):
   - `calculateF0F2()` — use geomagnetic latitude for equatorial anomaly calculation (lines 130-140)
   - `calculateDLayerAbsorption()` — use geomagnetic latitude for absorption correction
   - `getIonosphericParameters()` — add geomagnetic latitude to output
   - Auroral absorption: add penalty when path crosses geomagnetic latitude > 60°

3. **Integrate into signal path** (`src/lib/utils/signal.ts`):
   - `predictSignalStrength()` — polar path penalty uses geomagnetic latitude (not geographic)

4. **Integrate into bands model** (`src/lib/utils/bands.ts`):
   - `getEnhancedBandConditions()` — polar path check at line ~850 uses geomagnetic latitude
   - `getBandConditionsForPath()` — polar path penalty at line ~620 uses geomagnetic latitude

**Acceptance Criteria**:

- [ ] `getGeomagneticLatitude(65, 25)` (Helsinki) returns ~62° (close to geographic, small correction)
- [ ] `getGeomagneticLatitude(65, -20)` (Iceland) returns ~70° (significant northward shift toward magnetic pole)
- [ ] `getGeomagneticLatitude(0, -75)` (South America equator) returns ~10° (off magnetic equator)
- [ ] `isAuroralZone(65, 25)` returns `true` for geomag lat 62° (borderline)
- [ ] Equatorial anomaly in f0F2 now applies to stations near the geomagnetic equator (e.g., Philippines at ~3° geomag lat) not geographic equator
- [ ] Polar path penalties apply correctly: W6→JA (no polar crossing) vs LA→VK (crosses polar region)
- [ ] D-layer absorption at high geomagnetic latitudes shows increased values during disturbed conditions
- [ ] Existing propagation predictions change noticeably for high-latitude stations (Scandinavia, Canada)
- [ ] Round-trip consistency: `geoToGeomagnetic → geomagneticToGeo` returns original coordinates within 0.01°

**Files Created**:

- `src/lib/utils/geomagnetic.ts`

**Files Modified**:

- `src/lib/utils/ionosphere.ts` — Use geomagnetic latitude in f0F2 and absorption
- `src/lib/utils/signal.ts` — Use geomagnetic latitude for polar path
- `src/lib/utils/bands.ts` — Use geomagnetic latitude for polar penalties

---

### Feature C9: Frequency-Dependent External Noise Model (ITU-R P.372)

**Review Reference**: Concrete #9 — "Frequency-Dependent External Noise Model"

**Problem**: `signal.ts` uses a fixed 15 dB external noise figure. Real HF noise ranges from ~40 dB at 1.8 MHz to ~8 dB at 30 MHz. This makes 160m predictions optimistic by ~25 dB and 10m predictions pessimistic by ~7 dB.

**Implementation**:

1. **Create noise model utility** (`src/lib/utils/noiseModel.ts`):
   - Implement ITU-R P.372 median noise figures for 4 environments:
     - City: `Fa = 76.8 - 27.7 * log10(f_MHz)`
     - Residential: `Fa = 67.2 - 27.7 * log10(f_MHz)`
     - Rural: `Fa = 53.6 - 28.6 * log10(f_MHz)`
     - Quiet Rural: `Fa = 44.2 - 29.4 * log10(f_MHz)`
   - `getExternalNoiseFigure(frequencyMHz, environment): number` — returns Fa in dB
   - `getExternalNoiseTemperature(frequencyMHz, environment): number` — returns Ta in Kelvin
   - `getGalacticNoise(frequencyMHz): number` — cosmic background component
   - `getAtmosphericNoise(frequencyMHz, season, timeOfDay, lat): number` — seasonal/diurnal atmospheric noise
   - `getManMadeNoise(frequencyMHz, environment): number` — man-made noise component
   - `getTotalExternalNoise(frequencyMHz, environment, lat, season, timeOfDay): number` — combined

2. **Add noise environment to user preferences** (`src/stores/userStore.ts`):
   - New preference: `noiseEnvironment: "city" | "residential" | "rural" | "quiet_rural"` (default: "residential")
   - Expose via `useNoiseEnvironment()` hook

3. **Integrate into signal model** (`src/lib/utils/signal.ts`):
   - Replace fixed `15` dB in `calculateNoiseFloor()` (line 298) with `getExternalNoiseFigure(freq, environment)`
   - All downstream SNR calculations automatically improve

4. **Add noise environment selector to Settings**:
   - Radio/environment icon with 4-option dropdown
   - Tooltip explaining what each level means and when to use it
   - Show current noise figure range (e.g., "38 dB at 160m → 8 dB at 10m")

**Acceptance Criteria**:

- [ ] `getExternalNoiseFigure(1.8, "residential")` returns ~52 dB (160m residential)
- [ ] `getExternalNoiseFigure(28, "residential")` returns ~17 dB (10m residential)
- [ ] `getExternalNoiseFigure(14, "quiet_rural")` returns ~11 dB (20m quiet rural)
- [ ] 160m SNR predictions decrease by ~25 dB compared to old fixed-15dB model (now more realistic)
- [ ] 10m SNR predictions increase by ~7 dB compared to old model (now more optimistic, correctly)
- [ ] Band recommendations shift: 160m shows "poor" more often in city environments, 10m shows "good" more often
- [ ] Noise environment persists across sessions via userStore
- [ ] Settings panel shows noise environment selector with clear descriptions
- [ ] All 4 environment curves produce monotonically decreasing noise with increasing frequency
- [ ] Atmospheric noise contribution varies by season and time of day (higher in summer nights at low frequencies)

**Files Created**:

- `src/lib/utils/noiseModel.ts`

**Files Modified**:

- `src/lib/utils/signal.ts` — Replace fixed noise figure
- `src/stores/userStore.ts` — Add noiseEnvironment preference
- `src/components/settings/` — Add noise environment selector

---

### Feature C11: Multi-Hop Ray Tracing

**Review Reference**: Concrete #11 — "Multi-Hop Ray Tracing"

**Problem**: Path loss is calculated using ionospheric parameters at the path midpoint only. Multi-hop paths (3+ hops) traverse different ionospheric regions where f0F2, absorption, and day/night status vary independently.

**Implementation**:

1. **Create ray tracing engine** (`src/lib/utils/rayTrace.ts`):
   - `calculateHopReflectionPoints(startLat, startLon, endLat, endLon, numHops, layerHeight): LatLon[]` — great-circle intermediate points at each ionospheric reflection
   - `calculateGroundBouncePoints(startLat, startLon, endLat, endLon, numHops): LatLon[]` — ground reflection points between hops
   - `traceRayPath(start, end, frequency, sfi, date, txPower, mode, environment): RayTraceResult` — the main engine:
     - Compute number of hops from distance and layer height
     - For each hop: evaluate f0F2, M(3000)F2, D-layer absorption, and day/night status at the reflection point
     - Check propagation viability: frequency must be below f0F2 \* M(3000) at EVERY reflection point (if any hop fails, signal is lost)
     - Sum per-hop absorption losses
     - Classify ground bounce points as sea/land (prep for Feature C22)
     - Return: `{ viable: boolean, hops: HopDetail[], totalAbsorption: number, limitingHop: number, groundTypes: TerrainType[] }`
   - `HopDetail`: `{ reflectionPoint, f0F2, muf3000, absorption, isDaytime, zenithAngle, isViable }`

2. **Integrate into enhanced band conditions** (`src/lib/utils/bands.ts`):
   - `getEnhancedBandConditions()` — replace single-midpoint absorption with `traceRayPath()` result
   - Use the `limitingHop` to identify where the path fails (useful for explaining "why is this band closed?")

3. **Integrate into signal prediction** (`src/lib/utils/signal.ts`):
   - `predictSignalStrength()` — use per-hop absorption from ray trace instead of single absorption value

4. **Add hop visualization to PathAnalysis**:
   - Show each reflection point on the map as small markers along the great circle path
   - Color each hop segment by viability (green = open, red = frequency exceeds MUF at that point)
   - "Limiting hop" indicator showing where the path breaks down

**Acceptance Criteria**:

- [ ] 1-hop path (< 2500 km): result matches existing midpoint model within 1 dB
- [ ] 4-hop path (e.g., W6→ZL, ~10000 km): absorption varies across hops (night hops have less absorption)
- [ ] Path with mixed day/night hops: correctly identifies that a night-time hop over the Pacific has lower absorption than the daytime hops at each end
- [ ] A path where MUF is exceeded at one intermediate hop: `viable: false` with `limitingHop` pointing to the failing reflection point
- [ ] `calculateHopReflectionPoints` for a 3-hop path returns 3 points at 1/6, 3/6, 5/6 of the great circle distance
- [ ] Long-path predictions noticeably different from short-path (different ionospheric conditions along different routes)
- [ ] PathAnalysis shows hop markers on the map with color-coded viability
- [ ] Performance: ray trace for 10 bands at 24 hours completes in < 500ms

**Files Created**:

- `src/lib/utils/rayTrace.ts`

**Files Modified**:

- `src/lib/utils/bands.ts` — Use ray trace in getEnhancedBandConditions
- `src/lib/utils/signal.ts` — Accept per-hop absorption data
- `src/components/map/PathAnalysis.tsx` — Show hop reflection points

---

### Feature C14: Gray Line Propagation Enhancement Quantification

**Review Reference**: Concrete #14 — "Gray Line Propagation Enhancement Quantification"

**Problem**: `grayline.ts` identifies the ±5° terminator zone but doesn't quantify the propagation benefit. Gray line can provide 10-20 dB enhancement on 160m/80m.

**Implementation**:

1. **Enhance grayline model** (`src/lib/utils/grayline.ts`):
   - `getGrayLineEnhancement(lat, lon, date): GrayLineEnhancement` — returns:
     - `inZone: boolean` — is this point currently in gray line?
     - `absorptionReduction: number` — dB reduction in D-layer absorption (0 at edge, up to 15 dB at center)
     - `enhancementFactor: number` — 0.0 to 1.0 (0 = no enhancement, 1 = full gray line)
     - `minutesUntilEntry: number | null` — when does gray line reach this point?
     - `minutesUntilExit: number | null` — when does gray line leave?
     - `durationMinutes: number` — how long gray line lasts at this latitude
   - `getPathGrayLineWindow(startLat, startLon, endLat, endLon, date): GrayLineWindow` — returns:
     - `isActive: boolean` — both endpoints currently in gray line
     - `windowStart: Date | null` — when the mutual gray line window opens (next 24h)
     - `windowEnd: Date | null` — when it closes
     - `peakEnhancement: number` — maximum dB improvement during window
     - `optimalTime: Date | null` — time of maximum mutual enhancement

2. **Integrate into signal model**:
   - `predictSignalStrength()` — if path endpoints are in gray line zone, reduce D-layer absorption by the computed factor
   - `getEnhancedBandConditions()` — apply gray line enhancement to 160m and 80m predictions

3. **Surface in recommendations and UI**:
   - `getRecommendations()` — include gray line window in time windows: "160m gray line window opens in 47 minutes (est. +14 dB)"
   - `PropagationForecastMini.tsx` — gray line countdown timer already exists; enhance with dB estimate
   - `PathAnalysis.tsx` — show "Gray Line Enhancement" section with timing and dB estimate

**Acceptance Criteria**:

- [ ] `getGrayLineEnhancement(lat, lon, sunriseTime)` returns `absorptionReduction` of ~12-15 dB at zone center
- [ ] `getGrayLineEnhancement(lat, lon, noonTime)` returns `absorptionReduction` of 0 dB (not in zone)
- [ ] Enhancement follows a smooth gradient from zone edge (0 dB) to center (~15 dB)
- [ ] `getPathGrayLineWindow` correctly identifies mutual gray line times for reciprocal sunrise/sunset paths
- [ ] 160m predictions improve by 10-15 dB during gray line windows
- [ ] 80m predictions improve by 5-10 dB during gray line windows
- [ ] PropagationForecastMini shows gray line countdown with estimated enhancement
- [ ] Recommendations include gray line window timing with dB improvement estimate
- [ ] High-latitude stations (e.g., OH) have longer gray line windows than equatorial stations

**Files Modified**:

- `src/lib/utils/grayline.ts` — Add enhancement quantification
- `src/lib/utils/signal.ts` — Apply gray line absorption reduction
- `src/lib/utils/bands.ts` — Apply gray line to 160m/80m
- `src/lib/utils/recommendations.ts` — Include gray line windows
- `src/components/map/PropagationForecastMini.tsx` — Enhanced countdown
- `src/components/map/PathAnalysis.tsx` — Gray line enhancement section

---

### Feature C10: Antenna Modeling & Pattern Integration

**Review Reference**: Concrete #10 — "Antenna Modeling & Pattern Integration"

**Problem**: Signal model uses isotropic scalar gain. Real antennas have elevation-dependent radiation patterns critical for DX vs. NVIS.

**Implementation**:

1. **Create antenna pattern library** (`src/lib/data/antennas.ts`):
   - Define common antenna types with elevation gain curves:
     - Dipole (height-dependent: 1/4λ, 1/2λ, 1λ)
     - Vertical (ground-mounted, elevated radials)
     - Yagi (3-element, 5-element, height-dependent)
     - Hex beam
     - Wire antennas (inverted-V, EFHW, G5RV)
     - NVIS antenna (low dipole, cloud-warmer)
   - Each antenna: `{ name, type, gainPattern: (elevationDeg) => dBi, maxGainDbi, beamwidth3dB, isDirectional, azimuthPattern?: (azimuthDeg) => dB }`
   - `getAntennaGainAtElevation(antenna, elevationDeg): number`
   - `getAntennaGainForPath(antenna, takeoffAngle, azimuthOffset?): number`

2. **Calculate takeoff angle from path** (`src/lib/utils/path.ts`):
   - `calculateTakeoffAngle(distanceKm, layerHeight, hops): number` — geometric takeoff angle from hop geometry
   - This determines which part of the antenna pattern is relevant

3. **Add antenna selection to user profile** (`src/stores/userStore.ts`):
   - `station.antennas: AntennaConfig[]` — per-band antenna assignments
   - `AntennaConfig: { band: string, antennaType: string, height: number, direction?: number }`
   - Default: "Dipole at 1/2λ" for all bands

4. **Integrate into signal model** (`src/lib/utils/signal.ts`):
   - `predictSignalStrength()` — replace scalar `antennaGainDbi` with `getAntennaGainForPath(antenna, takeoffAngle)`
   - Different gain for TX antenna (home) and RX antenna (estimated based on DX station typical setup)

5. **Add antenna selector UI to DX Wizard and Settings**:
   - Per-band antenna dropdown with height input
   - Visual elevation pattern preview (polar plot)
   - "How does my antenna perform on this path?" indicator

**Acceptance Criteria**:

- [ ] Dipole at 1/2λ height: ~7 dBi gain at 30° elevation, ~0 dBi at 5° elevation
- [ ] 3-element Yagi at 1λ: ~12 dBi at 15° elevation, ~6 dBi at 5° elevation
- [ ] Vertical ground-mounted: ~2 dBi at 15° elevation, ~0 dBi at 5° (better low-angle than dipole at low height)
- [ ] NVIS dipole at 1/4λ: ~6 dBi at 80° elevation, ~-5 dBi at 15° (correct NVIS pattern)
- [ ] Low dipole (1/4λ) on 10m DX path (5° takeoff): recommendations now correctly note poor antenna match
- [ ] High Yagi on 10m DX path: recommendations show full gain advantage
- [ ] Per-band antenna assignments persist in userStore
- [ ] DX Wizard power recommendations account for actual antenna gain at the required takeoff angle
- [ ] Antenna pattern polar plot renders correctly in settings/DX Wizard
- [ ] Default antenna (dipole at 1/2λ) produces results similar to old isotropic model for typical paths

**Files Created**:

- `src/lib/data/antennas.ts` — Antenna pattern library

**Files Modified**:

- `src/lib/utils/path.ts` — Add takeoff angle calculation
- `src/lib/utils/signal.ts` — Use antenna gain patterns
- `src/stores/userStore.ts` — Add antenna configuration
- `src/pages/DXWizard.tsx` — Add antenna selection step
- `src/components/settings/` — Add antenna configuration panel

---

### Feature C16: Propagation Mode Identification

**Review Reference**: Concrete #16 — "Propagation Mode Identification (F2, Es, TEP, NVIS)"

**Problem**: All predictions assume F2 propagation. Operators need to know the likely propagation mechanism to make informed decisions.

**Implementation**:

1. **Create propagation mode classifier** (`src/lib/utils/propagationModes.ts`):
   - `classifyPropagationMode(start, end, frequency, date, sfi, kp): PropagationMode[]` — returns ranked list of likely modes:
     - `F2_SINGLE_HOP` — distance < 3000 km, frequency < MUF
     - `F2_MULTI_HOP` — distance > 3000 km, frequency < MUF at all reflection points
     - `SPORADIC_E` — 6m/10m, seasonal (May-Aug NH), midlatitude paths, check spot evidence
     - `TEP` — trans-equatorial, frequency 28-50 MHz, both stations within 10° of magnetic equator, evening hours
     - `NVIS` — distance < 400 km, frequency < f0F2, high takeoff angle
     - `GRAY_LINE` — 160m/80m, endpoints in terminator zone
     - `LONG_PATH` — antipodal paths where long path may be favorable
     - `BACKSCATTER` — 6m/10m, forward scatter from Es or F2 footprint
     - `CHORDAL_HOP` — F2 layer ducting at shallow angles, very long single-hop paths
   - Each mode: `{ type, probability: 0-1, confidence: 0-1, notes: string, frequencyRange: [min, max] }`
   - `getPrimaryMode()` — highest probability mode
   - `getModeSummary()` — human-readable: "F2 multi-hop (3 hops, high confidence)"

2. **Integrate into PathAnalysis**:
   - Show "Propagation Mode" section with primary and alternate modes
   - Mode-specific advice: "TEP mode — best results on 28-50 MHz, peak around 20:00 local"

3. **Integrate into recommendations**:
   - Mode classification influences band selection and timing advice

**Acceptance Criteria**:

- [ ] W1→G path on 20m: classifies as F2_SINGLE_HOP or F2_MULTI_HOP (2 hops) with high confidence
- [ ] W1→VK path on 20m: classifies as F2_MULTI_HOP (4-5 hops)
- [ ] W1→nearby (200 km) on 80m: classifies as NVIS
- [ ] W1→G on 160m at sunrise: classifies as GRAY_LINE
- [ ] PY→LU on 6m in January evening: classifies as TEP candidate
- [ ] W1→G on 6m in June: classifies as SPORADIC_E candidate (seasonal)
- [ ] PathAnalysis displays propagation mode with explanation and confidence level
- [ ] Mode-specific frequency and timing advice is shown

**Files Created**:

- `src/lib/utils/propagationModes.ts`

**Files Modified**:

- `src/components/map/PathAnalysis.tsx` — Add propagation mode section
- `src/lib/utils/recommendations.ts` — Mode-aware recommendations

---

## Phase 2: Live Data Infrastructure

**Objective**: Replace demo/simulated DX cluster data with real-time feeds. Enable the bridge for hardware integration.

---

### Feature C1: Real DX Cluster Integration

**Review Reference**: Concrete #1 — "Real DX Cluster Integration (Critical)"

**Problem**: `dxcluster.ts` is entirely simulated with `generateDemoSpots()`. No real cluster data flows into the app.

**Implementation**:

1. **Create DX Cluster WebSocket relay in the bridge** (`bridge/src/cluster.ts`):
   - Telnet client connecting to configurable DX Spider nodes (default: `dxc.ve7cc.net:7300`)
   - Parse incoming `DX de` spots using existing `parseDXSpiderSpot()` from `dxcluster.ts`
   - Forward parsed spots to the browser via the existing bridge WebSocket protocol
   - New message type: `cluster.spot` with `DXSpot` payload
   - Support multiple simultaneous cluster connections (redundancy)
   - Auto-reconnect with exponential backoff on disconnect
   - Spot deduplication (same DX + frequency within 60s = same spot)
   - User-configurable filters at the bridge level (bands, modes)
   - `cluster.status` message reporting connection state

2. **Create DX Summit / WebCluster REST proxy** (`api/spots/dxcluster.ts`):
   - Vercel Edge Function that scrapes DX Summit or DXHeat API for recent spots
   - Provides a REST fallback when the bridge is not running
   - Returns `DXSpot[]` in the same format as the bridge spots
   - Cache: 30-second `s-maxage`

3. **Enhance frontend spot pipeline** (`src/lib/api/dxcluster.ts`):
   - Replace `fetchDemoSpots()` with real data sources:
     - Primary: bridge WebSocket (`cluster.spot` messages via `useBridge`)
     - Fallback: REST proxy (`/api/spots/dxcluster`)
     - Demo mode: existing `generateDemoSpots()` when neither is available
   - `getSpotSource()` — returns current source ("bridge", "rest", "demo")

4. **Update `useDXCluster` hook** (`src/hooks/useDXCluster.ts`):
   - Subscribe to bridge `cluster.spot` events when bridge is connected
   - Fall back to REST polling (30s interval) when bridge is unavailable
   - Fall back to demo mode when both are unavailable
   - Show source indicator in the spot list header

5. **Add bridge cluster configuration UI** (`src/components/settings/`):
   - Cluster node selection (dropdown of common nodes + custom entry)
   - Login callsign and optional password
   - Connection status indicator
   - Spot filter configuration (bands, modes, min SNR)

**Acceptance Criteria**:

- [ ] Bridge connects to DX Spider node and receives real DX spots
- [ ] Spots appear in the DX Spot List within 2 seconds of posting on the cluster
- [ ] `parseDXSpiderSpot()` correctly handles all DX Spider format variants (with/without grid, with/without LoTW indicator)
- [ ] Auto-reconnect works: disconnect network, wait 10s, reconnect → spots resume flowing
- [ ] REST fallback works: stop bridge → app switches to REST proxy → spots continue (with higher latency)
- [ ] Demo fallback works: no bridge + REST failure → demo spots display with "Demo Mode" indicator
- [ ] Source indicator shows "LIVE", "REST", or "DEMO" in the spot list header
- [ ] Bridge cluster configuration persists (node, callsign)
- [ ] Duplicate spots from same DX station within 60s are suppressed
- [ ] All existing spot filtering, watch system, and map rendering works identically with real spots
- [ ] Memory usage stays bounded: spots older than maxAge are evicted

**Files Created**:

- `bridge/src/cluster.ts` — Telnet DX cluster client
- `api/spots/dxcluster.ts` — Vercel Edge Function REST fallback
- `src/components/settings/ClusterSettings.tsx` — Bridge cluster configuration

**Files Modified**:

- `bridge/src/server.ts` — Integrate cluster module into message routing
- `bridge/src/types.ts` — Add cluster message types
- `src/lib/api/dxcluster.ts` — Replace demo with real + fallback chain
- `src/hooks/useDXCluster.ts` — Bridge subscription + REST fallback
- `src/types/bridge.ts` — Add cluster message types
- `src/components/dx/DXSpotList/DXSpotList.tsx` — Source indicator badge

---

### Feature C4: WSJT-X / JTDX UDP Integration

**Review Reference**: Concrete #4 — "WSJT-X / JTDX UDP Integration"

**Problem**: No integration with WSJT-X/JTDX. These are the dominant digital mode programs and broadcast rich decode data on UDP.

**Implementation**:

1. **Create WSJT-X UDP listener in the bridge** (`bridge/src/wsjtx.ts`):
   - UDP listener on configurable port (default 2237)
   - Parse WSJT-X protocol messages (QT-style QDataStream format):
     - `Status` (type 1): frequency, mode, DX call, DX grid, TX enabled, decoding, RX DF, TX DF
     - `Decode` (type 2): new, time, snr, delta_time, delta_frequency, mode, message, low_confidence
     - `Clear` (type 3): clear decodes
     - `QSO_Logged` (type 5): QSO complete notification
     - `Logged_ADIF` (type 12): ADIF record of logged QSO
   - Forward parsed messages to browser via bridge WebSocket:
     - `wsjtx.status` — rig frequency/mode/DX call
     - `wsjtx.decode` — individual FT8/FT4/JT65 decode with callsign, SNR, grid, mode
     - `wsjtx.qso_logged` — completed QSO for auto-logging
   - Aggregate decode statistics: decode rate per minute, unique callsigns, band activity density

2. **Create WSJT-X decode store** (`src/stores/wsjtxStore.ts`):
   - `decodes: WSJTXDecode[]` — recent decodes (max 500, rolling window)
   - `status: WSJTXStatus | null` — current WSJT-X state
   - `decodeRate: number` — decodes per minute
   - `uniqueCallsigns: Set<string>` — unique calls seen in last 15 minutes
   - Selectors: `selectDecodesByBand`, `selectDecodesByCQ`, `selectNewEntities` (cross-reference with dxccStore)

3. **Feed WSJT-X decodes into the spot pipeline**:
   - Convert `wsjtx.decode` messages to `LiveSpot` with `source: "WSJT-X"`
   - These are "heard" spots (not just reported by others) — badge them distinctly
   - Feed into `useLiveSpots` merge pipeline alongside PSKReporter/RBN/Cluster

4. **Auto-log WSJT-X QSOs** (`src/hooks/useWSJTXAutoLog.ts`):
   - On `wsjtx.qso_logged` message, parse the ADIF record and auto-create a logbook entry
   - Show toast notification: "QSO logged: W1AW on 20m FT8 (-12 dB)"
   - Cross-reference with dxccStore for new-entity celebrations

5. **WSJT-X status panel** (`src/components/dx/WSJTXStatusPanel.tsx`):
   - Show current WSJT-X frequency, mode, DX call
   - Decode rate indicator
   - "Heard" callsign list with SNR and DXCC need status
   - Band activity density heatmap (prep for Feature C23)

**Acceptance Criteria**:

- [ ] Bridge receives and parses WSJT-X UDP Status messages (frequency, mode, DX call)
- [ ] Bridge receives and parses WSJT-X UDP Decode messages (callsign, SNR, grid, mode, message text)
- [ ] Decodes appear in the spot list as "WSJT-X" source within 1 second of decode
- [ ] WSJT-X spots are distinguished visually from PSKReporter/RBN/Cluster spots (different badge color)
- [ ] `wsjtx.qso_logged` automatically creates a logbook entry with correct fields
- [ ] Auto-log toast shows callsign, band, mode, SNR
- [ ] New-entity decodes are highlighted with DXCC need status
- [ ] Decode rate indicator updates in real-time
- [ ] WSJT-X panel shows current frequency and mode
- [ ] Bridge correctly handles WSJT-X protocol binary format (big-endian QDataStream)
- [ ] Multiple WSJT-X instances on different ports are supported
- [ ] Graceful handling when WSJT-X is not running (no errors, no phantom data)

**Files Created**:

- `bridge/src/wsjtx.ts` — WSJT-X UDP protocol parser and listener
- `src/stores/wsjtxStore.ts` — WSJT-X decode state
- `src/hooks/useWSJTXAutoLog.ts` — Auto-logging hook
- `src/components/dx/WSJTXStatusPanel.tsx` — Status panel component

**Files Modified**:

- `bridge/src/server.ts` — Integrate WSJT-X listener
- `bridge/src/types.ts` — Add WSJT-X message types
- `src/types/bridge.ts` — Add WSJT-X message types
- `src/types/livespot.ts` — Add "WSJT-X" to SpotSource
- `src/hooks/useLiveSpots.ts` — Include WSJT-X decodes in merge
- `src/stores/dxStore.ts` — Add "WSJT-X" to available sources

---

### Feature C5: CAT Control / Rig Integration

**Review Reference**: Concrete #5 — "CAT Control / Rig Integration"

**Problem**: Band/mode selection is manual. The bridge scaffold has `rig.status`/`rig.set` types defined but no implementation.

**Implementation**:

1. **Implement CAT control in the bridge** (`bridge/src/rig.ts`):
   - Support two backends:
     - `hamlib` — connect to `rigctld` daemon via TCP (localhost:4532)
     - `flrig` — connect to `flrig` XML-RPC API (localhost:12345)
   - Poll rig status every 200ms: frequency, mode, S-meter, PTT state, VFO, split
   - Send rig commands: set frequency, set mode, set VFO, toggle PTT
   - Forward status to browser: `rig.status` messages (already typed in `bridge/src/types.ts`)
   - Accept commands from browser: `rig.set` messages (already typed)
   - Auto-detect backend: try hamlib first, then flrig, then give up gracefully

2. **Create rig control store** (`src/stores/rigStore.ts`):
   - `rigStatus: RigStatus | null` — current frequency, mode, S-meter, PTT, VFO
   - `isConnected: boolean`
   - `isCATEnabled: boolean` — user toggle
   - `setFrequency(hz)`, `setMode(mode)`, `togglePTT()` — send commands via bridge
   - `currentBand` — derived from frequency using `frequencyToBand()` from `bridge.ts`
   - `currentMode` — derived from rig mode

3. **Integrate CAT into contest page** (`src/pages/Contest.tsx`):
   - Auto-detect band/mode from rig (replace manual selectors when CAT is active)
   - "Tune to spot" button on spot rows
   - QSO frequency auto-populated from rig

4. **Integrate CAT into PropSphere** (`src/pages/PropSphere.tsx`):
   - "Tune" button on spot detail panels
   - Band sync: rig band change automatically filters spot list
   - S-meter display in the toolbar

5. **Add CAT settings panel** (`src/components/settings/CATSettings.tsx`):
   - Backend selection (hamlib/flrig/auto)
   - Connection status
   - Test connection button
   - PTT safety lockout option

**Acceptance Criteria**:

- [ ] Bridge connects to rigctld and reads frequency/mode every 200ms
- [ ] Bridge connects to flrig XML-RPC and reads frequency/mode
- [ ] Frequency changes on the radio appear in the browser within 500ms
- [ ] `setFrequency(14074000)` tunes the radio to 14.074 MHz
- [ ] `setMode("USB")` changes the radio mode
- [ ] Contest page auto-detects band/mode from rig when CAT is enabled
- [ ] "Tune to spot" button on a 14.230 MHz SSB spot: radio tunes to 14.230 and sets USB mode
- [ ] S-meter reading displays in real-time (updated 5x/sec)
- [ ] PTT safety lockout prevents accidental transmission
- [ ] Auto-detect backend: tries hamlib → flrig → reports "no backend found"
- [ ] Graceful degradation: CAT disconnect → fall back to manual band/mode selection with notification
- [ ] Settings panel shows connection status and backend type

**Files Created**:

- `bridge/src/rig.ts` — CAT control backends (hamlib/flrig)
- `src/stores/rigStore.ts` — Rig control state
- `src/components/settings/CATSettings.tsx` — CAT settings panel

**Files Modified**:

- `bridge/src/server.ts` — Integrate rig control into message routing (replace echo stub)
- `src/pages/Contest.tsx` — Auto band/mode from rig, tune-to-spot
- `src/pages/PropSphere.tsx` — Tune button, S-meter, band sync
- `src/components/dx/DXSpotList/SpotRow.tsx` — "Tune" action button
- `src/components/dx/SpotDetailPanel.tsx` — "Tune to frequency" button

---

## Phase 3: Intelligence & Correlation

**Objective**: Build the engines that connect live data with propagation models.

---

### Feature C2: Spot-Model Correlation Engine

**Review Reference**: Concrete #2 — "Spot-Model Correlation Engine"

**Problem**: Propagation predictions and live spot data are completely independent pipelines.

**Implementation**:

1. **Create correlation engine** (`src/lib/utils/spotCorrelation.ts`):
   - `correlateSpotWithModel(spot, prediction): CorrelationResult`:
     - Compare spot's band/path with model prediction for that band/path
     - Result: `{ agreement: "confirmed" | "discrepancy" | "surprise", modelStatus, spotEvidence, confidenceAdjustment }`
   - `aggregateCorrelation(spots[], predictions): BandCorrelationSummary[]`:
     - Per-band summary: model prediction vs. spot count, average SNR from spots, correlation score
     - Detect: "model says closed but spots exist" (surprise opening) and "model says open but no spots" (possible overestimate)
   - `getModelConfidence(band, region, spotCount, modelStatus): number`:
     - Dynamic confidence: high spot density + model agreement = high confidence; discrepancy = lower confidence, flagged
   - `detectAnomalies(spots[], predictions): PropagationAnomaly[]`:
     - Sudden burst of spots on a band predicted closed → flag as possible Es or anomalous propagation
     - Model predicts "excellent" with zero spots → flag as possible overestimate

2. **Create correlation indicator component** (`src/components/map/CorrelationIndicator.tsx`):
   - Traffic-light indicator per band: green (confirmed), yellow (unverified), red (discrepancy)
   - Tooltip with details: "Model: Good, Spots: 23 (avg -8dB) — Confirmed"
   - Integrate into BandConditionsPanel alongside existing status indicators

3. **Feed correlation back into recommendations**:
   - `getRecommendations()` — annotate recommendations with correlation confidence
   - "20m is predicted Good and confirmed by 45 PSKReporter spots" vs. "15m is predicted Fair but no spots detected — use with caution"

**Acceptance Criteria**:

- [ ] Band with "Excellent" prediction and 30+ spots: correlation = "confirmed", confidence > 85%
- [ ] Band with "Closed" prediction and 10+ spots: correlation = "surprise", anomaly flag raised
- [ ] Band with "Good" prediction and 0 spots: correlation = "unverified", confidence lowered
- [ ] Correlation indicators render in BandConditionsPanel with correct colors
- [ ] Tooltip shows model vs. spot evidence summary
- [ ] Recommendations include correlation confidence in their text
- [ ] Anomaly detection fires within 30 seconds of an unexpected spot burst
- [ ] Correlation updates as new spots arrive (not just on initial load)

**Files Created**:

- `src/lib/utils/spotCorrelation.ts`
- `src/components/map/CorrelationIndicator.tsx`

**Files Modified**:

- `src/components/map/BandConditionsPanel.tsx` — Add correlation indicators
- `src/lib/utils/recommendations.ts` — Correlation-aware recommendations

---

### Feature C3: Sporadic E Detection & Prediction

**Review Reference**: Concrete #3 — "Sporadic E Layer Detection & Prediction"

**Problem**: Zero sporadic E support in the ionospheric model. Es is the most exciting propagation mode for 6m/10m.

**Implementation**:

1. **Create Es detection engine** (`src/lib/utils/sporadicE.ts`):
   - `detectEsOpening(spots[], timeWindowMinutes): EsDetection | null`:
     - Monitor spot density on 6m (50 MHz) and 10m (28 MHz)
     - Trigger detection when: >= 5 spots on 6m or >= 10 spots on 10m within 5 minutes, from a geographic cluster
     - Estimate Es cloud center: centroid of spot midpoints
     - Estimate cloud extent: radius encompassing 80% of spot paths
   - `getEsSeasonalProbability(month, lat): number`:
     - Northern hemisphere peak: May-August (June peak), secondary: December
     - Southern hemisphere: November-February
     - Midlatitudes (30-60°): highest probability
   - `getEsRegionalForecast(date, lat): EsForecast`:
     - Combine seasonal probability with current solar/geomagnetic conditions
     - Return: probability, expected frequency ceiling, typical duration
   - `isEsPathViable(startLat, startLon, endLat, endLon): boolean`:
     - Es hop distance: typically 800-2300 km (single hop)
     - Multi-hop Es: rare but possible for longer paths

2. **Create Es map layer** (`src/components/map/SporadicELayer.tsx`):
   - Display detected Es clouds as semi-transparent overlays on the map
   - Color by intensity (number of supporting spots)
   - Animated pulse to draw attention
   - Forecast overlay: seasonal Es probability heat map

3. **Create Es alert** (`src/lib/services/esAlertService.ts`):
   - Fire high-priority alert when Es is detected on the user's path or target region
   - "Es opening detected: 6m spots between EU and NA. Estimated MUF > 50 MHz."

4. **Integrate into band conditions**:
   - When Es is detected or seasonally likely, add Es assessment to 6m and 10m predictions
   - Override "Closed" status with "Es Possible" or "Es Active"

**Acceptance Criteria**:

- [ ] 8 spots on 50 MHz within 3 minutes from EU-NA paths → Es detection triggered
- [ ] Detected Es cloud shows on map as overlay with centroid and extent
- [ ] June in Northern midlatitudes: `getEsSeasonalProbability(6, 45)` returns > 0.5
- [ ] December in Northern midlatitudes: secondary peak probability
- [ ] Es path viability: 1500 km path = viable, 5000 km path = requires multi-hop
- [ ] Es alert fires when detected on paths near user's station
- [ ] BandConditionsPanel shows "Es Active" for 6m when detection is active
- [ ] Es seasonal forecast renders as heat map on globe/flat map
- [ ] Alert includes estimated MUF and expected duration
- [ ] Es detection resets after 15 minutes of no supporting spots

**Files Created**:

- `src/lib/utils/sporadicE.ts`
- `src/components/map/SporadicELayer.tsx`
- `src/lib/services/esAlertService.ts`

**Files Modified**:

- `src/lib/utils/bands.ts` — Es-aware band conditions for 6m/10m
- `src/stores/mapStore.ts` — Add Es layer toggle
- `src/pages/PropSphere.tsx` — Register Es layer
- `src/components/map/BandConditionsPanel.tsx` — Es status indicators

---

### Feature C20: Real-Time Propagation Heatmap from Spot Data

**Review Reference**: Concrete #20 — "Real-Time Propagation Heatmap from Spot Data"

**Problem**: MUF overlay uses model-only predictions. Live spots provide empirical evidence of actual propagation.

**Implementation**:

1. **Create observed MUF engine** (`src/lib/utils/observedMUF.ts`):
   - `calculateObservedMUF(spots[], gridResolution): ObservedMUFGrid`:
     - For each grid cell, find the highest frequency with confirmed spots (bidirectional contact or spot with SNR)
     - This represents empirical minimum MUF for that path
   - `compareModelVsObserved(modelMUF, observedMUF): MUFDivergenceGrid`:
     - Cells where observed > model: green highlight ("propagation better than predicted")
     - Cells where observed < model: orange highlight ("propagation worse than predicted")
     - Cells with no data: neutral ("unconfirmed")
   - Update grid every 60 seconds from latest spots

2. **Create observed MUF map layer**:
   - Overlay option in layer controls: "Observed MUF" alongside existing "MUF" (modeled)
   - Toggle: Model Only | Observed Only | Combined (divergence highlighted)
   - Color-coded grid cells matching existing MUF color scheme

3. **Integrate into BandConditionsPanel**:
   - Show "Observed" column alongside "Predicted" for each band
   - e.g., "20m: Predicted Good | Observed: 45 spots (avg -8 dB)"

**Acceptance Criteria**:

- [ ] Grid cell with 50 MHz spots shows observed MUF >= 50 MHz
- [ ] Grid cell with no spots shows "no data" (not "closed")
- [ ] Model-vs-observed divergence correctly highlights when observed MUF exceeds model prediction
- [ ] Observed MUF updates every 60 seconds with fresh spot data
- [ ] Layer toggle works: Model / Observed / Combined
- [ ] BandConditionsPanel shows spot count alongside predicted status
- [ ] Performance: observed MUF grid generation completes in < 200ms for 1000 spots
- [ ] Grid resolution configurable (default 10°, option for 5° for higher detail)

**Files Created**:

- `src/lib/utils/observedMUF.ts`
- `src/components/map/ObservedMUFLayer.tsx`

**Files Modified**:

- `src/stores/mapStore.ts` — Add observed MUF layer toggle
- `src/pages/PropSphere.tsx` — Register observed MUF layer
- `src/components/map/BandConditionsPanel.tsx` — Observed column

---

### Feature QoL14: Band Opening Detection & Alert

**Review Reference**: QoL #14 — "Propagation Alert: Band Just Opened"

**Problem**: Watch system monitors individual callsigns/grids/entities, not aggregate band-opening events.

**Implementation**:

1. **Create band opening detector** (`src/lib/services/bandOpeningDetector.ts`):
   - Monitor spot density per band per continent-pair over sliding time windows
   - Detect: transition from <2 spots to >= 5 spots within 3 minutes on a band-region pair
   - `BandOpening: { band, fromRegion, toRegion, detectedAt, spotCount, averageSNR, duration }`
   - Historical baseline: if 10m to JA has averaged 0 spots/hour for the last 3 hours and suddenly gets 5, that's an opening
   - `getCurrentOpenings(): BandOpening[]`
   - `subscribeToOpenings(callback): unsubscribe`

2. **Integrate into alert system** (`src/stores/alertsStore.ts`):
   - New alert type: `BAND_OPENING` with priority based on band rarity (6m opening = CRITICAL, 20m opening = INFO)
   - Deduplicate: same band-region opening within 30 minutes = same event
   - Include in notification batching (don't fire 5 alerts for 5 bands opening simultaneously)

3. **Band opening indicator in UI**:
   - Pulsing badge on band tabs when an opening is detected
   - Notification card: "10m just opened to JA! 8 spots in the last 2 minutes. Average SNR: -6 dB"
   - Optional audio alert (distinct from watch alerts)

**Acceptance Criteria**:

- [ ] 10m goes from 0 spots to JA to 6 spots in 2 minutes → BAND_OPENING alert fires
- [ ] Same opening continuing → no duplicate alert for 30 minutes
- [ ] Alert includes band, region pair, spot count, and average SNR
- [ ] 6m opening → CRITICAL priority; 20m opening → INFO priority
- [ ] Band opening badge pulses on the relevant band tab in BandConditionsPanel
- [ ] Notification card shows actionable information
- [ ] Detector correctly ignores bands that are normally open (20m daytime)
- [ ] Night-time opening on 15m (unusual) → triggers alert

**Files Created**:

- `src/lib/services/bandOpeningDetector.ts`

**Files Modified**:

- `src/stores/alertsStore.ts` — Add BAND_OPENING alert type
- `src/components/map/BandConditionsPanel.tsx` — Opening indicator
- `src/lib/services/alertService.ts` — Band opening notifications

---

## Phase 4: QSL Services & Credentials

**Objective**: Connect the app to LoTW, Club Log, eQSL for real QSL workflow.

---

### Feature QoL2: Persistent Service Credentials with Encryption

**Review Reference**: QoL #2 — "Persistent Service Credentials with Encryption"

**Implementation**:

1. **Create encrypted credential store** (`src/lib/db/credentialStore.ts`):
   - Use Web Crypto API: `AES-GCM` with 256-bit key derived from passphrase via `PBKDF2` (100,000 iterations, SHA-256)
   - Store encrypted credentials in IndexedDB (not localStorage)
   - `setPassphrase(passphrase)` — derives encryption key, stores salt
   - `saveCredential(service, username, password)` — encrypts and stores
   - `getCredential(service): {username, password} | null` — decrypts
   - `isUnlocked(): boolean` — passphrase has been entered this session
   - `lock()` — clears derived key from memory
   - Auto-lock after configurable inactivity timeout (default 30 minutes)

2. **Create passphrase prompt component** (`src/components/settings/PassphrasePrompt.tsx`):
   - Modal that appears when credential access is needed and store is locked
   - "Remember for this session" checkbox (default: checked)
   - Passphrase strength indicator
   - "Set new passphrase" flow for first-time setup

3. **Integrate with userStore**:
   - `serviceCredentials` in userStore now reads from credentialStore
   - On app load: check if credentials exist in IndexedDB → prompt for passphrase
   - Settings panel shows which services have saved credentials (without revealing them)

**Acceptance Criteria**:

- [ ] Credentials encrypted at rest in IndexedDB (not readable without passphrase)
- [ ] Passphrase prompt appears once per session
- [ ] Wrong passphrase: decryption fails gracefully with "incorrect passphrase" message
- [ ] Auto-lock after 30 minutes of inactivity clears key from memory
- [ ] Credential export: NOT included in settings backup (security)
- [ ] "Forget credentials" button completely removes from IndexedDB
- [ ] AES-GCM encryption with unique IV per credential
- [ ] PBKDF2 with 100,000 iterations (not fast-crackable)
- [ ] Settings panel shows service names with lock/unlock status (never shows passwords)

**Files Created**:

- `src/lib/db/credentialStore.ts`
- `src/components/settings/PassphrasePrompt.tsx`

**Files Modified**:

- `src/stores/userStore.ts` — Integrate credential store
- `src/components/settings/` — Credential management UI

---

### Feature C6: LoTW / Club Log / eQSL Integration

**Review Reference**: Concrete #6 — "LoTW / Club Log / eQSL Actual Integration"

**Implementation**:

1. **Create LoTW service** (`src/lib/services/lotwService.ts`):
   - Upload: POST ADIF to LoTW HTTPS endpoint with TQ8 digital signature
   - Download: fetch QSL records from LoTW, parse ADIF response
   - `uploadToLoTW(entries[], credentials): UploadResult`
   - `downloadFromLoTW(credentials, since?): LoTWRecord[]`
   - `syncLoTWConfirmations(credentials)` — download + update dxccStore confirmed status

2. **Enhance Club Log service** (existing `api/log/clublog.ts` edge function):
   - Currently only uploads. Add download/query API.
   - `uploadToClubLog(entries[], credentials): UploadResult` — already exists
   - `getClubLogStatus(callsign, credentials): ClubLogRecord[]` — new endpoint
   - Real-time upload: option to auto-upload each QSO as it's logged

3. **Enhance eQSL service** (existing `api/log/eqsl.ts` edge function):
   - Currently only uploads. Add inbox check.
   - `uploadToEQSL(entries[], credentials): UploadResult` — already exists
   - `checkEQSLInbox(credentials): EQSLRecord[]` — new: check for incoming eQSLs
   - `downloadEQSLCards(credentials): EQSLCard[]` — retrieve card images

4. **Create QSL management panel** (`src/components/logbook/QSLManager.tsx`):
   - Unified view: per-QSO confirmation status across all services
   - Bulk upload controls (upload all unconfirmed)
   - Sync status: last sync time, pending uploads count
   - Per-service status indicators (green = synced, yellow = pending, red = error)

5. **Auto-sync on QSO log**:
   - When a new QSO is logged, automatically queue for upload to enabled services
   - Background sync every 5 minutes for pending uploads
   - Toast notifications for successful uploads and new confirmations

**Acceptance Criteria**:

- [ ] Upload 10 QSOs to Club Log: all return success, entries marked as uploaded
- [ ] Upload 10 QSOs to eQSL: all return success
- [ ] LoTW download returns confirmed QSOs; dxccStore is updated with confirmed entities/bands
- [ ] QSL Manager shows per-QSO status: LoTW ✓, Club Log ✓, eQSL pending
- [ ] Auto-upload triggers within 10 seconds of logging a new QSO
- [ ] Failed upload: retry with exponential backoff, error shown in QSL Manager
- [ ] Credentials accessed via encrypted credential store (never in plaintext localStorage)
- [ ] Bulk upload handles 1000+ QSOs without timeout
- [ ] New LoTW confirmation triggers DXCC status update (if new confirmed entity)
- [ ] Background sync runs every 5 minutes when services are configured

**Files Created**:

- `src/lib/services/lotwService.ts`
- `src/components/logbook/QSLManager.tsx`
- `api/log/lotw.ts` — New edge function for LoTW proxy
- `api/callsign/clublog-status.ts` — New edge function for Club Log status query
- `api/log/eqsl-inbox.ts` — New edge function for eQSL inbox

**Files Modified**:

- `api/log/clublog.ts` — Add status query support
- `api/log/eqsl.ts` — Add inbox check support
- `src/lib/db/types.ts` — Add QSL sync metadata fields to LogEntry
- `src/components/logbook/LogUploadModal.tsx` — Integrate with new services
- `src/stores/dxccStore.ts` — Mark confirmations from LoTW sync

---

## Phase 5: Contest & Operational Enhancements

**Objective**: Expand contest support and add operational workflow features.

---

### Feature C12: Contest Database Expansion

**Review Reference**: Concrete #12 — "Contest Database Expansion"

**Implementation**: Add 15+ new contest definitions to `src/lib/data/contests.ts`:

| Contest             | Score Model | Key Complexity                           |
| ------------------- | ----------- | ---------------------------------------- |
| WAE DX CW/SSB       | per_band    | QTC system (unique exchange batching)    |
| JIDX CW/SSB         | per_band    | JA-centric multipliers                   |
| All Asian DX CW/SSB | per_band    | AS-only multipliers                      |
| Oceania DX CW/SSB   | per_band    | OC-centric multipliers                   |
| IOTA                | per_band    | Island reference multipliers             |
| Stew Perry Top Band | distance    | Distance-based scoring (implement stub!) |
| Sprint CW/SSB       | total       | Name exchange, QSY rule                  |
| NAQP RTTY           | total       | State multipliers                        |
| CQ WW VHF           | per_band    | Grid square multipliers                  |
| CA QSO Party        | total       | County multipliers (CA)                  |
| TX QSO Party        | total       | County multipliers (TX)                  |
| PA QSO Party        | total       | County multipliers (PA)                  |
| FL QSO Party        | total       | County multipliers (FL)                  |
| OH QSO Party        | total       | County multipliers (OH)                  |

Additional implementation:

- **Distance scoring** (`src/lib/contest/scoring.ts`): implement the stub at `computeQSOPoints` → `distance` case using grid-to-grid great circle distance
- **QTC system** for WAE: `src/lib/contest/qtc.ts` — batch exchange tracking, deduplication, QTC scoring
- **County multiplier type** in `src/lib/contest/multipliers.ts` — new `COUNTY` type with per-state county lists
- **Grid multiplier type** — `GRID_SQUARE` for VHF contests (4-char Maidenhead)

**Acceptance Criteria**:

- [ ] All 15+ new contests have complete definitions with correct scoring rules
- [ ] Distance-based scoring calculates great-circle distance from grid squares
- [ ] WAE QTC system tracks batches of 10 QSOs, prevents duplicate QTCs
- [ ] Stew Perry scoring: 1 point per 500 km, round up
- [ ] Sprint QSY rule: warning if operator doesn't QSY after each QSO in run mode
- [ ] State QSO Party county multipliers: all 58 CA counties, 254 TX counties
- [ ] Grid square multipliers for VHF: 4-char Maidenhead squares
- [ ] All new contests produce valid Cabrillo 3.0 output
- [ ] Exchange parsing handles all new formats (county abbreviations, grid squares, QTC references)
- [ ] Each contest has correct category templates (operator/power/band/mode)

**Files Created**:

- `src/lib/contest/qtc.ts` — WAE QTC system
- `src/lib/data/counties.ts` — State QSO Party county lists

**Files Modified**:

- `src/lib/data/contests.ts` — Add 15+ contest definitions
- `src/lib/contest/scoring.ts` — Implement distance scoring
- `src/lib/contest/multipliers.ts` — Add COUNTY and GRID_SQUARE types
- `src/lib/contest/cabrillo.ts` — Handle new exchange formats
- `src/lib/contest/validation.ts` — Validate new exchange types
- `src/lib/contest/parsing.ts` — Parse new exchange formats

---

### Feature C13: External SCP Database Support

**Review Reference**: Concrete #13 — "External SCP Database Support"

**Implementation**:

1. **Create SCP file parser** (`src/lib/contest/scpImport.ts`):
   - Parse MASTER.SCP format (one callsign per line, UTF-8)
   - Parse CT/NA call history files (CSV with callsign, name, section, etc.)
   - `loadSCPFile(fileContent): string[]` — returns callsign array
   - `loadCallHistoryFile(fileContent): CallHistoryEntry[]` — returns enriched entries
   - Store in IndexedDB for persistence (the file is ~2MB, too large for localStorage)

2. **Enhance SCP matching** (`src/lib/contest/scp.ts`):
   - Merge session history with imported MASTER.SCP database
   - Priority: session history (has band/time data) > imported SCP (callsign only)
   - `getSCPMatchesDetailed()` — indicates source (session vs. database)

3. **Add SCP import UI** to contest settings:
   - File picker for MASTER.SCP
   - Auto-download from supercheckpartial.com (via edge function proxy)
   - "Last updated" indicator
   - Database size indicator (e.g., "58,234 callsigns loaded")

**Acceptance Criteria**:

- [ ] MASTER.SCP file (~60,000 callsigns) loads in < 1 second
- [ ] Typing "W7" returns instant matches from both session and database
- [ ] Session matches rank above database-only matches
- [ ] Database persists in IndexedDB across sessions
- [ ] Auto-download from supercheckpartial.com works via proxy
- [ ] Call history files provide name/section hints in the match results
- [ ] 2-character minimum for matching (no single-letter floods)
- [ ] Memory usage: ~5MB for full database (acceptable for IndexedDB)

**Files Created**:

- `src/lib/contest/scpImport.ts`
- `api/contest/scp.ts` — Edge function proxy for MASTER.SCP download

**Files Modified**:

- `src/lib/contest/scp.ts` — Merge imported database
- `src/lib/db/index.ts` — Add SCP object store to IndexedDB schema

---

### Feature C17: Contest Rate Optimization & Band-Change Advisor

**Review Reference**: Concrete #17 — "Contest Rate Optimization & Band-Change Advisor"

**Implementation**:

1. **Create band-change advisor** (`src/lib/contest/bandAdvisor.ts`):
   - Monitor: current run rate (5-minute rolling), historical rate on this band, spot density trends
   - `getBandChangeAdvice(session, spots, predictions): BandAdvice`:
     - "Rate dropped below 30/hr on 20m. 15m has 45 spots with avg -6dB. Consider QSY."
     - "40m opening to EU predicted in 18 minutes. Switch to catch the opening."
     - "Current rate is 85/hr. Stay on frequency — you're in a pile-up."
   - Factor in: multiplier needs (is there a needed mult spotted on another band?), propagation forecast, historical rate for this hour of the contest
   - `shouldNotify(): boolean` — only advise when rate drops significantly or clear opportunity exists

2. **Create advisor panel** (`src/components/contest/BandAdvisor.tsx`):
   - Compact panel showing: current rate vs. historical, next predicted opening, top multiplier opportunity
   - "Switch to 15m" action button (with CAT integration, actually tunes the radio)
   - Snooze option (don't advise for N minutes)

3. **Integrate with contest page**:
   - Advisor panel in the contest UI alongside the scoreboard
   - Non-intrusive: suggestions appear as subtle toasts unless rate drops below threshold

**Acceptance Criteria**:

- [ ] Rate below 30/hr when another band has 20+ spots → "Consider QSY" advice
- [ ] Rate above 60/hr → "Stay on frequency" advice (no unnecessary suggestions)
- [ ] Needed multiplier spotted on another band → "Mult opportunity: 3DA0WW on 15m"
- [ ] Predicted band opening → "15m to EU opening in 22 min"
- [ ] Advisor panel renders without disrupting contest entry flow
- [ ] Snooze button suppresses advice for configurable period
- [ ] Action button tunes radio when CAT is connected
- [ ] Advice updates every 30 seconds (not too frequent, not too stale)

**Files Created**:

- `src/lib/contest/bandAdvisor.ts`
- `src/components/contest/BandAdvisor.tsx`

**Files Modified**:

- `src/pages/Contest.tsx` — Add advisor panel

---

### Feature QoL6: Contest Timer & Off-Time Tracker

**Review Reference**: QoL #6 — "Contest Timer & Off-Time Tracker"

**Implementation**:

1. **Create off-time tracker** (`src/lib/contest/offTimeTracker.ts`):
   - Track operating periods: start/stop times based on QSO timestamps
   - Calculate: total operating time, total off-time, off-time remaining to meet minimums
   - Contest rules: CQ WW single-op 48h = max 42h operating; ARRL SS 24h = max 24h; etc.
   - `getOffTimeStatus(session): OffTimeStatus`:
     - `totalOperatingMinutes`, `totalOffTimeMinutes`, `requiredOffTimeMinutes`
     - `mustStopBy: Date | null` — if they haven't taken enough off-time yet
     - `isViolation: boolean` — currently violating off-time rules
   - Detect operating gaps automatically from QSO timestamps (gap > 30 min = off-time period)

2. **Create timer component** (`src/components/contest/ContestTimer.tsx`):
   - Contest clock: time elapsed / total contest duration
   - Off-time accumulator with visual progress bar
   - Warning: "You need 2h 15m more off-time before the contest ends"
   - Critical alert: "Off-time violation! Take a break now."

3. **Integrate with contest page and alerting**:
   - Timer in contest header
   - Alert when approaching off-time threshold

**Acceptance Criteria**:

- [ ] CQ WW 48h: correctly calculates 42h operating limit and 6h required off-time
- [ ] Gap detection: 35-minute gap between QSOs → counted as off-time
- [ ] 15-minute gap → NOT counted as off-time (too short)
- [ ] Warning when < 2 hours of off-time remain and contest end is approaching
- [ ] Critical alert when off-time violation is imminent (< 30 minutes until must-stop)
- [ ] Timer displays HH:MM:SS countdown to contest end
- [ ] Off-time progress bar shows taken vs. required
- [ ] No false alarms for contests without off-time rules (e.g., 12-hour NAQP)
- [ ] Operating time periods are visually displayed on a timeline

**Files Created**:

- `src/lib/contest/offTimeTracker.ts`
- `src/components/contest/ContestTimer.tsx`

**Files Modified**:

- `src/pages/Contest.tsx` — Add timer component
- `src/lib/data/contests.ts` — Add off-time rules per contest

---

## Phase 6: Satellite & Specialized Propagation

**Objective**: Satellite frequency management and terrain-aware path analysis.

---

### Feature C15: Satellite Doppler & Uplink/Downlink Frequency Management

**Review Reference**: Concrete #15

**Implementation**:

1. **Create transponder database** (`src/lib/data/satelliteTransponders.ts`):
   - Per-satellite: uplink range, downlink range, inverted/non-inverted, mode (FM/linear/digital), beacon frequency
   - Cover: ISS, SO-50, AO-91, IO-117, RS-44, FO-99, QO-100, CAS-4A/B, TEVEL-1

2. **Create Doppler calculator** (`src/lib/utils/doppler.ts`):
   - `calculateDoppler(satellitePosition, observerPosition, frequency): number` — instantaneous Doppler shift from range-rate
   - `getCorrectedFrequencies(sat, observer, date): { uplink, downlink }` — real-time corrected frequencies
   - `getDopplerCurve(sat, observer, passStartDate, passEndDate, frequency): DopplerPoint[]` — full pass Doppler curve

3. **Enhance satellite panel** (`src/components/map/SatellitePanel.tsx`):
   - Show transponder info alongside pass predictions
   - Real-time Doppler-corrected uplink/downlink frequencies during pass
   - "Tune" button (with CAT) for automatic frequency tracking

**Acceptance Criteria**:

- [ ] RS-44 at 500 km altitude, overhead: Doppler shift ~±3.5 kHz on 435 MHz
- [ ] QO-100 (geostationary): Doppler shift ~0 Hz (correct for GEO)
- [ ] Corrected frequencies update every second during active pass
- [ ] Inverted transponder: uplink increase = downlink decrease (correct inversion)
- [ ] Transponder data exists for all 9 categorized satellites
- [ ] "Tune" button sends correct Doppler-corrected frequency to rig via CAT
- [ ] Doppler curve shows the characteristic S-curve shape for LEO passes

**Files Created**:

- `src/lib/data/satelliteTransponders.ts`
- `src/lib/utils/doppler.ts`

**Files Modified**:

- `src/components/map/SatellitePanel.tsx` — Transponder + Doppler display
- `src/lib/api/satellites.ts` — Add range-rate calculation

---

### Feature C22: Terrain-Aware Path Analysis

**Review Reference**: Concrete #22

**Implementation**:

1. **Create terrain classifier** (`src/lib/utils/terrain.ts`):
   - Use simplified land-water mask (world-atlas coastline data already in dependencies)
   - `classifyTerrain(lat, lon): "sea" | "land" | "coastal"` — point-in-polygon test against coastlines
   - `classifyPathTerrain(points[]): TerrainType[]` — classify each ground bounce point
   - `getPathTerrainLoss(terrainTypes[], frequency): number` — sum per-hop loss based on terrain

2. **Integrate into ray trace** (`src/lib/utils/rayTrace.ts`):
   - Ground bounce points classified as sea/land/coastal
   - Per-hop ground reflection loss: sea = 1 dB, land = 3 dB, coastal = 2 dB

3. **Display terrain classification in PathAnalysis**:
   - Show terrain type at each bounce point on the path visualization
   - Total terrain penalty in path loss breakdown

**Acceptance Criteria**:

- [ ] W1→G path: first bounce in Atlantic = "sea" (1 dB), correct lower loss
- [ ] W6→JA path: all bounces Pacific = "sea" (1 dB each)
- [ ] W1→VE3 path: bounce in land = "land" (3 dB)
- [ ] Total terrain loss difference between all-sea and all-land 4-hop path: ~8 dB
- [ ] PathAnalysis shows terrain icons (wave/tree/mixed) at each bounce point
- [ ] Point-in-polygon test performs in < 10ms per point (using simplified coastlines)

**Files Created**:

- `src/lib/utils/terrain.ts`

**Files Modified**:

- `src/lib/utils/rayTrace.ts` — Terrain-aware ground loss
- `src/lib/utils/signal.ts` — Accept terrain types in path loss calculation
- `src/components/map/PathAnalysis.tsx` — Terrain display

---

### Feature C19: Historical Propagation Pattern Database

**Review Reference**: Concrete #19

**Implementation**:

1. **Create historical propagation database** (`src/lib/data/historicalPropagation.ts`):
   - Index by: `{ sfiRange: [low, high], month, bandGroup: "low" | "high" | "vhf" }`
   - Per entry: typical openings by region pair, peak hours, expected SNR range
   - Source: curated from NOAA solar cycle archives + published contest results data
   - Covering Solar Cycles 22-25 (1986-present)

2. **Create historical context component** (`src/components/solar/SolarCycleContext.tsx`):
   - Current position in Solar Cycle 25 with cycle curve overlay
   - "At this SFI level in cycle 24, 12m was open to Asia 14-18Z in October"
   - Comparison to previous cycle peaks
   - Trend indicator: rising/plateau/declining

3. **Integrate into SolarPulse and PropSphere**:
   - SolarPulse: cycle context card with historical comparison
   - PropSphere: "Historical note" in recommendations when conditions match known patterns

**Acceptance Criteria**:

- [ ] SFI=150, October → historical data shows 12m openings to Asia at 14-18Z
- [ ] Solar cycle curve correctly plots SC25 with actual smoothed SSN data
- [ ] "Compared to SC24 peak" annotation shows relative position
- [ ] Historical patterns cover at least the 4 major contest weekends (CQ WW, ARRL DX)
- [ ] Trend indicator correctly identifies rising/plateau/declining from recent SFI trend

**Files Created**:

- `src/lib/data/historicalPropagation.ts`
- `src/components/solar/SolarCycleContext.tsx`

**Files Modified**:

- `src/pages/SolarPulse.tsx` — Add cycle context card
- `src/lib/utils/recommendations.ts` — Historical pattern notes

---

## Phase 7: UX & Workflow Polish

**Objective**: Quality-of-life improvements for daily operations.

---

### Feature QoL1: Keyboard-First DX Spot Interaction

Arrow keys, Enter-to-tune, W-to-watch, N-to-mark-needed, B-for-bearing. Full keyboard navigation of spot list.

**Files Modified**: `DXSpotList.tsx`, `SpotRow.tsx`, `PropSphere.tsx` (keyboard handler)

**Acceptance Criteria**:

- [ ] Arrow Up/Down navigates spot list with visible focus indicator
- [ ] Enter on focused spot: tunes radio (CAT) or sets target on map (no CAT)
- [ ] W on focused spot: adds a watch for the spotted callsign's entity
- [ ] B on focused spot: draws bearing line on map from station to DX
- [ ] Page Up/Down: scroll 10 spots at a time
- [ ] Escape: deselect spot and return focus to entry field
- [ ] Focus trap: keyboard navigation stays within spot list until Escape
- [ ] Screen reader accessible (aria-activedescendant, aria-selected)

---

### Feature QoL3: Spot Age Decay Visualization

Progressive opacity/saturation fade on map pins and spot rows based on age.

**Files Modified**: `LiveSpotArcs.tsx`, `SpotMarker.tsx`, `SpotRow.tsx`

**Acceptance Criteria**:

- [ ] Fresh spots (< 2 min): 100% opacity, full saturation
- [ ] Aging spots (2-10 min): linear fade to 60% opacity
- [ ] Stale spots (10-15 min): 40% opacity, desaturated
- [ ] Expired spots (> maxAge): removed from display
- [ ] Spot list rows: subtle background tint fading with age
- [ ] Age decay is smooth (not stepwise jumps) — uses CSS transitions
- [ ] User preference respected: `spotAgePrefs` in userStore controls behavior

---

### Feature QoL4: One-Click "Work This Station" Flow

Click a spot → instant propagation assessment, bearing, TX power recommendation, and optional auto-tune.

**Files Created**: `src/components/dx/WorkStationPanel.tsx`
**Files Modified**: `SpotRow.tsx`, `SpotDetailPanel.tsx`

**Acceptance Criteria**:

- [ ] Click spot → panel shows: bearing, distance, propagation assessment, suggested TX power, target frequency
- [ ] Data appears within 200ms (no loading spinner for propagation model)
- [ ] "Tune" button: tunes radio via CAT (when connected)
- [ ] "Log QSO" button: opens QSO entry form pre-populated with spot data
- [ ] "Set Target" button: sets the spotted station as map target for full path analysis
- [ ] Works from both the spot list and map spot flyout

---

### Feature QoL5: Smart Notifications with Quiet Hours

Quiet hours schedule, notification batching, priority escalation.

**Files Modified**: `src/stores/userStore.ts`, `src/lib/services/alertService.ts`, `src/stores/alertsStore.ts`

**Acceptance Criteria**:

- [ ] Quiet hours configurable: start/end time in local time
- [ ] During quiet hours: no audio alerts except CRITICAL priority (new DXCC entity)
- [ ] Notification batching: 15 simultaneous alerts → 1 summary notification
- [ ] Priority escalation: new DXCC entity always fires, even in quiet hours
- [ ] Visual notifications continue during quiet hours (just no sound)
- [ ] User can override quiet hours temporarily ("unmute for 30 minutes")

---

### Feature QoL7: Spot Source Quality Indicators

Source confidence badges on spots.

**Files Modified**: `SpotRow.tsx`, `SpotBadge.tsx`, `FilterControls.tsx`

**Acceptance Criteria**:

- [ ] RBN spots: "Machine" badge (high confidence)
- [ ] PSKReporter spots: "Auto" badge (high confidence)
- [ ] DX Cluster spots: "Human" badge (variable confidence)
- [ ] WSJT-X spots: "Heard" badge (highest confidence — you heard it yourself)
- [ ] Filter by confidence level available in FilterControls
- [ ] Tooltip explains what each source means

---

### Feature QoL8: Map Pin Clustering at Low Zoom

Zoom-dependent spot clustering on globe and flat map.

**Files Modified**: `useSpotClustering.ts`, `LiveSpotArcs.tsx`, `SpotCluster.tsx`

**Acceptance Criteria**:

- [ ] Zoom < 1.5: spots within 10° grouped into clusters
- [ ] Zoom 1.5-3.0: spots within 5° grouped
- [ ] Zoom > 3.0: no clustering (individual spots)
- [ ] Cluster badge shows count and colored by highest-priority spot
- [ ] Click cluster: zoom to cluster bounds and de-cluster
- [ ] Cluster color: new entity (red) > new band (orange) > worked (gray)
- [ ] Smooth transition when zoom crosses clustering threshold

---

### Feature QoL9: Solar Cycle Context on Dashboards

Solar cycle position, comparison, and trend.

**Files Created**: `src/components/solar/SolarCycleContext.tsx` (if not created in Phase 6)
**Files Modified**: `src/pages/SolarPulse.tsx`

**Acceptance Criteria**:

- [ ] Solar Cycle 25 curve rendered with actual historical SSN data
- [ ] Current position marked on the curve with "YOU ARE HERE" indicator
- [ ] SC24 and SC23 peaks labeled for comparison
- [ ] Trend indicator: "Rising toward peak" / "Near peak" / "Declining"
- [ ] Contextual note: "SFI 180 is 15% above SC24 peak value"
- [ ] Data source: NOAA smoothed sunspot number archive

---

### Feature QoL10: Propagation Forecast Confidence Intervals

Confidence percentage per forecast cell.

**Files Modified**: `src/lib/utils/bands.ts`, `PropagationForecastMini.tsx`, `PropagationForecast.tsx`, `BandPlanner.tsx`

**Acceptance Criteria**:

- [ ] Each forecast cell has a confidence value (0-100%)
- [ ] High confidence (>75%): solid cell color
- [ ] Medium confidence (40-75%): slightly faded / hatched pattern
- [ ] Low confidence (<40%): obviously uncertain visual (diagonal lines or transparency)
- [ ] Confidence drops near sunrise/sunset (±1 hour)
- [ ] Confidence drops during geomagnetic storms (Kp > 4)
- [ ] Confidence drops for longer paths (>8000 km)
- [ ] Tooltip shows: "Good (72% confidence)" on hover

---

### Feature QoL12: Import Log from N1MM / Log4OM

Enhanced ADIF import with logger-specific profiles.

**Files Created**: `src/lib/utils/adifProfiles.ts`
**Files Modified**: `src/components/logbook/` (import modal)

**Acceptance Criteria**:

- [ ] Auto-detect source logger from ADIF header (PROGRAMID field)
- [ ] N1MM+ profile: handles mode capitalization, custom fields, RST format quirks
- [ ] Log4OM profile: handles their non-standard field naming
- [ ] Generic profile: works for any ADIF-compliant file
- [ ] Import summary: "Imported 5,234 QSOs from N1MM+ (12 skipped due to errors)"
- [ ] Error details: show which QSOs were skipped and why
- [ ] Duplicate detection: option to skip QSOs already in logbook

---

### Feature QoL13: Mobile-Responsive Contest View

Tablet-optimized contest entry for Field Day.

**Files Created**: `src/components/contest/MobileContestEntry.tsx`
**Files Modified**: `src/pages/Contest.tsx`

**Acceptance Criteria**:

- [ ] Breakpoint at 768px: switches to mobile layout
- [ ] Large callsign input field (min 48px height, 20px font)
- [ ] Band/mode selector: large touch-friendly buttons (min 44x44px tap targets)
- [ ] Scoreboard: simplified single-row display
- [ ] Last 5 QSOs visible (not 20)
- [ ] Works well on 10" iPad in landscape orientation
- [ ] Keyboard doesn't obscure the input field on focus
- [ ] All functionality accessible without keyboard shortcuts

---

### Feature C18: Bearing/Distance Overlay

Bearing and distance readout for any point on the map.

**Files Modified**: `GlobeView.tsx`, `FlatMapView.tsx`, `PathAnalysis.tsx`

**Acceptance Criteria**:

- [ ] Mouse hover on map: displays bearing and distance from station QTH
- [ ] Info displays in a compact overlay (not a full panel)
- [ ] Short-path and long-path bearings shown
- [ ] Distance in km and miles (respects user unit preference)
- [ ] Click to pin the readout (for comparison)
- [ ] Works on all three map views (globe, flat, azimuthal)

---

### Feature C21: QSO Scheduling & DX Sked

Sked scheduler with propagation window recommendations.

**Files Created**: `src/components/dx/SkedScheduler.tsx`, `src/stores/skedStore.ts`

**Acceptance Criteria**:

- [ ] Create sked: target callsign, preferred band/mode, date range
- [ ] System recommends optimal windows based on propagation predictions for the path
- [ ] Sked reminder: alert 15 minutes before window opens
- [ ] Sked list: upcoming skeds sorted by time
- [ ] Sked history: past skeds with outcome (worked/missed)
- [ ] Max 20 active skeds
- [ ] Persists to IndexedDB

---

## Phase 8: Advanced Features

**Objective**: Premium features that differentiate the app.

---

### Feature C23: Band Scope / Waterfall Integration

Simplified activity waterfall from WSJT-X decode data.

**Files Created**: `src/components/dx/BandScope.tsx`

**Acceptance Criteria**:

- [ ] Visual frequency-domain display showing decode positions across the passband
- [ ] Each decode is a dot/bar at its audio frequency offset, colored by entity need status
- [ ] New entities highlighted with glow/pulse effect
- [ ] Scrolling time axis (newest at bottom)
- [ ] Click a decode → show callsign details, option to tune
- [ ] Works only when WSJT-X bridge is connected (otherwise shows placeholder message)
- [ ] Performance: handles 100+ decodes per transmission period without frame drops

---

### Feature QoL11: Customizable Dashboard Layout

Drag-to-rearrange, resize panels on PropSphere.

**Files Created**: `src/lib/utils/layoutManager.ts`, `src/components/layout/DraggablePanel.tsx`
**Files Modified**: `PropSphere.tsx`

**Acceptance Criteria**:

- [ ] Panels can be dragged to reorder within their column
- [ ] Panel widths can be drag-resized (extending existing 200-400px handles)
- [ ] Layout saves per user to localStorage
- [ ] "Reset to default" button restores original layout
- [ ] Layout presets: "DX Hunter", "Contest", "Propagation Researcher"
- [ ] Panels can be collapsed/hidden individually
- [ ] Drag handles visible on hover, not cluttering the UI by default
- [ ] Mobile: panels stack vertically, no drag (existing tab interface used)

---

### Feature C2 continued: Spot-Model Confidence Dashboard

Build on the correlation engine from Phase 3 to create a dedicated model accuracy dashboard.

**Files Created**: `src/components/solar/ModelAccuracyPanel.tsx`

**Acceptance Criteria**:

- [ ] Per-band model accuracy over last 24 hours (% of predictions confirmed by spots)
- [ ] Overall model confidence score (aggregate)
- [ ] "Model is performing well today" / "Model underestimating 10m propagation" indicators
- [ ] Historical accuracy trend (rolling 7-day average)

---

## Final Deliverable Review

**MANDATORY** after all phases:

1. `final-review-completeness` agent — full codebase scan for incomplete items, TODOs, placeholders
2. `principal-code-reviewer` agent — comprehensive quality assessment

---

## Testing Strategy

- **Unit tests**: All new utility files (`geomagnetic.ts`, `noiseModel.ts`, `rayTrace.ts`, `sporadicE.ts`, `propagationModes.ts`, `terrain.ts`, `doppler.ts`, `spotCorrelation.ts`, `observedMUF.ts`, `bandOpeningDetector.ts`, `offTimeTracker.ts`, `credentialStore.ts`)
- **Integration tests**: Store interactions (dxccStore rebuild, credential encrypt/decrypt), bridge message protocol
- **Manual testing**: Bridge + WSJT-X end-to-end, CAT control with hamlib, LoTW upload/download
- **Visual testing**: Map layers (Es overlay, observed MUF, terrain), antenna pattern plots, award progress bars

## Rollback Plan

Each phase is independently deployable:

- Phase 1 (data models): revert data files and utility modules
- Phase 2 (live data): disable bridge features, fall back to demo mode (already exists)
- Phase 3-8: each feature is additive and toggleable via layer/preference toggles

## Risks and Mitigations

| Risk                                   | Likelihood | Impact | Mitigation                                             |
| -------------------------------------- | ---------- | ------ | ------------------------------------------------------ |
| BigCTY/DXCC data accuracy              | Low        | High   | Cross-reference with Club Log's entity database        |
| WSJT-X protocol changes                | Low        | Medium | Protocol version check on message header               |
| LoTW API changes/downtime              | Medium     | Medium | Graceful degradation, retry queue                      |
| Bridge performance (200ms rig polling) | Low        | Medium | Configurable poll interval, skip frames if backlogged  |
| Large MASTER.SCP in IndexedDB          | Low        | Low    | Compress with LZ-string before storage                 |
| ITU-R P.372 noise model accuracy       | Low        | Medium | Allow user override/calibration for their specific QTH |
| Terrain point-in-polygon performance   | Medium     | Low    | Use simplified coastlines, cache results per grid cell |
| File conflicts between parallel agents | Medium     | High   | Clear file ownership matrix enforced per phase         |

---

**USER: Please review this plan. Edit any section directly, then confirm to proceed.**
