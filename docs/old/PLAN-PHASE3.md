# Phase 3 Implementation Plan: PropSphere Advanced

**Generated:** 2026-01-31
**Based on:** Comprehensive PRD v2.0 + Codebase Audit

---

## Pre-Implementation Audit Summary

### Current State (from audit)

| Phase   | PRD Status               | Actual Status    | Notes                                                           |
| ------- | ------------------------ | ---------------- | --------------------------------------------------------------- |
| Phase 1 | Foundation & Solar Pulse | ✅ 100% Complete | All dashboard features working                                  |
| Phase 2 | PropSphere Core          | ✅ 95% Complete  | Globe, flat map, path analysis, terminator/greyline all working |
| Phase 3 | PropSphere Advanced      | 🔲 Not Started   | This plan                                                       |

### Existing Architecture (Preserve)

**Data Layer:**

- TanStack Query with 5-min stale time, 2 retries
- Zustand stores: `userStore`, `solarStore`, `mapStore`
- NOAA API via Vite dev proxy (4 endpoints working)

**Map System:**

- `GlobeView.tsx` - Three.js with @react-three/fiber
- `FlatMapView.tsx` - Canvas-based 2D projection
- `mapStore.ts` - View state management
- Layers: Terminator, Greyline, NightOverlay (all working)

**Component Patterns:**

- Modal expansion via `DetailModal` base component
- Card-based layout with glassmorphism
- Loading states with `LoadingSpinner`
- Barrel exports via `index.ts`

---

## PRD vs Implementation Reconciliation

### Phase 3 PRD Deliverables Analysis

| PRD Item                     | Implementation Approach                 | Priority | Complexity |
| ---------------------------- | --------------------------------------- | -------- | ---------- |
| MUF overlay layer (GIRO)     | New overlay + GIRO API integration      | High     | High       |
| Aurora oval visualization    | NOAA OVATION API + 3D/2D overlay        | Medium   | Medium     |
| Azimuthal projection view    | New projection mode in FlatMapView      | Medium   | High       |
| 24-hour propagation forecast | New component + time-based calculations | High     | Medium     |
| Band-by-band path conditions | Extend PathAnalysis component           | High     | Low        |
| Saved targets                | Persist to userStore + localStorage     | Medium   | Low        |
| Layer presets                | Add preset configurations to mapStore   | Low      | Low        |

### Implementation Decisions (Architectural)

1. **MUF Data Source**: GIRO/LGDC ionosonde network preferred, but has rate limits. Implement with fallback to estimated MUF from SFI.

2. **Aurora Data**: NOAA OVATION aurora forecast API provides 30-minute updates. Use GeoJSON-like polygon data for rendering.

3. **Azimuthal Projection**: Implement as third view mode, not replacing existing. Requires custom projection math centered on user QTH.

4. **Forecast Chart**: Create new `PropagationForecast.tsx` component. Use existing band calculation utilities enhanced with time dimension.

5. **Saved Targets**: Add to `userStore` with localStorage persistence. Max 10 saved targets.

---

## Implementation Plan

### Task 1: Band-by-Band Path Conditions (Extend PathAnalysis)

**Files to modify:**

- `src/components/map/PathAnalysis.tsx`
- `src/lib/utils/bands.ts`

**Changes:**

1. Add `getBandConditionsForPath(home, target, kp, sfi)` utility
2. Extend PathAnalysis to show per-band signal estimate
3. Add visual band status indicators (color-coded)

**Data Flow:**

```
Path coords → getBandConditionsForPath() → Band SNR estimates → Display table
```

**Estimated effort:** Low

---

### Task 2: Saved Targets

**Files to modify:**

- `src/stores/userStore.ts` (or new `src/stores/targetsStore.ts`)
- `src/components/map/PathAnalysis.tsx`
- `src/pages/PropSphere.tsx`

**Changes:**

1. Add `savedTargets[]` array to store (max 10)
2. Add save/delete actions
3. Add "Save Target" button to PathAnalysis
4. Add Quick Targets panel to PropSphere page

**Schema:**

```typescript
interface SavedTarget {
  id: string;
  name: string;
  lat: number;
  lon: number;
  grid?: string;
  createdAt: string;
}
```

**Estimated effort:** Low

---

### Task 3: 24-Hour Propagation Forecast Chart

**Files to create:**

- `src/components/map/PropagationForecast.tsx`
- `src/components/map/modals/PropagationForecastModal.tsx`

**Files to modify:**

- `src/lib/utils/bands.ts` (add time-based prediction)
- `src/pages/PropSphere.tsx` (add component)
- `src/components/map/index.ts` (export)

**Changes:**

1. Create hourly band opening predictions (24 hours)
2. Use SVG heatmap visualization (bands × hours)
3. Account for path illumination at each hour
4. Add modal for expanded view

**Algorithm:**

```
For each hour (0-23):
  Calculate sun position at hour
  Calculate path illumination at hour
  For each band:
    Estimate MUF at path midpoint
    Determine band openness (excellent/good/fair/poor/closed)
```

**Estimated effort:** Medium

---

### Task 4: Layer Presets

**Files to modify:**

- `src/stores/mapStore.ts`
- `src/pages/PropSphere.tsx` (add preset buttons)

**Changes:**

1. Define preset configurations:
   - **DX Hunter**: Terminator ON, Greyline ON, MUF ON (when available)
   - **Contest**: Terminator ON, Greyline OFF, Live Spots ON (when available)
   - **VHF**: Sporadic E ON (future), Aurora ON (future), Terminator ON
   - **Emergency**: Terminator ON, D-Layer ON (future)

2. Add preset selector UI (simple button group)
3. Store active preset name

**Estimated effort:** Low

---

### Task 5: Aurora Oval Visualization

**Files to create:**

- `src/components/map/AuroraOverlay.tsx`
- `src/hooks/useAuroraData.ts`
- `src/lib/api/aurora.ts`

**Files to modify:**

- `src/stores/mapStore.ts` (add aurora layer toggle)
- `src/components/map/GlobeView.tsx` (render aurora)
- `src/components/map/FlatMapView.tsx` (render aurora)
- `src/pages/PropSphere.tsx` (layer control)
- `vite.config.ts` (add NOAA aurora proxy)

**Data Source:**

```
https://services.swpc.noaa.gov/json/ovation_aurora_latest.json
```

**Changes:**

1. Create aurora data hook with 30-min refresh
2. Parse NOAA OVATION polygon data
3. Render purple/green gradient overlay on both views
4. Add layer toggle in map controls

**Visualization:**

- North auroral oval (primary)
- South auroral oval (secondary)
- Color: Purple-to-green gradient based on intensity
- Opacity: 40-60% for visibility

**Estimated effort:** Medium

---

### Task 6: MUF Overlay Layer (GIRO Integration)

**Files to create:**

- `src/components/map/MUFOverlay.tsx`
- `src/hooks/useMUFData.ts`
- `src/lib/api/giro.ts`

**Files to modify:**

- `src/stores/mapStore.ts` (add MUF layer toggle)
- `src/components/map/GlobeView.tsx` (render MUF)
- `src/components/map/FlatMapView.tsx` (render MUF)
- `src/pages/PropSphere.tsx` (layer control)
- `vite.config.ts` (add GIRO proxy)

**Data Source:**
GIRO/LGDC ionosonde network (rate limited - 100/hr)

```
https://giro.uml.edu/didbase/scaled.php (requires parameters)
```

**Fallback:**
Estimated MUF from SFI using formula:

```
MUF ≈ f₀F₂ × 3.6 × cos(zenith)^0.5
where f₀F₂ ≈ 0.15 × sqrt(SFI - 60) + 4 (simplified)
```

**Changes:**

1. Create MUF data hook with 15-min refresh
2. Implement fallback estimation when GIRO unavailable
3. Render color-coded contour overlay
4. Add layer toggle and legend

**Visualization:**

- Contour bands: <7 MHz (red), 7-14 MHz (yellow), 14-21 MHz (green), >21 MHz (blue)
- Semi-transparent overlay
- Legend showing frequency ranges

**Estimated effort:** High

---

### Task 7: Azimuthal Equidistant Projection View

**Files to create:**

- `src/components/map/AzimuthalView.tsx`
- `src/lib/utils/azimuthal.ts`

**Files to modify:**

- `src/stores/mapStore.ts` (add "azimuthal" to viewMode type)
- `src/components/map/ViewModeToggle.tsx` (add third option)
- `src/pages/PropSphere.tsx` (render new view)
- `src/components/map/index.ts` (export)

**Changes:**

1. Implement azimuthal equidistant projection centered on user QTH
2. Add distance rings (5,000 km intervals)
3. Add bearing labels (N/E/S/W + 10° increments)
4. Great circle paths appear as straight lines (key feature)
5. Render terminator, greyline, markers on new projection

**Projection Math:**

```typescript
function azimuthalProject(
  lat: number,
  lon: number,
  centerLat: number,
  centerLon: number,
): { x: number; y: number } {
  // Spherical to azimuthal equidistant projection
  const φ1 = (centerLat * Math.PI) / 180;
  const λ0 = (centerLon * Math.PI) / 180;
  const φ = (lat * Math.PI) / 180;
  const λ = (lon * Math.PI) / 180;

  const c = Math.acos(
    Math.sin(φ1) * Math.sin(φ) + Math.cos(φ1) * Math.cos(φ) * Math.cos(λ - λ0),
  );
  const k = c / Math.sin(c);

  const x = k * Math.cos(φ) * Math.sin(λ - λ0);
  const y =
    k *
    (Math.cos(φ1) * Math.sin(φ) -
      Math.sin(φ1) * Math.cos(φ) * Math.cos(λ - λ0));

  return { x, y };
}
```

**Estimated effort:** High

---

## Implementation Order

Based on dependencies and user value:

### Wave 1 (Quick Wins) - Can parallelize

1. **Task 2: Saved Targets** - Standalone, low complexity
2. **Task 4: Layer Presets** - Standalone, low complexity
3. **Task 1: Band Path Conditions** - Extends existing, high value

### Wave 2 (Core Features)

4. **Task 3: 24-Hour Propagation Forecast** - New component, high value
5. **Task 5: Aurora Overlay** - New data source, visual enhancement

### Wave 3 (Advanced)

6. **Task 7: Azimuthal Projection** - New view mode, complex math
7. **Task 6: MUF Overlay** - External API dependency, rate limits

---

## Files Summary

### New Files to Create

```
src/components/map/PropagationForecast.tsx
src/components/map/modals/PropagationForecastModal.tsx
src/components/map/AuroraOverlay.tsx
src/components/map/MUFOverlay.tsx
src/components/map/AzimuthalView.tsx
src/hooks/useAuroraData.ts
src/hooks/useMUFData.ts
src/lib/api/aurora.ts
src/lib/api/giro.ts
src/lib/utils/azimuthal.ts
```

### Files to Modify

```
src/stores/userStore.ts (saved targets)
src/stores/mapStore.ts (layers, presets, view modes)
src/components/map/PathAnalysis.tsx (band conditions)
src/components/map/ViewModeToggle.tsx (third option)
src/components/map/GlobeView.tsx (aurora, MUF layers)
src/components/map/FlatMapView.tsx (aurora, MUF layers)
src/components/map/index.ts (new exports)
src/pages/PropSphere.tsx (new components, controls)
src/lib/utils/bands.ts (path-specific calculations)
vite.config.ts (new API proxies)
```

---

## Success Criteria (from PRD)

- [x] MUF data updates every 15 minutes ✅ Updates with SFI and time offset
- [x] Aurora matches NOAA OVATION visually ✅ Purple-green gradient, probability-based
- [x] Users can plan future operating times (24-hour forecast) ✅ SVG heatmap + modal
- [x] Azimuthal projection shows great circles as straight lines ✅ Third view mode
- [x] Saved targets persist across sessions ✅ localStorage via Zustand

## Implementation Status: ✅ COMPLETE (January 31, 2026)

---

## Risk Assessment

| Risk                      | Mitigation                                         |
| ------------------------- | -------------------------------------------------- |
| GIRO rate limits (100/hr) | Implement aggressive caching + SFI-based fallback  |
| NOAA API changes          | Monitor endpoints, implement error fallbacks       |
| Azimuthal math complexity | Use well-tested projection library if needed       |
| Performance with overlays | Implement layer culling, reduce polygon resolution |
| Mobile performance        | Test early, optimize canvas/WebGL rendering        |

---

## PRD Updates Needed

After implementation, update PRD to reflect:

1. **Phase 1 & 2**: Mark as COMPLETE with implementation notes
2. **API Integration**: Document actual endpoints used
3. **Architecture Decisions**: Record MUF fallback approach
4. **Component Library**: Add new components to appendix
5. **Performance Metrics**: Document actual load times

---

**Ready for implementation approval.**
