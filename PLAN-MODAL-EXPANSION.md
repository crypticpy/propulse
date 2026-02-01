# Implementation Plan: Chart Sizing Fix & Expandable Modal System

Created: 2026-01-31
Status: PENDING APPROVAL

## Summary

Fix the K-index and Solar Flux charts that aren't utilizing their available space, and add expandable modal views to all KPI cards and charts. Each modal will provide rich, interactive deep-dive content following progressive disclosure principles. The modals will include live sun imagery from NASA SDO, historical trends, and interactive visualizations.

## Scope

### In Scope

- Fix chart sizing issues (SVG not filling container width)
- Create reusable `DetailModal` component based on existing `SettingsModal` pattern
- Add expandable modals to 7 components:
  1. MetricCard (4 cards: Solar Flux, K-Index, Sunspot Number, A-Index)
  2. KIndexChart - expanded geomagnetic analysis
  3. SolarFluxChart - expanded flux analysis with predictions
  4. SolarSummary - expanded propagation breakdown
  5. FlareProbability - expanded flare analysis
  6. BandConditions - expanded band-by-band analysis
- Integrate NASA SDO live imagery for sunspot modal
- Mobile-responsive modal layouts
- Loading states and fallbacks for external data

### Out of Scope

- Changes to the PropSphere/map components
- Backend API changes (all data from existing NOAA APIs)
- User authentication or personalization features

## Prerequisites

- Dev server running at localhost:5173
- Access to NASA SDO/Helioviewer API for sun imagery

## Research Findings Summary

### Solar Flux Modal Best Practices

- Historical 30/90/365-day trends with interactive time range selection
- Solar activity context (quiet/moderate/active) with band recommendations
- Comparison with solar cycle averages
- Color-coded severity scales
- Mobile-friendly responsive charts

### K-Index/Geomagnetic Modal Best Practices

- NOAA G-scale integration (G1-G5 storm levels)
- Color coding: Green (K0-2), Yellow (K3-4), Red (K5+)
- 3-hour interval bar charts with 24-hour history
- Aurora probability based on current Kp
- Historical storm event data

### Sunspot/Sun Imagery Data Sources

- NASA SDO Helioviewer API: Real-time sun imagery in multiple wavelengths
- HMI Intensitygram: Shows sunspots on photosphere
- AIA wavelengths: 171Å, 304Å, 193Å for different solar features
- Updates every 5 minutes, data every 2 minutes
- Endpoint: `https://api.helioviewer.org/`

## Parallel Execution Strategy

Work will be parallelized across specialized sub-agents with clear file ownership to prevent conflicts.

### Workstream Analysis

| Workstream       | Agent Type     | Files Owned                                                                                 | Dependencies |
| ---------------- | -------------- | ------------------------------------------------------------------------------------------- | ------------ |
| Chart Sizing     | Opus sub-agent | KIndexChart.tsx, SolarFluxChart.tsx                                                         | None         |
| DetailModal Base | Opus sub-agent | DetailModal.tsx (new), ui/index.ts                                                          | None         |
| Metric Modals    | Opus sub-agent | MetricDetailModal.tsx (new), MetricCard.tsx                                                 | DetailModal  |
| Chart Modals     | Opus sub-agent | KIndexDetailModal.tsx (new), SolarFluxDetailModal.tsx (new)                                 | DetailModal  |
| Other Modals     | Opus sub-agent | SolarSummaryModal.tsx (new), FlareProbabilityModal.tsx (new), BandConditionsModal.tsx (new) | DetailModal  |
| Page Integration | Opus sub-agent | SolarPulse.tsx                                                                              | All modals   |

### File Ownership Matrix

```
Agent 1 (Chart Sizing):
  - src/components/solar/KIndexChart.tsx
  - src/components/solar/SolarFluxChart.tsx

Agent 2 (DetailModal Base):
  - src/components/ui/DetailModal.tsx (NEW)
  - src/components/ui/index.ts (add export)

Agent 3 (Metric Modals):
  - src/components/solar/modals/SolarFluxModal.tsx (NEW)
  - src/components/solar/modals/KIndexModal.tsx (NEW)
  - src/components/solar/modals/SunspotModal.tsx (NEW)
  - src/components/solar/modals/AIndexModal.tsx (NEW)
  - src/components/solar/MetricCard.tsx (add onClick)
  - src/components/solar/PrimaryMetrics.tsx (add modal state)

Agent 4 (Chart Modals):
  - src/components/solar/modals/KIndexChartModal.tsx (NEW)
  - src/components/solar/modals/SolarFluxChartModal.tsx (NEW)

Agent 5 (Other Modals):
  - src/components/solar/modals/SolarSummaryModal.tsx (NEW)
  - src/components/solar/modals/FlareProbabilityModal.tsx (NEW)
  - src/components/solar/modals/BandConditionsModal.tsx (NEW)
  - src/components/solar/modals/index.ts (NEW - barrel export)

Agent 6 (Page Integration):
  - src/pages/SolarPulse.tsx
  - src/components/solar/index.ts (add modal exports)
```

## Implementation Phases

### Phase 1: Foundation (Chart Sizing + DetailModal Base)

**Objective**: Fix immediate chart sizing issues and create reusable modal infrastructure

**Parallel Tasks** (run simultaneously via Opus sub-agents):

1. **Task 1A: Fix Chart Sizing** - Owns: KIndexChart.tsx, SolarFluxChart.tsx
   - Change SVG `preserveAspectRatio` from `"xMidYMid meet"` to `"none"` to allow stretching
   - Alternatively, remove fixed height containers and let SVG control sizing
   - Ensure charts fill their grid cell width while maintaining readable proportions
   - Test on multiple viewport sizes

2. **Task 1B: Create DetailModal Component** - Owns: DetailModal.tsx, ui/index.ts
   - Create `/src/components/ui/DetailModal.tsx` following SettingsModal pattern
   - Props: `isOpen`, `onClose`, `title`, `subtitle?`, `size: 'md' | 'lg' | 'xl' | 'full'`
   - Full-screen on mobile, max-width on desktop
   - Backdrop with blur, animate-fade-in-up entrance
   - Close button, ESC key handler, click-outside-to-close
   - Scrollable content area
   - Export from ui/index.ts

**Files to Modify**:

- `src/components/solar/KIndexChart.tsx` - Fix SVG sizing - Owner: Task 1A
- `src/components/solar/SolarFluxChart.tsx` - Fix SVG sizing - Owner: Task 1A
- `src/components/ui/DetailModal.tsx` - NEW - Owner: Task 1B
- `src/components/ui/index.ts` - Add DetailModal export - Owner: Task 1B

**Phase Verification**:

- [ ] K-Index chart fills container width (visual check)
- [ ] Solar Flux chart fills container width (visual check)
- [ ] DetailModal opens/closes correctly (manual test)
- [ ] DetailModal is responsive (test at mobile breakpoints)

**Phase Review Gate**:

- [ ] Run `final-review-completeness` agent
- [ ] Run `principal-code-reviewer` agent
- [ ] Address all critical/high issues before proceeding

---

### Phase 2: Metric Card Modals

**Objective**: Add expandable modals to the 4 primary metric cards

**Sequential Task** (depends on Phase 1):

1. **Task 2A: Create Metric Modal Components** - Owns: modals/\*.tsx, MetricCard.tsx, PrimaryMetrics.tsx
   - Create `src/components/solar/modals/` directory
   - Create `SolarFluxModal.tsx`:
     - Extended 90-day chart with zoom controls
     - Historical average comparison
     - Band condition implications
     - HF propagation impact explanation
   - Create `KIndexModal.tsx`:
     - NOAA G-scale explanation (G1-G5)
     - Current storm probability
     - Aurora visibility map/zones
     - Historical K-index archive (last 30 days)
   - Create `SunspotModal.tsx`:
     - NASA SDO live imagery (HMI intensitygram)
     - Active region list with details
     - Solar cycle position indicator
     - Image loading states and fallbacks
   - Create `AIndexModal.tsx`:
     - A-index explanation and derivation
     - Relationship to K-index
     - Historical trend mini-chart
   - Update `MetricCard.tsx`: Add `onClick` prop and cursor-pointer styling
   - Update `PrimaryMetrics.tsx`: Add modal state and render modals

**Files to Create**:

- `src/components/solar/modals/SolarFluxModal.tsx` - Owner: Task 2A
- `src/components/solar/modals/KIndexModal.tsx` - Owner: Task 2A
- `src/components/solar/modals/SunspotModal.tsx` - Owner: Task 2A
- `src/components/solar/modals/AIndexModal.tsx` - Owner: Task 2A

**Files to Modify**:

- `src/components/solar/MetricCard.tsx` - Add onClick handler - Owner: Task 2A
- `src/components/solar/PrimaryMetrics.tsx` - Add modal state/rendering - Owner: Task 2A

**Phase Verification**:

- [ ] All 4 metric cards show pointer cursor on hover
- [ ] Clicking each card opens corresponding modal
- [ ] SDO imagery loads in Sunspot modal (with fallback)
- [ ] Modals close via X button, ESC key, and backdrop click

**Phase Review Gate**:

- [ ] Run `final-review-completeness` agent
- [ ] Run `principal-code-reviewer` agent
- [ ] Address all critical/high issues before proceeding

---

### Phase 3: Chart and Summary Modals

**Objective**: Add expandable modals to charts, summary, flare probability, and band conditions

**Parallel Tasks** (run simultaneously via Opus sub-agents):

1. **Task 3A: Chart Modals** - Owns: KIndexChartModal.tsx, SolarFluxChartModal.tsx
   - Create `KIndexChartModal.tsx`:
     - Full-size interactive K-index chart
     - 7-day history view
     - Storm event annotations
     - G-scale legend with descriptions
     - Download data option (CSV format)
   - Create `SolarFluxChartModal.tsx`:
     - Full-size interactive flux chart
     - Time range selector (7d/30d/90d/1y)
     - Solar cycle overlay option
     - Statistical summary (min/max/avg/trend)
     - Propagation condition annotations

2. **Task 3B: Other Component Modals** - Owns: SolarSummaryModal.tsx, FlareProbabilityModal.tsx, BandConditionsModal.tsx
   - Create `SolarSummaryModal.tsx`:
     - Detailed propagation analysis
     - All band recommendations (not just top 4)
     - Time-of-day best bands chart
     - Short path vs long path analysis
     - DX spotting cluster recent activity (if available)
   - Create `FlareProbabilityModal.tsx`:
     - Detailed flare class explanations (A/B/C/M/X)
     - Historical flare activity (last 7 days)
     - Impact on radio communications
     - X-ray flux trend chart (GOES data)
   - Create `BandConditionsModal.tsx`:
     - Full band matrix with all details
     - MUF/LUF estimates if available
     - Noise floor indicators
     - Propagation mode explanations (F2, Es, etc.)
   - Create `src/components/solar/modals/index.ts` barrel export

**Files to Create**:

- `src/components/solar/modals/KIndexChartModal.tsx` - Owner: Task 3A
- `src/components/solar/modals/SolarFluxChartModal.tsx` - Owner: Task 3A
- `src/components/solar/modals/SolarSummaryModal.tsx` - Owner: Task 3B
- `src/components/solar/modals/FlareProbabilityModal.tsx` - Owner: Task 3B
- `src/components/solar/modals/BandConditionsModal.tsx` - Owner: Task 3B
- `src/components/solar/modals/index.ts` - Owner: Task 3B

**Phase Verification**:

- [ ] All chart and component modals open correctly
- [ ] Interactive elements (time range selectors, etc.) work
- [ ] Content is readable and well-formatted on all screen sizes

**Phase Review Gate**:

- [ ] Run `final-review-completeness` agent
- [ ] Run `principal-code-reviewer` agent
- [ ] Address all critical/high issues before proceeding

---

### Phase 4: Integration and Polish

**Objective**: Wire up all modals to parent components and ensure consistent UX

**Sequential Task** (depends on Phases 2-3):

1. **Task 4A: Page Integration** - Owns: SolarPulse.tsx, component modifications
   - Update `KIndexChart.tsx`: Add `onExpand` prop and expand button
   - Update `SolarFluxChart.tsx`: Add `onExpand` prop and expand button
   - Update `SolarSummary.tsx`: Add `onExpand` prop and expand button
   - Update `FlareProbability.tsx`: Add `onExpand` prop and expand button
   - Update `BandConditions.tsx`: Add `onExpand` prop and expand button
   - Update `SolarPulse.tsx`:
     - Import all modal components
     - Add state for each modal's open/close
     - Render modals with appropriate data props
     - Pass `onExpand` callbacks to child components
   - Update `src/components/solar/index.ts`: Export all new modal components

**Files to Modify**:

- `src/components/solar/KIndexChart.tsx` - Add expand button/callback - Owner: Task 4A
- `src/components/solar/SolarFluxChart.tsx` - Add expand button/callback - Owner: Task 4A
- `src/components/solar/SolarSummary.tsx` - Add expand button/callback - Owner: Task 4A
- `src/components/solar/FlareProbability.tsx` - Add expand button/callback - Owner: Task 4A
- `src/components/solar/BandConditions.tsx` - Add expand button/callback - Owner: Task 4A
- `src/pages/SolarPulse.tsx` - Add all modal state and rendering - Owner: Task 4A
- `src/components/solar/index.ts` - Export modals - Owner: Task 4A

**Phase Verification**:

- [ ] All cards/charts show expand affordance (button or click)
- [ ] All modals open with correct data
- [ ] Navigation between modals doesn't cause state issues
- [ ] No console errors or warnings

**Phase Review Gate**:

- [ ] Run `final-review-completeness` agent
- [ ] Run `principal-code-reviewer` agent
- [ ] Address all critical/high issues before proceeding

---

## Final Deliverable Review

**MANDATORY**: After all phases complete, run both review agents on the ENTIRE deliverable:

1. `final-review-completeness` - Full codebase scan for incomplete items:
   - No TODO comments left in new code
   - No placeholder content in modals
   - No mock data where real data should be
   - All props properly typed

2. `principal-code-reviewer` - Comprehensive quality assessment:
   - TypeScript types are correct and complete
   - Accessibility (ARIA labels, keyboard navigation)
   - Performance (no unnecessary re-renders)
   - Code consistency with existing patterns

## Testing Strategy

**Manual Testing**:

- Test all modals on desktop (1920x1080, 1440x900)
- Test all modals on tablet (768x1024)
- Test all modals on mobile (375x812 iPhone X)
- Test keyboard navigation (Tab, ESC to close)
- Test with slow network for SDO imagery loading

**Edge Cases**:

- Modal opens while data is loading
- SDO API unavailable (fallback behavior)
- Very large/small K-index or flux values
- Empty data arrays

## Rollback Plan

If issues arise:

1. All new modal files can be deleted without affecting existing functionality
2. Component prop additions (onClick, onExpand) are additive and backward-compatible
3. Chart sizing changes can be reverted by restoring preserveAspectRatio value
4. Git history preserves all previous states

## Risks and Mitigations

| Risk                                       | Likelihood | Impact | Mitigation                                                |
| ------------------------------------------ | ---------- | ------ | --------------------------------------------------------- |
| SDO API rate limits                        | Med        | Med    | Implement caching, graceful fallback to static imagery    |
| Modal content overwhelming on mobile       | Med        | Med    | Design mobile-first, progressive disclosure within modals |
| Performance with many modals rendered      | Low        | Med    | Use conditional rendering (mount only when open)          |
| File conflict between agents               | Med        | High   | Clear file ownership matrix, no shared file edits         |
| Chart sizing breaks on edge viewport sizes | Low        | Med    | Test across breakpoints, use relative units               |

## Open Questions

1. **SDO Imagery Frequency**: How often should we refresh sun imagery in the Sunspot modal? (Suggested: every 5 minutes when modal is open)

2. **Data Download Feature**: Should the chart modals include "Download as CSV" functionality? (Suggested: Yes, good for ham radio operators tracking conditions)

3. **Deep Link Support**: Should modals be URL-addressable (e.g., `/dashboard?modal=kindex`)? (Suggested: Not in initial implementation, can add later)

---

**USER: Please review this plan. Edit any section directly, then confirm to proceed.**
