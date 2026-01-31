# Implementation Plan: Phase 1 - Foundation & Solar Pulse Dashboard

Created: 2026-01-31
Status: PENDING APPROVAL

---

## Summary

Initialize a production-ready Vite + React 18 + TypeScript project with Tailwind CSS, implement a comprehensive design system based on existing prototypes, create the Solar Pulse dashboard with real-time NOAA API integration (via edge functions to handle CORS), user preferences in localStorage, and deploy to Vercel.

## Scope

### In Scope

- Project initialization (Vite, TypeScript, Tailwind CSS)
- Design system and component library
- NOAA API integration with edge function proxy (K-index, SFI, flares, sunspots)
- Solar Pulse dashboard (`/solar` route)
- Band conditions calculation logic
- User preferences (QTH, callsign, grid) stored in localStorage
- Zustand state management setup
- TanStack Query for data fetching
- Mobile-responsive layout
- Vercel deployment configuration

### Out of Scope (Future Phases)

- 3D globe view (Phase 2)
- PropSphere map features (Phase 2)
- LogBook contact logging (Phase 5)
- Backend on Railway (Phase 6)
- User accounts/authentication (Phase 6)
- LoTW/eQSL integration (Phase 6)

## Prerequisites

- Node.js 18+ installed
- npm or pnpm available
- Vercel account for deployment
- Understanding of existing prototype patterns in `solar-dashboard.jsx`

---

## Parallel Execution Strategy

Work will be divided into parallel workstreams that don't modify the same files. Each phase has independent tasks that can run simultaneously.

### Workstream Analysis

| Workstream           | Files Owned                                                                           | Dependencies                    |
| -------------------- | ------------------------------------------------------------------------------------- | ------------------------------- |
| Project Setup        | `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `tailwind.config.js` | None                            |
| Design System        | `src/styles/`, `src/components/ui/`                                                   | Project Setup                   |
| API Layer            | `src/lib/api/`, `src/hooks/`, `api/` (Vercel)                                         | Project Setup                   |
| Store Layer          | `src/stores/`                                                                         | Project Setup                   |
| Dashboard Components | `src/components/solar/`, `src/pages/`                                                 | Design System, API Layer, Store |
| Types & Utils        | `src/types/`, `src/lib/utils/`                                                        | Project Setup                   |

### File Ownership Matrix (Parallel Tasks)

**Phase 1.2 - Foundation (3 parallel agents):**

- Agent A: `src/lib/api/`, `api/solar/` (Vercel edge functions)
- Agent B: `src/components/ui/`, `src/styles/`
- Agent C: `src/stores/`, `src/types/`, `src/lib/utils/`

**Phase 1.3 - Dashboard (3 parallel agents):**

- Agent A: `src/components/solar/MetricCard.tsx`, `src/components/solar/SolarSummary.tsx`
- Agent B: `src/components/solar/BandConditions.tsx`, `src/components/solar/KIndexChart.tsx`
- Agent C: `src/components/solar/FlareProb.tsx`, `src/components/solar/SolarFluxChart.tsx`

---

## Implementation Phases

### Phase 1.1: Project Initialization (Sequential - Must Complete First)

**Objective**: Create the foundational project structure with all tooling configured.

**Tasks** (run sequentially):

1. **Initialize Vite + React + TypeScript project**

   ```bash
   npm create vite@latest . -- --template react-ts
   ```

2. **Install Phase 1 dependencies**

   ```bash
   npm install zustand @tanstack/react-query zod date-fns
   npm install tailwindcss @tailwindcss/vite
   npm install -D @types/node
   ```

3. **Configure Tailwind CSS v4 with custom design tokens**

4. **Create folder structure**

   ```
   src/
   ├── components/
   │   ├── ui/          # Shared UI components
   │   └── solar/       # Solar dashboard components
   ├── hooks/           # Custom React hooks
   ├── lib/
   │   ├── api/         # API client functions
   │   └── utils/       # Utility functions
   ├── pages/           # Page components
   ├── stores/          # Zustand stores
   ├── styles/          # Global styles, design tokens
   └── types/           # TypeScript types
   api/                  # Vercel edge functions
   └── solar/
   ```

5. **Configure Vercel deployment**

**Files to Create**:

- `package.json` - Dependencies and scripts
- `vite.config.ts` - Vite configuration with path aliases
- `tsconfig.json` - TypeScript configuration
- `tailwind.config.js` - Tailwind with custom theme
- `src/styles/globals.css` - Global CSS with Tailwind imports
- `index.html` - Entry HTML with fonts
- `vercel.json` - Vercel configuration
- `.gitignore` - Git ignore rules
- `src/main.tsx` - React entry point
- `src/App.tsx` - Root app component with providers

**Phase Verification**:

- [ ] `npm run dev` starts without errors
- [ ] TypeScript compiles with no errors
- [ ] Tailwind classes work in components
- [ ] Path aliases (`@/`) resolve correctly

---

### Phase 1.2: Foundation Layer (Parallel Tasks)

**Objective**: Build the core infrastructure for types, state, API, and UI components.

**Parallel Tasks** (run simultaneously via Opus sub-agents):

#### Task 1.2A: API Layer & Edge Functions

**Owner**: Agent A
**Files Owned**:

- `src/lib/api/noaa.ts` - NOAA API client
- `src/lib/api/types.ts` - API response types
- `src/hooks/useSolarData.ts` - TanStack Query hooks
- `api/solar/k-index.ts` - Vercel edge function
- `api/solar/flux.ts` - Vercel edge function
- `api/solar/probabilities.ts` - Vercel edge function
- `api/solar/sunspots.ts` - Vercel edge function

**Deliverables**:

- Edge functions that proxy NOAA SWPC endpoints with caching headers
- TypeScript interfaces for all NOAA API responses
- React Query hooks for each data type with proper stale/refetch timing
- Error handling with fallback to demo data

#### Task 1.2B: Design System & UI Components

**Owner**: Agent B
**Files Owned**:

- `src/styles/design-tokens.css` - CSS custom properties
- `src/components/ui/Card.tsx` - Reusable card component
- `src/components/ui/Badge.tsx` - Status badge component
- `src/components/ui/Tooltip.tsx` - Info tooltips
- `src/components/ui/ProgressBar.tsx` - Progress/probability bars
- `src/components/ui/LoadingSpinner.tsx` - Loading state
- `src/components/ui/index.ts` - Barrel export

**Deliverables**:

- CSS custom properties matching prototype:
  - Colors: `--color-orange`, `--color-green`, `--color-yellow`, `--color-red`, etc.
  - Fonts: Orbitron, JetBrains Mono, Inter
  - Gradients, shadows, spacing scale
- Reusable UI primitives following the design language
- Responsive variants for mobile

#### Task 1.2C: Store & Types & Utils

**Owner**: Agent C
**Files Owned**:

- `src/stores/userStore.ts` - User preferences (QTH, callsign)
- `src/stores/solarStore.ts` - Solar data state
- `src/types/solar.ts` - Solar data types
- `src/types/user.ts` - User types
- `src/lib/utils/bands.ts` - Band condition calculations
- `src/lib/utils/grid.ts` - Maidenhead grid conversion
- `src/lib/utils/time.ts` - UTC/local time formatting

**Deliverables**:

- Zustand stores with localStorage persistence
- TypeScript types for solar indices, band conditions, user settings
- Band condition calculation logic (ported from prototype)
- Grid square ↔ lat/lon conversion functions
- Time formatting utilities

**Files to Modify**: None (all new files)

**Phase Verification**:

- [ ] API hooks return typed data
- [ ] Edge functions respond with cached NOAA data
- [ ] UI components render with correct styles
- [ ] Stores persist to localStorage
- [ ] Band calculations match prototype logic

**Phase Review Gate**:

- [ ] Run `final-review-completeness` agent
- [ ] Run `principal-code-reviewer` agent
- [ ] Address all critical/high issues before proceeding

---

### Phase 1.3: Solar Dashboard Components (Parallel Tasks)

**Objective**: Build all Solar Pulse dashboard sections as modular components.

**Parallel Tasks** (run simultaneously via Opus sub-agents):

#### Task 1.3A: Primary Metrics Section

**Owner**: Agent A
**Files Owned**:

- `src/components/solar/MetricCard.tsx` - Individual metric display
- `src/components/solar/PrimaryMetrics.tsx` - 4-column metrics grid
- `src/components/solar/SolarSummary.tsx` - Overall conditions summary

**Deliverables**:

- MetricCard with label, value, unit, trend indicator, color coding
- PrimaryMetrics grid showing SFI, Kp, SSN, A-index
- SolarSummary with plain-language explanation

#### Task 1.3B: Band Conditions & K-Index Chart

**Owner**: Agent B
**Files Owned**:

- `src/components/solar/BandConditions.tsx` - Band matrix table
- `src/components/solar/BandRow.tsx` - Individual band row
- `src/components/solar/KIndexChart.tsx` - 24-hour K-index bar chart

**Deliverables**:

- Band conditions table with day/night columns
- Color-coded condition badges (Excellent/Good/Fair/Poor)
- SVG-based K-index chart with color coding by severity

#### Task 1.3C: Flare Probability & Solar Flux Chart

**Owner**: Agent C
**Files Owned**:

- `src/components/solar/FlareProbability.tsx` - Flare probability bars
- `src/components/solar/SolarFluxChart.tsx` - 30-day SFI trend chart
- `src/components/solar/EventAlert.tsx` - Solar event alert banner

**Deliverables**:

- Flare probability display with C/M/X/Proton bars
- SVG line chart for solar flux trend
- Conditional alert component for active events

**Files to Modify**: None (all new files)

**Phase Verification**:

- [ ] All components render with live data
- [ ] Charts display correctly with various data sizes
- [ ] Mobile layout stacks appropriately
- [ ] Loading states show while data fetches

**Phase Review Gate**:

- [ ] Run `final-review-completeness` agent
- [ ] Run `principal-code-reviewer` agent
- [ ] Address all critical/high issues before proceeding

---

### Phase 1.4: Page Assembly & Routing (Sequential)

**Objective**: Assemble components into pages and set up routing.

**Sequential Tasks**:

1. **Create Solar Pulse page**
   - `src/pages/SolarPulse.tsx` - Assembles all solar components

2. **Create minimal home page**
   - `src/pages/Home.tsx` - Placeholder with navigation to /solar

3. **Set up React Router**
   - `src/App.tsx` - Add routing configuration
   - Routes: `/` (home), `/solar` (Solar Pulse)

4. **Create layout components**
   - `src/components/layout/Header.tsx` - App header with logo, UTC time
   - `src/components/layout/Layout.tsx` - Shared layout wrapper

5. **Add user settings modal**
   - `src/components/settings/SettingsModal.tsx` - QTH, callsign input
   - `src/components/settings/QTHInput.tsx` - Location input with geocoding

**Files to Modify**:

- `src/App.tsx` - Add router and providers
- `src/main.tsx` - Ensure QueryClientProvider wraps app

**New Files to Create**:

- `src/pages/SolarPulse.tsx`
- `src/pages/Home.tsx`
- `src/components/layout/Header.tsx`
- `src/components/layout/Layout.tsx`
- `src/components/settings/SettingsModal.tsx`
- `src/components/settings/QTHInput.tsx`

**Phase Verification**:

- [ ] Navigation works between pages
- [ ] Header displays current UTC time
- [ ] Settings modal opens and saves preferences
- [ ] User QTH persists across page reloads

**Phase Review Gate**:

- [ ] Run `final-review-completeness` agent
- [ ] Run `principal-code-reviewer` agent
- [ ] Address all critical/high issues before proceeding

---

### Phase 1.5: Polish & Deployment (Sequential)

**Objective**: Add animations, responsive tweaks, and deploy to Vercel.

**Sequential Tasks**:

1. **Add CSS animations**
   - Loading spinner animation
   - Fade-in animations for cards
   - Pulse animation for live data indicators

2. **Mobile responsiveness audit**
   - Test and fix layouts at 375px, 768px, 1024px
   - Ensure touch targets are 44px minimum

3. **Error boundaries**
   - Add error boundary component
   - Graceful fallback for API failures

4. **SEO basics**
   - Page titles and meta descriptions
   - Open Graph tags

5. **Vercel deployment**
   - Configure build settings
   - Set up preview deployments
   - Verify edge functions work in production

**Files to Modify**:

- `src/styles/globals.css` - Add keyframe animations
- `index.html` - Meta tags
- Various components - Responsive tweaks

**New Files to Create**:

- `src/components/ErrorBoundary.tsx`

**Phase Verification**:

- [ ] Site loads in < 3 seconds on 3G
- [ ] No layout shifts during load
- [ ] All features work in production
- [ ] Mobile navigation is usable

**Phase Review Gate**:

- [ ] Run `final-review-completeness` agent
- [ ] Run `principal-code-reviewer` agent
- [ ] Address all critical/high issues before proceeding

---

## Final Deliverable Review

**MANDATORY**: After all phases complete, run both review agents on the ENTIRE deliverable:

1. `final-review-completeness` - Full codebase scan for:
   - Incomplete implementations
   - TODO comments
   - Placeholder values
   - Mock data that should be real
   - Missing error handling

2. `principal-code-reviewer` - Comprehensive quality assessment:
   - Code patterns and consistency
   - TypeScript usage
   - Performance considerations
   - Security (no exposed API keys, XSS prevention)
   - Accessibility basics

---

## Testing Strategy

### Unit Tests (Deferred to Phase 7)

- Band calculation logic
- Grid conversion functions
- Time formatting utilities

### Manual Testing Checklist

- [ ] Dashboard loads with live NOAA data
- [ ] Fallback to demo data when API fails
- [ ] K-index chart displays 24 hours of data
- [ ] Solar flux chart shows 30-day trend
- [ ] Band conditions update based on current indices
- [ ] User can set and save QTH
- [ ] Layout works on iPhone SE (375px)
- [ ] Layout works on iPad (768px)
- [ ] Layout works on desktop (1440px)

---

## Rollback Plan

1. **Git-based rollback**: Each phase will have a commit; revert to previous commit if issues arise
2. **Vercel rollback**: Use Vercel's instant rollback to previous deployment
3. **Feature flags**: Not needed for Phase 1 (no existing production system)

---

## Risks and Mitigations

| Risk                          | Likelihood | Impact | Mitigation                                              |
| ----------------------------- | ---------- | ------ | ------------------------------------------------------- |
| NOAA API changes format       | Low        | High   | Zod validation will catch; demo data fallback           |
| CORS issues in production     | Medium     | High   | Edge functions proxy all requests                       |
| Large bundle size from D3     | Medium     | Medium | Defer D3 to Phase 2; use SVG directly for simple charts |
| Tailwind v4 breaking changes  | Low        | Medium | Pin version; test thoroughly                            |
| File conflicts between agents | Medium     | High   | Clear ownership matrix defined above                    |

---

## Open Questions

1. **Domain name**: Is there a domain for Propulse, or use Vercel's default `*.vercel.app`?
2. **Analytics**: Should we add privacy-respecting analytics (Plausible/Fathom) now or later?
3. **PWA support**: Should we add service worker for offline support in Phase 1?

---

## Technical Decisions

### Why Vercel Edge Functions over API routes?

- Lower latency (runs at edge, closer to users)
- Built-in caching via `Cache-Control` headers
- No cold start penalty for serverless functions
- Simpler deployment (no separate backend needed yet)

### Why not D3.js in Phase 1?

- Simple bar/line charts can be SVG without D3's ~100KB overhead
- D3 adds complexity for basic visualizations
- Will add D3 in Phase 2 when more complex visualizations are needed

### Why Zustand over Redux?

- Much smaller bundle (~1KB vs ~10KB+)
- Simpler API, less boilerplate
- Built-in localStorage persistence middleware
- Sufficient for Phase 1 state management needs

---

**USER: Please review this plan. Edit any section directly, then confirm to proceed with implementation.**
