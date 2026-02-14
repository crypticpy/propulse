# Satellite Tracking Improvement Plan

## Overview

10 improvements to satellite tracking accuracy, features, and integration.

## Current State

- Custom simplified Kepler propagator (~10 km accuracy, no J2/drag)
- TLE from Celestrak amateur group, 6-hour refresh
- 10 hardcoded transponders in `satelliteTransponders.ts`
- ISS dedicated tracker with sky chart, orbit ring, footprint
- Pass predictions via 1-minute brute-force stepping
- Doppler correction computed but not auto-tracked
- No logbook integration for satellite QSOs

## Feature 1: Replace Kepler Propagator with SGP4

**Library**: `satellite.js` (npm package, ~50KB, well-maintained)
**What**: Full SGP4/SDP4 propagation with J2-J4 perturbations, atmospheric drag, lunar/solar gravity.
**Implementation**:

- `npm install satellite.js`
- Rewrite `calculatePosition()` in `satellites.ts` to use `satellite.propagate(satrec, date)`
- Replace `parseOrbitalElements()` + `solveKepler()` with `satellite.twoline2satrec()`
- Replace `gmst()` with `satellite.gstime()`
- Replace ECEF conversion with `satellite.eciToGeodetic()`
- Keep `computeElevation()`/`computeAzimuth()` as they are (geometry, not propagation)
- Accuracy: ~10 km → <1 km for LEO
- Performance: comparable or better (optimized C-port)

## Feature 2: Auto-Fetch Transponder DB from SatNOGS

**Source**: `https://db.satnogs.org/api/transmitters/?format=json&status=active`
**What**: 400+ amateur transponders with uplink/downlink/mode/status.
**Implementation**:

- New edge function: `api/satellites/transponders.ts` (24-hour cache)
- New hook: `useSatelliteTransponders()` with TanStack Query
- Map SatNOGS format to our `SatelliteTransponder` type
- Keep hardcoded `TRANSPONDER_DB` as fallback
- Show "active"/"inactive" badge per transponder
- Weekly auto-refresh

## Feature 3: Satellite QSO Logging Workflow

**What**: "Log This Pass" button during active passes, auto-fills ADIF fields.
**Implementation**:

- New component: `SatelliteLogButton.tsx` in SatellitePanel
- When clicked, opens QSO logger pre-filled with:
  - `SAT_NAME`: satellite name
  - `SAT_MODE`: transponder mode (FM/SSB/CW)
  - `PROP_MODE`: "SAT"
  - `QSO_DATE` + `TIME_ON`: pass start time
  - `BAND`: derived from transponder downlink frequency
  - `FREQ`: Doppler-corrected downlink
- Integration point: `qsoStore.prefillFromSatellite()`
- Navigate to `/log` with pre-filled form

## Feature 4: Pass Quality Ranking

**What**: Score each pass 1-5 stars based on multiple factors.
**Implementation**:

- New utility: `src/lib/utils/passQuality.ts`
- Scoring factors:
  - Max elevation: >60° = 5, >45° = 4, >30° = 3, >15° = 2, else 1
  - Duration: >10 min = bonus, <3 min = penalty
  - Sun illumination: sunlit = bonus for visual
  - Time of day: avoid sleep hours
- `computePassQuality(pass: PassPrediction): { score: 1-5, factors: string[] }`
- Display star rating in SatellitePanel pass list
- Sort passes by quality score option

## Feature 5: Auto-Doppler Tuning Loop

**What**: Continuous CAT frequency updates during satellite pass.
**Implementation**:

- New service: `src/lib/services/dopplerTracker.ts`
- When activated (bridge connected + satellite above horizon):
  - Every 2 seconds: compute corrected downlink frequency
  - Send `rigStore.setPendingFrequency(correctedHz)` via bridge
  - Show "Auto-tracking" indicator in SatellitePanel
- Start/stop button in SatellitePanel detail view
- Auto-stop when satellite goes below horizon (LOS)
- Safety: frequency change limit of ±50 kHz per update

## Feature 6: Custom TLE Import

**What**: Let users paste TLE sets for experimental/new satellites.
**Implementation**:

- New component: `CustomTLEDialog.tsx` — textarea for pasting TLE
- Store in IndexedDB via new `customTLEStore.ts`
- Merge custom TLEs with Celestrak data in `useSatellites()`
- TLE age badge: green (<3 days), yellow (3-7 days), red (>7 days)
- Validation: check TLE checksum, epoch not too old
- "Import from file" button for `.tle` files

## Feature 7: Multi-Location Pass Scheduling (SatMatch)

**What**: Find passes with simultaneous visibility from two locations.
**Implementation**:

- New utility: `src/lib/utils/satMatch.ts`
- `findSharedPasses(tle, loc1, loc2, hours)` → shared visibility windows
- UI: "SatMatch" tab in SatellitePanel
  - Input: target station grid/lat-lon
  - Output: list of shared passes with overlap duration, mutual max elevation
- Highlight shared window in pass timeline
- Export to clipboard: "IO-117 shared pass: 14:32-14:41 UTC, you 35° me 52°"

## Feature 8: Squint Angle + Link Budget

**What**: Estimate signal strength based on satellite antenna pattern and path loss.
**Implementation**:

- New utility: `src/lib/utils/linkBudget.ts`
- Squint angle: angle between satellite antenna boresight (nadir for most) and observer
- Free-space path loss: `FSPL = 20*log10(d) + 20*log10(f) + 20*log10(4π/c)`
- Estimated link margin: satellite EIRP - FSPL + observer antenna gain - noise
- Display: signal strength indicator (bars or dB readout) in SatellitePanel
- Color coding: green (good margin), yellow (marginal), red (unlikely)

## Feature 9: Push Notifications for Satellite Passes

**What**: Browser notifications before tracked satellite passes.
**Implementation**:

- Extend `useWatchAlerts` pattern for satellite passes
- New setting in settingsStore: `satelliteAlerts: { enabled, minutesBefore: 5 }`
- New component: `SatelliteAlertToasts.tsx` (like NetAlertToasts)
- "IO-117 rising in 5 min, max el 62°, FM 145.880 MHz"
- Option to "track" specific satellites (star icon in satellite list)
- Tracked satellites stored in mapStore or settingsStore

## Feature 10: Satellite Footprint + Coverage Map

**What**: Real-time radio footprint circle for visible satellites.
**Implementation**:

- New component: `SatelliteFootprint3D.tsx` — translucent circle on globe
- Radius = `arccos(R_earth / (R_earth + altitude)) * R_earth`
- Color by satellite category (same as markers)
- Show for selected satellite or all visible satellites
- Toggle in SatelliteFilters: "Show Footprints"
- Animate as satellite moves

## Implementation Phases

### Phase T1: SGP4 + Core Infrastructure

- Install satellite.js, rewrite propagator (Feature 1)
- SatNOGS transponder fetch (Feature 2)
- Custom TLE import store + dialog (Feature 6)
- TLE age badges

### Phase T2: Pass Enhancement

- Pass quality scoring (Feature 4)
- Multi-location scheduling / SatMatch (Feature 7)
- Squint angle + link budget (Feature 8)

### Phase T3: Integration Features

- Satellite QSO logging (Feature 3)
- Auto-Doppler tuning loop (Feature 5)
- Push notifications (Feature 9)
- Satellite footprint overlay (Feature 10)
