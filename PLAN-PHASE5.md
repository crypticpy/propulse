# Implementation Plan: Phase 5 - PropSphere Expansion

Created: 2026-01-31
Status: PENDING APPROVAL

## Summary

Phase 5 enhances PropSphere with three major features: improved fullscreen mode with complete UI portability, an intelligent recommendations panel integrated into the main PropSphere page, and real live spots integration using PSKReporter and RBN APIs with animated path arcs on the map.

## Scope

### In Scope

- Enhance fullscreen mode with all features (recommendations, forecast, DX spots panel)
- Add RecommendationsPanel to the main PropSphere sidebar
- Enable live spots layer on the normal page view (not just fullscreen)
- Add animated spot arcs/paths showing recent contacts on all map views
- Add spots layer toggle to normal PropSphere controls
- Improve spot visualization with animated path lines
- Add spot count and source indicators

### Out of Scope

- New API integrations (PSKReporter and RBN proxies already exist and work)
- DX Cluster Telnet/WebSocket backend (documented as future Phase 6 work)
- Contact logging functionality (Phase 6)
- Award tracking (Phase 6)

## Prerequisites

- All Phase 4 files committed and deployed ✅
- PSKReporter and RBN API proxies functional ✅
- Recommendations engine (`recommendations.ts`) implemented ✅
- `useLiveSpots` hook implemented ✅
- `FullscreenPropSphere` component exists ✅

## Parallel Execution Strategy

Three workstreams can run mostly in parallel with clear file ownership:

| Workstream                            | Agent | Files Owned                                                                                                                 | Dependencies      |
| ------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **WS1: Fullscreen Enhancement**       | Opus  | `FullscreenPropSphere.tsx`                                                                                                  | None - standalone |
| **WS2: Main Page Integration**        | Opus  | `PropSphere.tsx`, `mapStore.ts`                                                                                             | None - standalone |
| **WS3: Animated Spots Visualization** | Opus  | `LiveSpotArcs.tsx`, `FlatMapView.tsx` (spots section), `GlobeView.tsx` (spots section), `AzimuthalView.tsx` (spots section) | None - standalone |

### File Ownership Matrix

| File                                          | WS1                  | WS2 | WS3 | Notes                            |
| --------------------------------------------- | -------------------- | --- | --- | -------------------------------- |
| `src/components/map/FullscreenPropSphere.tsx` | ✅                   |     |     | Add panels                       |
| `src/pages/PropSphere.tsx`                    |                      | ✅  |     | Add sidebar components           |
| `src/stores/mapStore.ts`                      |                      | ✅  |     | Minor: ensure spots layer toggle |
| `src/components/map/LiveSpotArcs.tsx`         |                      |     | ✅  | New animated component           |
| `src/components/map/FlatMapView.tsx`          |                      |     | ✅  | Add spot arcs rendering          |
| `src/components/map/GlobeView.tsx`            |                      |     | ✅  | Add spot arcs rendering          |
| `src/components/map/AzimuthalView.tsx`        |                      |     | ✅  | Add spot arcs rendering          |
| `src/components/map/index.ts`                 | Sequential after WS3 |     |     | Add exports                      |

---

## Implementation Phases

### Phase 1: Fullscreen Enhancement (WS1)

**Objective**: Enhance FullscreenPropSphere with complete feature parity plus recommendations panel.

**Parallel Tasks:**

**Task 1A: Enhance Fullscreen UI** - Owns: `FullscreenPropSphere.tsx`

Add to FullscreenPropSphere:

1. Add DXSpotList panel (collapsible, left side)
2. Add RecommendationsPanel (bottom-left overlay)
3. Add PropagationForecast mini card (optional, if space permits)
4. Ensure all panels work with keyboard navigation
5. Add spot count indicator showing how many spots are visible

**Changes:**

- Import `DXSpotList`, `RecommendationsPanel` from existing components
- Add collapsible left panel with `useLiveSpots` integration
- Add floating recommendations card at bottom-left
- Update CSS grid to accommodate new panels on large screens

**Files to Modify:**

- `src/components/map/FullscreenPropSphere.tsx` - Add panels and spot integration

**Phase Verification:**

- [ ] DXSpotList panel appears and is collapsible in fullscreen
- [ ] RecommendationsPanel shows when target is selected
- [ ] All panels respect keyboard navigation (ESC still exits)
- [ ] Mobile view gracefully hides additional panels

---

### Phase 2: Main Page Integration (WS2)

**Objective**: Add RecommendationsPanel and spots layer toggle to normal PropSphere page.

**Parallel Tasks:**

**Task 2A: Add Recommendations to Sidebar** - Owns: `PropSphere.tsx`

1. Import and add RecommendationsPanel below PathAnalysis in sidebar
2. Add spots layer toggle to the layer controls section
3. Add DXSpotList as collapsible section at bottom of sidebar
4. Update layout to handle additional content gracefully

**Task 2B: Verify Store Configuration** - Owns: `mapStore.ts`

1. Verify `layers.spots` toggle exists (it does based on exploration)
2. Ensure spots layer is properly integrated in presets

**Files to Modify:**

- `src/pages/PropSphere.tsx` - Add RecommendationsPanel, spots toggle, DXSpotList
- `src/stores/mapStore.ts` - Verify/update spots layer integration

**Phase Verification:**

- [ ] RecommendationsPanel appears in sidebar when target selected
- [ ] Spots layer toggle works in main page view
- [ ] DXSpotList shows in sidebar (collapsible)
- [ ] Presets correctly control spots layer

---

### Phase 3: Animated Spots Visualization (WS3)

**Objective**: Add animated spot arcs showing live contact paths on all map views.

**Parallel Tasks:**

**Task 3A: Create LiveSpotArcs Component** - Owns: `LiveSpotArcs.tsx` (NEW)

Create reusable component for rendering animated spot paths:

1. Accept spots array, home location, and render context (canvas/three.js)
2. Draw great circle arcs from spotter to spotted station
3. Animate arcs with fade-in effect for new spots
4. Color-code by mode (FT8=cyan, CW=yellow, SSB=green, etc.)
5. Add pulsing dot at each endpoint

**Task 3B: Integrate into FlatMapView** - Owns: `FlatMapView.tsx` (spots section only)

1. Import `useLiveSpots` hook
2. Read `layers.spots` from mapStore
3. When enabled, draw spot arcs on the canvas
4. Ensure arcs update on spot refresh (every 60s)

**Task 3C: Integrate into GlobeView** - Owns: `GlobeView.tsx` (spots section only)

1. Import `useLiveSpots` hook
2. Read `layers.spots` from mapStore
3. Render spot arcs as Three.js line geometries
4. Add glow effect using shader material (consistent with existing overlays)

**Task 3D: Integrate into AzimuthalView** - Owns: `AzimuthalView.tsx` (spots section only)

1. Import `useLiveSpots` hook
2. Read `layers.spots` from mapStore
3. Draw spot paths as straight lines (azimuthal projection advantage)
4. Color and animate consistently with other views

**New Files:**

- `src/components/map/LiveSpotArcs.tsx` - Shared arc rendering logic

**Files to Modify:**

- `src/components/map/FlatMapView.tsx` - Add spot arc rendering
- `src/components/map/GlobeView.tsx` - Add spot arc rendering
- `src/components/map/AzimuthalView.tsx` - Add spot arc rendering

**Phase Verification:**

- [ ] Spot arcs visible when spots layer enabled
- [ ] Arcs animate in smoothly for new spots
- [ ] Color coding matches mode (FT8=cyan, CW=amber, etc.)
- [ ] Performance acceptable with 50+ spots displayed
- [ ] Arcs work on all three view modes

---

### Phase 4: Integration & Polish (Sequential)

**Objective**: Final integration, exports, and polish.

**Sequential Tasks:**

1. **Update barrel exports** - `src/components/map/index.ts`
2. **Test all view modes** - Verify spots display correctly
3. **Performance testing** - Ensure no frame drops with 50+ spots
4. **Mobile responsiveness** - Verify collapsible panels work on mobile

**Files to Modify:**

- `src/components/map/index.ts` - Add LiveSpotArcs export

**Phase Verification:**

- [ ] All components properly exported
- [ ] No TypeScript errors
- [ ] Build succeeds
- [ ] All three map views render spots correctly

**Phase Review Gate:**

- [ ] Run `final-review-completeness` agent
- [ ] Run `principal-code-reviewer` agent
- [ ] Address all critical/high issues before proceeding

---

## Final Deliverable Review

**MANDATORY**: After all phases complete, run both review agents on the ENTIRE deliverable:

1. `final-review-completeness` - Full codebase scan for incomplete items
2. `principal-code-reviewer` - Comprehensive quality assessment

---

## Testing Strategy

### Manual Testing

- [ ] Enable spots layer → arcs appear on map
- [ ] Click on spot → target is set
- [ ] Fullscreen mode → all panels accessible
- [ ] Time slider → spots remain visible
- [ ] Mode filter in DXSpotList → arcs update accordingly
- [ ] Mobile view → panels collapse appropriately

### Integration Testing

- [ ] PSKReporter spots appear within 60 seconds
- [ ] RBN spots appear within 60 seconds
- [ ] Deduplication works (no duplicate arcs)
- [ ] Spot count matches displayed arcs

### Performance Testing

- [ ] 50+ spots render at 60fps
- [ ] No memory leaks after 10 minutes
- [ ] Arc animations smooth

---

## Rollback Plan

1. Revert changes to `PropSphere.tsx`, `FullscreenPropSphere.tsx`
2. Revert changes to map view components
3. Remove new `LiveSpotArcs.tsx` if created
4. All changes are additive - core functionality unaffected

---

## Risks and Mitigations

| Risk                            | Likelihood | Impact | Mitigation                                              |
| ------------------------------- | ---------- | ------ | ------------------------------------------------------- |
| API rate limiting (PSKReporter) | Medium     | Medium | 60-second refetch interval already configured           |
| Performance with many spots     | Medium     | Medium | Limit displayed spots to 50, efficient canvas rendering |
| File conflicts between agents   | Low        | High   | Clear file ownership matrix defined                     |
| Three.js complexity for arcs    | Medium     | Medium | Use existing overlay patterns from AuroraOverlay        |
| Mobile layout issues            | Medium     | Low    | Progressive enhancement - hide extra panels on mobile   |

---

## Architecture Notes

### Spot Data Flow

```
useLiveSpots hook (60s refresh)
  → PSKReporter API → Transform → LiveSpot[]
  → RBN API → Transform → LiveSpot[]
  → Deduplicate & Sort
  → Store in component state

Map Views read from useLiveSpots:
  → Filter by layers.spots toggle
  → Render arcs for each spot
  → Animate new arrivals
```

### Arc Rendering Strategy

**FlatMapView (Canvas 2D):**

- Use `bezierCurveTo` for curved great circle approximation
- Draw dots at endpoints
- Apply mode-based stroke color

**GlobeView (Three.js):**

- Create `TubeGeometry` along great circle path
- Use `ShaderMaterial` for glow effect
- Add `SphereGeometry` points at endpoints

**AzimuthalView (Canvas 2D):**

- Great circles appear as straight lines (projection property)
- Simple `lineTo` from home to target
- Same color coding as other views

### Color Scheme for Modes

```typescript
const MODE_COLORS = {
  FT8: "#44DDFF", // Cosmic cyan
  FT4: "#44DDFF", // Cosmic cyan
  CW: "#FFD23F", // Caution amber
  SSB: "#00FF88", // Signal green
  RTTY: "#AA44FF", // Aurora purple
  default: "#888888",
};
```

---

## Open Questions

None - all requirements are clear from the PRD and existing implementation patterns.

---

**USER: Please review this plan. Edit any section directly, then confirm to proceed.**
