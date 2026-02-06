# PropSphere 2D Map Feature Parity PRD

**Document Version:** 1.0
**Date:** 2026-02-03
**Status:** Planning Phase
**Author:** Engineering Team

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Assessment](#current-state-assessment)
3. [Gap Analysis](#gap-analysis)
4. [Feature Mapping Matrix](#feature-mapping-matrix)
5. [New Feature Requirements](#new-feature-requirements)
6. [Viewport/Rendering Issues](#viewportrendering-issues)
7. [Day/Night Visualization Requirements](#daynight-visualization-requirements)
8. [Prioritized Work Breakdown Structure](#prioritized-work-breakdown-structure)
9. [Open Questions](#open-questions)

---

## 1. Executive Summary

### Objective

Bring the PropSphere 2D Flat Map view to feature parity with the 3D Globe view while adding competitive features expected by amateur radio operators, particularly day/night visualization with city lights and region view presets.

### Background

PropSphere currently offers three map projection modes:

- **3D Globe** (GlobeView) - Full-featured with rich interactions
- **2D Flat Map** (FlatMapView) - Basic rendering, limited interactivity
- **Azimuthal** (AzimuthalView) - Specialized centered projection

The 3D Globe has evolved significantly with gesture detection, hover tooltips, context menus, pin management, and watch lists. The 2D Flat Map shares the same rendering layers (terminator, greyline, aurora, MUF, spots) but lacks interactive features, creating an inconsistent user experience when switching views.

### Competitive Context

Analysis of competing amateur radio mapping software reveals standard expectations:

| Competitor            | Key Differentiators                                      |
| --------------------- | -------------------------------------------------------- |
| **HamClock**    | Widget system, web API, real-time cluster display        |
| **DX Atlas**    | Multiple projections, smooth zoom, prefix database       |
| **Geochron 4K** | Premium visuals, 15-second updates, grid-level precision |
| **MacLoggerDX** | 3D globe, spot precision indicators, click-to-tune       |
| **GridTracker** | Award overlays, 30+ base maps, offline mode              |

Users expect: grayline visualization, DX spots on map, band/mode filtering, hover information, click-to-action interactions, and region quick-navigation.

### Success Criteria

1. All interactive features from GlobeView available in FlatMapView
2. Day/night visualization with city lights matching globe quality
3. Region view presets for one-click navigation to propagation paths
4. No viewport/sizing issues (full responsive display)
5. Consistent UX patterns across all map modes

---

## 2. Current State Assessment

### 2.1 3D Globe Features Inventory

#### Core Components

| Component                 | Purpose                                     | Complexity |
| ------------------------- | ------------------------------------------- | ---------- |
| `GlobeView.tsx`         | Main container with error boundary, portals | High       |
| `EarthSphere.tsx`       | NASA Blue Marble textured sphere            | Medium     |
| `GlobeClickHandler.tsx` | Gesture state machine (click/hold/drag)     | High       |
| `CameraController`      | OrbitControls + fly-to animations           | Medium     |

#### Visual Overlays (All Implemented)

| Overlay       | Implementation                | Notes                       |
| ------------- | ----------------------------- | --------------------------- |
| Terminator    | Dashed line, plasma orange    | 180-point curve             |
| Night Overlay | Custom GLSL shader            | Smooth twilight transition  |
| Night Lights  | NASA Black Marble texture     | Warm city glow effect       |
| Greyline      | Mesh with intensity levels    | Pulsing at peak             |
| Aurora        | Point cloud from NOAA OVATION | Probability-based rendering |
| MUF           | Shader-based heat map         | SFI-driven calculation      |
| Labels        | HTML overlays via drei        | 20 major cities + borders   |

#### Spot Visualization System

| Component                   | Purpose                             |
| --------------------------- | ----------------------------------- |
| `LiveSpotArcs.tsx`        | Great circle paths with mode colors |
| `SpotMarker.tsx`          | Clickable endpoint markers          |
| `SpotCluster.tsx`         | Aggregated spot display             |
| `SpotLabel.tsx`           | Callsign labels at DX locations     |
| `SpotHighlight.tsx`       | Pulsing rings for focused spot      |
| `SpotEndpointHitArea.tsx` | Invisible hover detection mesh      |
| `SpotDetailsFlyout.tsx`   | Rich spot info on hover             |

#### Interaction System

| Feature               | Implementation                 |
| --------------------- | ------------------------------ |
| Press-and-hold (2.5s) | Opens flyout menu              |
| Quick click           | No action (prevents accidents) |
| Double-click          | Centers view on location       |
| Drag                  | Orbit rotation                 |
| Hover                 | Shows tooltip with grid info   |
| Escape key            | Closes flyout/panels           |

#### Panel System

| Panel                 | Purpose                                       |
| --------------------- | --------------------------------------------- |
| `GlobeTooltip`      | Grid info + spot activity on hover            |
| `GlobeFlyout`       | Actions: Set Target, Add Pin, Research, Watch |
| `AddPinDialog`      | Pin creation modal                            |
| `GridResearchPanel` | Slide-out research panel                      |
| `WatchListPanel`    | Slide-out watch list                          |
| `WatchIndicator`    | Activity notification icon                    |

#### State Management (mapStore.ts)

```
View Settings: viewMode, zoom, rotation, autoRotate
Time Control: timeOffset, absoluteTime, timeScenarios
Target: target, recentTargets, centerLocation
Layers: terminator, greyline, aurora, muf, nvis, spots, nightLights, labels
UI State: isFullscreen, isLiteMode, tooltipPosition, flyoutPosition
```

### 2.2 2D Flat Map Current State

#### What Exists

| Feature             | Status | Quality                     |
| ------------------- | ------ | --------------------------- |
| Base map rendering  | Yes    | Fixed 1024x512 canvas       |
| Day/night overlay   | Yes    | Pixel-by-pixel calculation  |
| Terminator line     | Yes    | Orange glow at boundary     |
| Greyline band       | Yes    | Golden tint ±15 degrees    |
| Aurora overlay      | Yes    | Same as globe               |
| MUF overlay         | Yes    | 10-degree resolution cells  |
| Night lights        | Yes    | 30 major cities only        |
| Labels              | Yes    | City names + basic borders  |
| Live spot arcs      | Yes    | Up to 50 spots, mode colors |
| Home/target markers | Yes    | With difficulty coding      |
| Path arc            | Yes    | Date-line wrap handling     |
| Scroll wheel zoom   | Yes    | 0.5x to 4x scale            |
| Click to select     | Yes    | Basic target selection      |

#### What's Missing (vs Globe)

| Feature                  | Priority           | Impact                       |
| ------------------------ | ------------------ | ---------------------------- |
| Hover tooltip system     | **Critical** | Core UX inconsistency        |
| Click flyout menu        | **Critical** | No pin/watch/research access |
| Pin markers display      | High               | Data not visible on map      |
| Watch activity indicator | High               | Watch system unusable        |
| Double-click to center   | Medium             | Navigation convenience       |
| Compass rose             | Medium             | Orientation guidance         |
| Spot highlight effect    | Medium             | Focus feedback               |
| Panel integration        | High               | Modal dialogs missing        |
| Responsive sizing        | **Critical** | Viewport issues              |
| Smooth zoom transitions  | Low                | Polish                       |
| Spot clustering          | Low                | Performance at scale         |
| Spot labels              | Medium             | Callsign visibility          |
| Spot hover detection     | High               | Spot info access             |

---

## 3. Gap Analysis

### 3.1 Critical Gaps (Must Fix)

#### G1: No Interactive Overlay System

**Current:** FlatMapView is render-only; no hover or click feedback beyond target selection.

**Required:**

- Mouse position tracking with lat/lon conversion
- Tooltip rendering at cursor position
- Flyout menu rendering at click position
- Hit detection for spot endpoints

**Impact:** Users cannot access Pin, Watch, or Research features in 2D mode.

#### G2: Viewport/Sizing Issues

**Current:** Fixed 1024x512 canvas resolution with CSS scaling.

**Symptoms:**

- Black edges visible when aspect ratio doesn't match container
- No dynamic resolution adjustment
- Zoom calculations assume fixed dimensions

**Required:**

- ResizeObserver for container dimensions
- Dynamic canvas resolution
- Proper aspect ratio handling

#### G3: Missing Panel State Management

**Current:** No state tracking for AddPinDialog, GridResearchPanel, or WatchListPanel.

**Required:**

- Portal-rendered dialogs outside canvas
- Panel open/close state
- Escape key and click-outside dismissal

### 3.2 High Priority Gaps

#### G4: Pin Markers Not Rendered

**Current:** `usePinStore` pins exist but aren't drawn on flat map.

**Required:** `drawPin()` function with same visual style as markers.

#### G5: Watch System Not Integrated

**Current:** No `WatchIndicator` or `WatchListPanel` in FlatMapView.

**Required:** DOM overlay for watch indicator, panel integration.

#### G6: Spot Hover/Click Not Implemented

**Current:** Spots render as arcs but aren't interactive.

**Required:** Hit detection for spot endpoints, `SpotDetailsFlyout` integration.

### 3.3 Medium Priority Gaps

| Gap | Description                                 |
| --- | ------------------------------------------- |
| G7  | Double-click to center view not implemented |
| G8  | Compass rose overlay missing                |
| G9  | Spot highlight effect for focused spot      |
| G10 | Callsign labels at DX locations             |

### 3.4 Low Priority Gaps

| Gap | Description                                |
| --- | ------------------------------------------ |
| G11 | Smooth zoom animations (currently instant) |
| G12 | Spot clustering at high zoom levels        |
| G13 | Auto-rotate feature (applicable to 2D?)    |

---

## 4. Feature Mapping Matrix

| 3D Globe Feature            | 2D Map Equivalent    | Complexity   | Dependencies          | Priority |
| --------------------------- | -------------------- | ------------ | --------------------- | -------- |
| **Rendering**         |                      |              |                       |          |
| EarthSphere (WebGL)         | Canvas 2D texture    | Equivalent   | -                     | Done     |
| NightOverlay (shader)       | Pixel iteration      | Equivalent   | -                     | Done     |
| NightLightsOverlay (shader) | drawCityLights()     | Partial      | Texture loading       | High     |
| Terminator (line geometry)  | drawTerminator()     | Equivalent   | -                     | Done     |
| Greyline (mesh)             | drawGreyline()       | Equivalent   | -                     | Done     |
| Aurora (point cloud)        | Canvas scatter       | Equivalent   | -                     | Done     |
| MUF (shader)                | Canvas grid          | Equivalent   | -                     | Done     |
| **Spots**             |                      |              |                       |          |
| LiveSpotArcs                | drawSpotArc()        | Equivalent   | -                     | Done     |
| SpotMarker                  | drawSpotDot()        | Simpler      | -                     | Done     |
| SpotCluster                 | drawClusterMarker()  | Medium       | Clustering logic      | Low      |
| SpotLabel                   | Canvas text          | Medium       | Font handling         | Medium   |
| SpotHighlight               | drawPulsingRings()   | Medium       | Animation loop        | Medium   |
| SpotEndpointHitArea         | Hit test calculation | Medium       | Event handling        | High     |
| SpotDetailsFlyout           | DOM overlay          | Medium       | Portal rendering      | High     |
| **Interaction**       |                      |              |                       |          |
| GlobeClickHandler           | FlatMapClickHandler  | High         | Gesture detection     | Critical |
| Hover → tooltip            | Mouse tracking       | High         | Coordinate conversion | Critical |
| Press-hold → flyout        | Timer + state        | High         | UI feedback           | Critical |
| Double-click → center      | Event detection      | Low          | View animation        | Medium   |
| Drag → pan                 | Mouse delta tracking | Medium       | Bounds clamping       | Done     |
| **Overlays**          |                      |              |                       |          |
| GlobeTooltip                | Reuse as-is          | Low          | Position conversion   | Critical |
| GlobeFlyout                 | Reuse as-is          | Low          | Position conversion   | Critical |
| AddPinDialog                | Reuse as-is          | None         | State wiring          | High     |
| GridResearchPanel           | Reuse as-is          | None         | State wiring          | High     |
| WatchListPanel              | Reuse as-is          | None         | State wiring          | High     |
| WatchIndicator              | Reuse as-is          | None         | State wiring          | High     |
| **Markers**           |                      |              |                       |          |
| LocationMarker (home)       | drawHomeMarker()     | Equivalent   | -                     | Done     |
| LocationMarker (target)     | drawTargetMarker()   | Equivalent   | -                     | Done     |
| CompassRose                 | Canvas arc + labels  | Medium       | Bearing calculation   | Medium   |
| Pin markers                 | drawPin()            | Low          | Pin store integration | High     |
| **Controls**          |                      |              |                       |          |
| OrbitControls (zoom)        | Scroll wheel zoom    | Different UX | Bounds clamping       | Done     |
| OrbitControls (rotate)      | N/A (pan instead)    | N/A          | -                     | N/A      |
| Camera fly-to               | Smooth pan/zoom      | Medium       | Animation easing      | Low      |

---

## 5. New Feature Requirements

### 5.1 Region View Presets

#### Overview

Allow users to save and quickly switch between predefined geographic views. This addresses a common workflow where operators focus on specific propagation paths (e.g., "North America to Europe" or "Pacific Rim").

#### User Stories

1. As a DX hunter, I want to quickly jump to my common propagation targets without manually panning/zooming.
2. As a contest operator, I want preset views for different contest zones I'm targeting.
3. As a VHF enthusiast, I want a preset centered on my regional coverage area.

#### Data Model

```typescript
interface RegionPreset {
  id: string;
  name: string; // User-defined name
  icon?: string; // Optional emoji or icon identifier
  center: { lat: number; lon: number };
  zoom: number; // 0.5 - 4.0
  rotation?: { x: number; y: number }; // For globe mode
  viewMode?: "globe" | "flat" | "azimuthal"; // Optional lock
  isBuiltIn: boolean; // System vs user-created
  createdAt: string;
  lastUsed?: string;
}
```

#### Built-in Presets

| Preset Name    | Center   | Zoom | Description               |
| -------------- | -------- | ---- | ------------------------- |
| World Overview | 0, 0     | 1.0  | Default full view         |
| North America  | 40, -100 | 1.8  | CONUS + southern Canada   |
| Europe         | 50, 10   | 2.0  | Western/Central Europe    |
| Japan/Pacific  | 35, 140  | 1.8  | Japan + Pacific islands   |
| Caribbean      | 18, -70  | 2.2  | Central America + islands |
| South America  | -15, -60 | 1.6  | Full continent            |
| Africa         | 5, 20    | 1.4  | Full continent            |
| Oceania        | -25, 135 | 1.6  | Australia + NZ + Pacific  |
| NA→EU Path    | 45, -30  | 1.2  | Atlantic propagation view |
| NA→JA Path    | 40, -160 | 1.2  | Pacific propagation view  |

#### UI Components Required

1. **Preset Selector Dropdown**: Quick access in map toolbar
2. **Preset Manager Panel**: Create, edit, delete, reorder presets
3. **"Save Current View" Action**: Quick-save current pan/zoom as preset
4. **Keyboard Shortcuts**: Number keys 1-9 for quick preset access

#### State Management

```typescript
// In mapStore.ts
interface MapStore {
  // Existing...
  regionPresets: RegionPreset[];
  activePresetId: string | null;

  // Actions
  setActivePreset: (id: string) => void;
  addPreset: (preset: Omit<RegionPreset, "id" | "createdAt">) => void;
  updatePreset: (id: string, updates: Partial<RegionPreset>) => void;
  deletePreset: (id: string) => void;
  reorderPresets: (ids: string[]) => void;
  saveCurrentAsPreset: (name: string) => void;
}
```

#### Interaction Flow

1. User clicks preset dropdown or presses number key
2. Map smoothly animates to preset center/zoom (500ms ease-out)
3. Preset becomes "active" (highlighted in dropdown)
4. Manual pan/zoom clears active state
5. "Save as preset" captures current view state

### 5.2 City Lights Enhancement

#### Current State

FlatMapView renders 30 hardcoded major cities as simple dots.

#### Target State

Match the GlobeView's NASA Black Marble style with:

- Texture-based city lights (not point-based)
- Warm color tint (yellowish-orange glow)
- Brightness based on population density
- Only visible in night regions

#### Implementation Options

| Option                    | Pros                            | Cons                          |
| ------------------------- | ------------------------------- | ----------------------------- |
| A: Load night texture     | Accurate, consistent with globe | Larger file, complex blending |
| B: Expanded city database | Lighter weight, customizable    | Less realistic, more code     |
| C: WebGL canvas           | Best visual quality             | Different rendering approach  |

**Recommendation:** Option A (texture-based) for visual consistency with globe mode.

---

## 6. Viewport/Rendering Issues

### 6.1 Current Implementation

```typescript
// FlatMapView.tsx
const MAP_WIDTH = 1024;
const MAP_HEIGHT = 512;

<canvas
  width={MAP_WIDTH}
  height={MAP_HEIGHT}
  className="cursor-crosshair max-w-full max-h-full"
  style={{
    imageRendering: "auto",
    aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
    objectFit: "contain",
  }}
/>
```

### 6.2 Identified Issues

#### Issue 1: Black Edges

**Symptom:** When container aspect ratio differs from 2:1, black bars appear.

**Cause:** `objectFit: "contain"` preserves aspect ratio but doesn't fill container.

**Fix Options:**

- A: Use `objectFit: "cover"` (crops edges)
- B: Dynamic canvas sizing to match container
- C: Background color matching map edges

#### Issue 2: Fixed Resolution

**Symptom:** Map appears pixelated on high-DPI displays.

**Cause:** Canvas always renders at 1024x512 regardless of display.

**Fix:** Multiply dimensions by `window.devicePixelRatio`.

#### Issue 3: Zoom Math Assumes Fixed Size

**Symptom:** Zoom offset calculations use hardcoded dimensions.

**Cause:** `MAP_WIDTH * (newScale - 1)` doesn't account for actual display size.

**Fix:** Calculate based on actual rendered dimensions.

### 6.3 Reference Implementation

AzimuthalView handles this correctly:

```typescript
const [displaySize, setDisplaySize] = useState({ width: 400, height: 400 });

useEffect(() => {
  const observer = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect;
    setDisplaySize({
      width: Math.floor(width),
      height: Math.floor(height),
    });
  });
  observer.observe(containerRef.current);
  return () => observer.disconnect();
}, []);
```

### 6.4 Recommended Approach

1. Add ResizeObserver to track container dimensions
2. Calculate canvas dimensions maintaining 2:1 aspect ratio
3. Apply devicePixelRatio for crisp rendering
4. Update zoom calculations to use dynamic dimensions
5. Handle orientation changes on mobile

---

## 7. Day/Night Visualization Requirements

### 7.1 Current Implementation Analysis

#### FlatMapView Night Side Rendering

```typescript
function drawNightSide(ctx: CanvasRenderingContext2D, date: Date) {
  const subsolar = getSubsolarPoint(date);
  const imageData = ctx.getImageData(0, 0, MAP_WIDTH, MAP_HEIGHT);

  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const lat = 90 - (y / MAP_HEIGHT) * 180;
      const lon = (x / MAP_WIDTH) * 360 - 180;

      // Spherical geometry calculation
      const angle = calculateSolarAngle(lat, lon, subsolar);

      if (angle > 90) {
        // Night side - darken pixels
        const darkness = Math.min(0.7, ((angle - 90) / 30) * 0.7);
        // Modify RGB channels
      } else if (angle > 85) {
        // Twilight - orange tint
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}
```

**Current Quality:** Functional but basic. Per-pixel iteration is correct but lacks visual sophistication.

### 7.2 Target Visualization

#### Grayscale/Desaturated Night Zones

Instead of simple darkening, apply desaturation to simulate low-light vision:

```typescript
// Convert to grayscale, then apply blue-shift
const gray = 0.299 * r + 0.587 * g + 0.114 * b;
const nightR = gray * 0.3;
const nightG = gray * 0.3;
const nightB = gray * 0.5; // Blue shift
```

#### City Lights Overlay

**Option A: Texture-Based (Recommended)**

1. Load `/textures/earth-night.jpg` (same as globe)
2. Composite only on night-side pixels
3. Use additive blending for glow effect

**Option B: Point-Based Enhanced**

Expand from 30 to 200+ cities with:

- Population-based brightness/size
- Glow radius effect
- Warm color temperature

#### Twilight/Grayline Enhancement

Current greyline is a simple band. Enhance with:

- Gradient from day → twilight → night
- Enhanced visibility indicator (propagation zone)
- Optional animated glow for "peak" conditions

### 7.3 Performance Considerations

| Approach                 | Pixels/Frame | Target FPS | Acceptable? |
| ------------------------ | ------------ | ---------- | ----------- |
| Current pixel iteration  | 524,288      | 30         | Marginal    |
| With texture composite   | 1,048,576    | 30         | Slow        |
| WebGL shader             | N/A (GPU)    | 60         | Optimal     |
| Cached layer + composite | 524,288      | 60         | Good        |

**Recommendation:** Use layer caching - only recalculate night overlay when time changes by >1 minute.

### 7.4 Visual Reference

Target appearance should match:

- GlobeView's NightLightsOverlay.tsx
- NASA Black Marble imagery
- Competitor reference: Geochron 4K night visualization

---

## 8. Prioritized Work Breakdown Structure

### Phase 1: Foundation (Critical Path)

#### 1.1 Viewport/Sizing Fix

- [ ] Add ResizeObserver to FlatMapView
- [ ] Implement dynamic canvas sizing
- [ ] Apply devicePixelRatio scaling
- [ ] Update zoom calculations
- [ ] Verify no black edges at various container sizes

#### 1.2 Interaction System

- [ ] Create `FlatMapClickHandler` component (or integrate into FlatMapView)
- [ ] Implement gesture state machine (idle → potential → holding/dragging)
- [ ] Add mouse position tracking with lat/lon conversion
- [ ] Add press-and-hold timer with visual feedback
- [ ] Add double-click detection

#### 1.3 Tooltip Integration

- [ ] Wire `tooltipPosition` to mapStore on hover
- [ ] Render `GlobeTooltip` via portal (reuse existing)
- [ ] Ensure tooltip positioning works for 2D coordinates

#### 1.4 Flyout Integration

- [ ] Wire `flyoutPosition` to mapStore on hold-complete
- [ ] Render `GlobeFlyout` via portal (reuse existing)
- [ ] Ensure flyout actions work in 2D context

### Phase 2: Panel Integration

#### 2.1 Dialog/Panel State

- [ ] Add state for `addPinDialogOpen`
- [ ] Add state for `gridResearchPanelOpen`
- [ ] Add state for `watchListPanelOpen`

#### 2.2 Panel Rendering

- [ ] Render `AddPinDialog` via portal
- [ ] Render `GridResearchPanel` via portal
- [ ] Render `WatchListPanel` via portal
- [ ] Render `WatchIndicator` overlay

#### 2.3 Pin Visualization

- [ ] Implement `drawPin()` function
- [ ] Integrate with `usePinStore`
- [ ] Match visual style with globe markers

### Phase 3: Spot Enhancement

#### 3.1 Spot Hover Detection

- [ ] Calculate hit boxes for spot endpoints
- [ ] Implement hit testing on mouse move
- [ ] Integrate `SpotDetailsFlyout` on hover

#### 3.2 Spot Visual Enhancements

- [ ] Add callsign labels at DX locations
- [ ] Implement spot highlight effect for focused spot
- [ ] Add spot clustering at low zoom levels (optional)

### Phase 4: Day/Night Visualization

#### 4.1 Night Rendering Enhancement

- [ ] Implement grayscale desaturation for night zones
- [ ] Add blue color shift for night atmosphere
- [ ] Improve twilight gradient smoothness

#### 4.2 City Lights

- [ ] Load and cache night texture
- [ ] Implement texture compositing on night regions
- [ ] Add warm color tint and glow effect
- [ ] Optimize with layer caching

### Phase 5: Region View Presets

#### 5.1 Data Model

- [ ] Add `RegionPreset` type definition
- [ ] Add state to mapStore
- [ ] Implement CRUD actions
- [ ] Add persistence layer

#### 5.2 Built-in Presets

- [ ] Define 10 default presets
- [ ] Add preset initialization on first load

#### 5.3 UI Components

- [ ] Create preset selector dropdown
- [ ] Create preset manager panel
- [ ] Add "Save current view" action
- [ ] Implement keyboard shortcuts (1-9)

#### 5.4 Animation

- [ ] Implement smooth pan/zoom animation
- [ ] Add easing function (ease-out cubic)

### Phase 6: Polish & Testing

#### 6.1 Visual Polish

- [ ] Compass rose implementation
- [ ] Smooth zoom transitions
- [ ] Consistent styling across modes

#### 6.2 Testing

- [ ] Test all interactions on desktop
- [ ] Test touch interactions on mobile/tablet
- [ ] Performance profiling
- [ ] Accessibility audit

---

## 9. Open Questions

### Product Questions

1. **Should 2D map support auto-rotate?** Globe auto-rotate makes sense, but what would 2D equivalent be - auto-pan along grayline? 2D map should only need autopan if the viewable area is off screen , yes support that.
2. **Keyboard shortcuts scope:** Should number keys 1-9 for presets work globally or only when map is focused? They hsould be the same across map viewws and work the same or work as they should be in spirit if they cant work exactly the same due to 3d vs 2d, refactor for 2d.
3. **Preset sharing:** Should users be able to export/import presets? yes
4. **Touch gestures:** What gestures should we support on touch devices? Pinch-zoom, two-finger pan? all of them 

### Technical Questions

5. **Canvas vs WebGL:** Should we consider migrating FlatMapView to WebGL for better performance and visual effects? This would be a larger architectural change. Yes
6. **Shared components:** Should GlobeTooltip/GlobeFlyout be renamed to generic MapTooltip/MapFlyout since they'll be shared? yes
7. **Layer caching strategy:** How frequently should night overlay be recalculated? Every frame, every minute, on time change only? we only ever need one CLEAN night overlay so we need to just gran a nice night view that has no blotches and cloudcover in it 1 time ands save that view. ITs not importanbt that it be super current. 

### Competitive Questions

8. **Click-to-tune:** Should we add radio integration (click spot to tune transceiver)? This is expected in competitors but requires CAT control. This sound sliek a big feature add and we can add it later.
9. **Award tracking overlays:** Should we add DXCC/Zone overlay toggles like GridTracker? yes
10. **Offline mode:** Is offline functionality a requirement? Some competitors emphasize this for field operations. not at this time but we code with an eye towardfs migrating to online w supabase and also being able to work totally offline. 

---

## Appendix A: Competitive Feature Reference

| Feature        | HamClock | DX Atlas | MacLoggerDX | GridTracker | PropSphere Target |
| -------------- | -------- | -------- | ----------- | ----------- | ----------------- |
| Grayline       | Yes      | Yes      | Yes         | Yes         | Yes               |
| Night lights   | Basic    | No       | No          | No          | Yes (enhanced)    |
| Spot display   | Yes      | Via API  | Yes         | Yes         | Yes               |
| Hover info     | Yes      | Yes      | Yes         | Yes         | Yes (planned)     |
| Click actions  | Limited  | No       | Full        | Full        | Yes (planned)     |
| Region presets | No       | No       | No          | No          | Yes (new)         |
| 2D + 3D modes  | No       | Yes      | Yes         | No          | Yes               |
| Responsive     | No       | No       | Yes         | Yes         | Yes (planned)     |

---

## Appendix B: File Impact Summary

### New Files

| File                                            | Purpose                  |
| ----------------------------------------------- | ------------------------ |
| `src/components/map/FlatMapClickHandler.tsx`  | Gesture detection for 2D |
| `src/components/map/RegionPresetSelector.tsx` | Preset dropdown UI       |
| `src/components/map/RegionPresetManager.tsx`  | Preset CRUD panel        |

### Modified Files

| File                                   | Changes                                              |
| -------------------------------------- | ---------------------------------------------------- |
| `src/components/map/FlatMapView.tsx` | Resize handling, interaction system, panel rendering |
| `src/stores/mapStore.ts`             | Region presets state + actions                       |
| `src/types/map.ts`                   | RegionPreset type definition                         |
| `src/components/map/index.ts`        | New exports                                          |

### Reused Files (No Changes)

| File                                         | Usage                   |
| -------------------------------------------- | ----------------------- |
| `src/components/map/GlobeTooltip.tsx`      | Rendered in FlatMapView |
| `src/components/map/GlobeFlyout.tsx`       | Rendered in FlatMapView |
| `src/components/map/AddPinDialog.tsx`      | Rendered in FlatMapView |
| `src/components/map/GridResearchPanel.tsx` | Rendered in FlatMapView |
| `src/components/map/WatchListPanel.tsx`    | Rendered in FlatMapView |
| `src/components/map/WatchIndicator.tsx`    | Rendered in FlatMapView |
| `src/components/map/SpotDetailsFlyout.tsx` | Rendered on spot hover  |

---

_Document End_
