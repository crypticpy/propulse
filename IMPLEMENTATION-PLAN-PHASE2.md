# Implementation Plan: Phase 2 - PropSphere Core

Created: 2026-01-31
Status: IN PROGRESS

---

## Summary

Build the PropSphere interactive map component with a 3D globe view, day/night terminator, greyline visualization, and path analysis tools. This is the core propagation visualization feature that helps operators understand radio wave paths between locations.

## Scope

### In Scope

- 3D globe view using Three.js / react-three-fiber
- 2D flat map view using Canvas (simpler than Leaflet for Phase 2)
- Day/night terminator overlay (calculated from sun position)
- Greyline zone visualization (±15° from terminator)
- Click-to-set target location on map
- Path analysis panel (distance, bearing, hops, band conditions)
- Time offset controls (±24 hours from now)
- Integration with existing user QTH from settings

### Out of Scope (Phase 3+)

- MUF overlay layer
- Aurora oval visualization
- Azimuthal projection view
- Live spots overlay
- Saved targets
- Layer presets

## Prerequisites

- Phase 1 complete (done)
- Three.js dependencies installed
- User store with QTH already exists

---

## Implementation Phases

### Phase 2.1: Dependencies & Setup

**Objective**: Install 3D libraries and create PropSphere page structure.

**Tasks**:

1. Install Three.js ecosystem packages
2. Create PropSphere page at `/map`
3. Add route to App.tsx
4. Create basic page layout with view mode tabs

**Dependencies to Install**:

```bash
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

**Files to Create**:

- `src/pages/PropSphere.tsx` - Main map page
- `src/components/map/index.ts` - Barrel export

---

### Phase 2.2: 3D Globe Component

**Objective**: Build the interactive 3D Earth globe.

**Tasks**:

1. Create GlobeView component with Three.js
2. Add Earth sphere with texture
3. Implement camera controls (orbit, zoom)
4. Add ambient and directional lighting
5. Handle click events for location selection

**Files to Create**:

- `src/components/map/GlobeView.tsx` - 3D globe using R3F
- `src/components/map/EarthSphere.tsx` - Earth mesh with textures
- `src/components/map/GlobeControls.tsx` - Camera controls

**Textures Needed**:

- Earth day texture (can use NASA Blue Marble)
- Earth night texture (city lights)
- For Phase 2, use a simple color/procedural approach

---

### Phase 2.3: Terminator & Greyline

**Objective**: Add day/night terminator and greyline visualization.

**Tasks**:

1. Calculate sun position from date/time
2. Create terminator shader/overlay
3. Add greyline band (±15° golden glow)
4. Make it respond to time offset

**Files to Create**:

- `src/components/map/Terminator.tsx` - Day/night overlay
- `src/components/map/Greyline.tsx` - Greyline band
- `src/lib/utils/sun.ts` - Sun position calculations

---

### Phase 2.4: Flat Map View

**Objective**: Add 2D equirectangular map as alternative view.

**Tasks**:

1. Create FlatMapView component with Canvas
2. Draw world map outline
3. Add terminator overlay
4. Add greyline overlay
5. Handle click for target selection
6. Add pan and zoom

**Files to Create**:

- `src/components/map/FlatMapView.tsx` - 2D canvas map
- `src/components/map/MapCanvas.tsx` - Canvas rendering logic

---

### Phase 2.5: Path Analysis

**Objective**: Show path metrics when target is selected.

**Tasks**:

1. Create PathAnalysis panel component
2. Calculate great circle distance
3. Calculate bearing (short path and long path)
4. Estimate hop count
5. Show band conditions for path
6. Draw path arc on globe

**Files to Create**:

- `src/components/map/PathAnalysis.tsx` - Analysis panel
- `src/components/map/PathArc.tsx` - Visual path on globe
- `src/lib/utils/path.ts` - Path calculation utilities

---

### Phase 2.6: Time Controls

**Objective**: Add time offset slider for planning.

**Tasks**:

1. Create TimeControl component
2. Add slider for ±24 hours
3. Add preset buttons (sunrise, sunset, greyline)
4. Animate time changes smoothly
5. Show current display time

**Files to Create**:

- `src/components/map/TimeControl.tsx` - Time slider
- `src/stores/mapStore.ts` - Map state (view mode, time offset, target)

---

### Phase 2.7: Integration & Polish

**Objective**: Wire everything together and polish.

**Tasks**:

1. Connect QTH from userStore
2. Add home marker on globe
3. Add target marker
4. Responsive layout for mobile
5. Loading states
6. Error handling

---

## Technical Notes

### Sun Position Algorithm

Use simplified solar position calculation:

- Julian day from date
- Mean longitude and anomaly
- Ecliptic longitude
- Right ascension and declination
- Convert to lat/lon of subsolar point

### Great Circle Calculations

- Distance: Haversine formula
- Bearing: Forward azimuth
- Midpoint: Spherical interpolation
- Path points: Generate N points along arc

### Texture Strategy

For Phase 2, avoid large texture downloads:

- Use procedural Earth (continents as geometry)
- Or use low-res texture (~2K)
- Load higher res on demand in Phase 3

---

## File Ownership Matrix

| Agent/Phase    | Files                                                   |
| -------------- | ------------------------------------------------------- |
| 2.1 Setup      | `PropSphere.tsx`, `map/index.ts`                        |
| 2.2 Globe      | `GlobeView.tsx`, `EarthSphere.tsx`, `GlobeControls.tsx` |
| 2.3 Terminator | `Terminator.tsx`, `Greyline.tsx`, `sun.ts`              |
| 2.4 Flat Map   | `FlatMapView.tsx`, `MapCanvas.tsx`                      |
| 2.5 Path       | `PathAnalysis.tsx`, `PathArc.tsx`, `path.ts`            |
| 2.6 Time       | `TimeControl.tsx`, `mapStore.ts`                        |

---

## Success Criteria

- [ ] Globe renders at 60fps
- [ ] Terminator position is astronomically accurate
- [ ] Path distances match online calculators within 1%
- [ ] Bearings match within 1°
- [ ] Time slider updates visualization smoothly
- [ ] Works on mobile (touch gestures)
