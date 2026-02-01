# Implementation Plan: Phase 5 Quality Fixes

Created: 2026-01-31
Status: PENDING APPROVAL

## Summary

Address all recommended improvements from the Phase 5 code review to achieve A-grade craftsmanship. This includes extracting duplicated code to shared utilities, standardizing spot limits, adding accessibility, and improving error handling.

## Scope

### In Scope

- Extract `PRESET_CONFIG` to shared constants file
- Standardize spot count limit to 50 across all views
- Add `aria-label` and `role` to canvas elements
- Add ErrorBoundary wrapper for GlobeView's Canvas
- Export and reuse `getAgeOpacity` from LiveSpotArcs
- Extract `latLonToCanvas` to shared canvas utilities
- Add loading skeleton for map image
- Ensure focus ring visibility on checkboxes

### Out of Scope

- Major refactoring of FlatMapView drawing functions (file size is acceptable)
- New features

## Parallel Execution Strategy

| Workstream | Files Owned                                                                                                      | Description                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **WS1**    | `src/constants/mapPresets.ts` (NEW), `PropSphere.tsx`, `FullscreenPropSphere.tsx`                                | Extract PRESET_CONFIG                     |
| **WS2**    | `src/lib/utils/canvas.ts` (NEW), `LiveSpotArcs.tsx`, `FlatMapView.tsx`, `AzimuthalView.tsx`, `DXSpotOverlay.tsx` | Extract shared utilities                  |
| **WS3**    | `GlobeView.tsx`                                                                                                  | Add ErrorBoundary, standardize spot limit |

---

## Implementation Phase

**Objective**: All fixes in one phase with clear file ownership.

### Task 1: Extract PRESET_CONFIG (WS1)

**Files:**

- Create `src/constants/mapPresets.ts` with shared PRESET_CONFIG
- Update `src/pages/PropSphere.tsx` - import from constants
- Update `src/components/map/FullscreenPropSphere.tsx` - import from constants

### Task 2: Extract Canvas Utilities (WS2)

**Files:**

- Create `src/lib/utils/canvas.ts` with:
  - `latLonToCanvas()` - coordinate conversion
  - `canvasToLatLon()` - reverse conversion
  - `getSpotAgeOpacity()` - re-export from LiveSpotArcs
- Update `src/components/map/LiveSpotArcs.tsx` - export getAgeOpacity
- Update `src/components/map/FlatMapView.tsx`:
  - Import from canvas.ts
  - Add `aria-label` and `role` to canvas
  - Add loading skeleton
- Update `src/components/map/AzimuthalView.tsx`:
  - Import getSpotAgeOpacity from canvas.ts
  - Add `aria-label` and `role` to canvas
- Update `src/components/dx/DXSpotOverlay.tsx` - import latLonToCanvas

### Task 3: GlobeView Fixes (WS3)

**Files:**

- Update `src/components/map/GlobeView.tsx`:
  - Add local ErrorBoundary for Canvas
  - Change maxArcs from 30 to 50

### Task 4: Sequential - Verify Focus Styles

After parallel tasks complete:

- Verify checkbox focus rings are visible
- Add `focus:ring-2` if needed

---

## Verification

- [ ] TypeScript compiles without errors
- [ ] Build succeeds
- [ ] No duplicate PRESET_CONFIG
- [ ] All canvas elements have aria-label
- [ ] Spot limit is 50 in all views
- [ ] GlobeView has ErrorBoundary

## Review Gate

- [ ] Run `final-review-completeness` agent
- [ ] Run `principal-code-reviewer` agent

---

**USER: Confirm to proceed.**
