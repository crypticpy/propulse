# Prop Spheres 3D Globe — New Layer Plan

## Overview

10 new visualization layers for the 3D globe, expanding from 22 to 32 layers.

## Current State

- 22 layers across 7 categories (Basemap, Illumination, Activity, QSO Log, Hazards, Propagation, Reference)
- LayersPopover with cascading two-tier menu
- 4 built-in presets (DX Hunter, Contest, VHF, Emergency)
- Partially implemented: NVIS, WSPR, Observed MUF, Sporadic E (state exists, no rendering)

## Layer 1: Sporadic E Cloud Map

**Category**: Propagation
**Data Source**: DPS4D ionosonde network foEs data, or modeled from solar/geomagnetic activity
**Rendering**: Translucent blobs on ionosphere E-layer shell (~110 km altitude)
**Implementation**:

- New edge function: `api/propagation/sporadic-e.ts`
- Source: GIRO DIDBase ionosonde data (`https://giro.uml.edu/`) or simplified model
- Simplified model fallback: Es probability by latitude, season, time of day
- New hook: `useSporadicE()`
- New component: `SporadicEOverlay.tsx` — translucent green patches on E-layer sphere
- Wire existing `layers.sporadicE` state (if it exists) or add new
- Intensity mapped to foEs value (higher = more opaque)
- Pulse animation when Es detected near operator QTH

## Layer 2: NVIS Coverage Dome

**Category**: Propagation
**Data Source**: Calculated from operator location + current foF2 + antenna takeoff angle
**Rendering**: Semi-transparent dome/circle on globe surface centered on QTH
**Implementation**:

- `layers.nvis` already exists in mapStore (not rendered)
- New component: `NVISOverlay.tsx`
- Calculate NVIS range: ~300 km radius (based on foF2 and critical frequency)
- Inputs: foF2 from MUF calculation, antenna takeoff angle (default 80°)
- Render: translucent cyan dome, edge fades to transparent
- Show usable NVIS bands (40m, 60m, 80m depending on foF2)
- Band labels at dome edge

## Layer 3: Geomagnetic Field Lines

**Category**: Propagation
**Data Source**: Dipole model calculated from Earth's magnetic poles + Kp disturbance
**Rendering**: Animated 3D curves from magnetic poles, colored by Kp level
**Implementation**:

- New component: `GeomagneticFieldLines.tsx`
- Calculate dipole field lines from magnetic north/south poles
- 8-12 field lines per hemisphere at different latitudes
- Color: green (Kp 0-3), yellow (Kp 4-5), orange (Kp 6-7), red (Kp 8-9)
- Animation: particles flowing along field lines (direction indicates disturbance)
- Compress field lines on dayside, extend on nightside (solar wind effect)
- Add to `layers` in mapStore: `geomagField: boolean`
- Add to LayersPopover Propagation category

## Layer 4: Solar Terminator Enhancement

**Category**: Illumination
**Data Source**: Enhanced greyline model with empirical propagation corridors
**Rendering**: Animated signal enhancement zone along terminator
**Implementation**:

- Extend existing `Greyline.tsx` or new `TerminatorEnhancement.tsx`
- Show propagation corridors: arcs along terminator where long-path signals travel
- Animate: flowing particles along terminator direction
- Width varies with band: wider for 160m/80m, narrower for 40m
- Active only when `layers.greyline` is on
- Intensity modulated by actual greyline spot activity (if available)

## Layer 5: Live WSPR Heatmap

**Category**: Activity
**Data Source**: WSPRnet API (`https://www.wsprnet.org/olddb?mode=html&band=all&limit=100`)
**Rendering**: Glowing arcs with thickness proportional to SNR
**Implementation**:

- `layers.wspr` already exists in mapStore (not rendered)
- New edge function: `api/propagation/wspr.ts` (5-min cache)
- New hook: `useWSPRSpots()`
- New component: `WSPROverlay.tsx`
- Arcs from TX to RX, colored by band (same as spot arcs)
- Thickness/brightness = SNR (thicker = stronger signal)
- Aggregate mode: heatmap of confirmed propagation density
- Filter by band in LayersPopover inline control

## Layer 6: Tropospheric Ducting Overlay

**Category**: Propagation
**Data Source**: GFS model surface refractivity or simplified temperature inversion model
**Rendering**: Colored patches at ground level showing ducting regions
**Implementation**:

- New edge function: `api/propagation/ducting.ts` (1-hour cache)
- Source: Simplified model from surface temperature + humidity profiles
- Alternative: Use existing weather data to estimate refractivity gradient
- New hook: `useDuctingForecast()`
- New component: `DuctingOverlay.tsx`
- Render: translucent patches colored by ducting probability
  - Green = slight enhancement, Yellow = moderate ducting, Red = strong duct
- Add to `layers`: `ducting: boolean`
- Relevant for VHF/UHF operators

## Layer 7: HF Noise Floor Map

**Category**: Propagation
**Data Source**: ITU-R P.372 model (calculated from location, time, season, frequency)
**Rendering**: Global heatmap of estimated noise levels
**Implementation**:

- Pure calculation, no external API needed
- New utility: `src/lib/utils/noiseFloor.ts`
- ITU-R P.372 noise model: atmospheric + man-made + galactic noise
- Inputs: latitude, longitude, frequency, time of day, season, urbanization
- New component: `NoiseFloorOverlay.tsx`
- Heatmap: blue (quiet) → green → yellow → red (noisy)
- Shows why tropics are noisier than polar regions
- Band selector to show noise at different frequencies
- Add to `layers`: `noiseFloor: boolean`

## Layer 8: Meteor Shower Radiant

**Category**: Activity
**Data Source**: Hardcoded meteor shower calendar (IMO working list, ~20 major showers)
**Rendering**: Radiant point marker + scatter zone circle on globe
**Implementation**:

- New data file: `src/lib/data/meteorShowers.ts`
- ~20 major showers with: name, peak date range, radiant RA/Dec, ZHR, velocity
- New utility: convert RA/Dec to lat/lon based on current sidereal time
- New component: `MeteorShowerOverlay.tsx`
- Show: radiant point as starburst icon, scatter zone as ~2000 km circle
- Active only during shower date ranges
- Tooltip: "Perseids peak tonight — ZHR 100, best for 6m scatter"
- Add to `layers`: `meteorShowers: boolean`
- Add to Activity category in LayersPopover

## Layer 9: Beacon Network Overlay

**Category**: Activity
**Data Source**: NCDXF/IARU International Beacon Project (18 beacons, 5 bands)
**Rendering**: Station markers with real-time transmission schedule
**Implementation**:

- New data file: `src/lib/data/beaconNetwork.ts`
- 18 beacon stations with lat/lon, callsign, power, antenna
- 5 bands: 14.100, 18.110, 21.150, 24.930, 28.200 MHz
- Each beacon transmits for 10 seconds on each band, 3-minute rotation cycle
- New component: `BeaconNetworkOverlay.tsx`
- Show: station markers with callsign labels
- Active beacon highlighted (pulsing) based on current UTC second
- "Currently transmitting" indicator follows the rotation schedule
- Add to `layers`: `beacons: boolean`
- Add to Activity category

## Layer 10: Electromagnetic Spectrum Waterfall Ring

**Category**: Activity (special)
**Data Source**: Aggregated live spot density per band
**Rendering**: Cylindrical waterfall display orbiting the globe at equator
**Implementation**:

- New component: `SpectrumWaterfallRing.tsx`
- Ring at equator, slightly above globe surface
- Segments for each band (160m through 6m, ~12 segments)
- Color intensity = spot density (darker = more active)
- Scrolls over time (waterfall effect): new row every 30 seconds
- 10-minute history visible
- Bands labeled with frequency
- Add to `layers`: `spectrumRing: boolean`
- Add to Activity category
- Performance: use InstancedMesh for efficiency

## Implementation Phases

### Phase G1: Wire Existing State + Simple Layers

- NVIS Overlay (state exists, needs component)
- Beacon Network (hardcoded data, no API)
- Meteor Shower (hardcoded calendar, no API)
- Noise Floor Map (pure calculation)

### Phase G2: API-Backed Layers

- WSPR Heatmap (needs API + component)
- Sporadic E Map (needs API or model + component)
- DRAP Overlay (cross-reference with Solar Feature 6)
- Tropospheric Ducting (needs model + component)

### Phase G3: Complex Visualizations

- Geomagnetic Field Lines (3D curves + animation)
- Solar Terminator Enhancement (animated corridors)
- Spectrum Waterfall Ring (3D ring + scrolling texture)
- Satellite Footprint (cross-reference with Satellite Feature 10)

### Phase G4: LayersPopover + Preset Updates

- Add all new layers to LayersPopover categories
- Update presets: add beacons to DX Hunter, ducting to VHF, NVIS to Emergency
- Add new preset: "Science" (geomagnetic, ionosphere, noise floor, DRAP)

## New Layer Summary

| Layer                  | Category     | Data Source | Complexity |
| ---------------------- | ------------ | ----------- | ---------- |
| Sporadic E             | Propagation  | API/Model   | Medium     |
| NVIS Dome              | Propagation  | Calculated  | Low        |
| Geomagnetic Lines      | Propagation  | Calculated  | High       |
| Terminator Enhancement | Illumination | Calculated  | Medium     |
| WSPR Heatmap           | Activity     | WSPRnet API | Medium     |
| Tropospheric Ducting   | Propagation  | Model/GFS   | Medium     |
| Noise Floor Map        | Propagation  | ITU-R P.372 | Medium     |
| Meteor Shower          | Activity     | Hardcoded   | Low        |
| Beacon Network         | Activity     | Hardcoded   | Low        |
| Spectrum Waterfall     | Activity     | Live spots  | High       |
