# Globe Toolbar & Modes Redesign — Brainstorm

> Created: 2026-02-10

## Current State Analysis

### Toolbar: 4 Disconnected Groups

**Group 1 — 8 Layer Toggles + Follow:**
| Button | Store Key | Default | Effect |
|---|---|---|---|
| Day/Night | `terminator` | ON | NightOverlay + Terminator line |
| Greyline | `greyline` | ON | Greyline band + GrayLineZone |
| Aurora | `aurora` | OFF | AuroraOverlay (probability data) |
| MUF | `muf` | OFF | MUFOverlay + MUFLegend |
| Spots | `spots` | ON | LiveSpotArcs (animated DX spot arcs) |
| Lights | `nightLights` | ON | NightLightsOverlay (satellite mode only) |
| Labels | `labels` | OFF | LabelsOverlay + LabelsPanel (sub-toggles) |
| Sats | `satellites` | OFF | SatelliteOverlay + SatellitePanel |
| Follow | `autoPanToSpots` | OFF | Auto-pan camera to new spots |

**Group 2 — Map Style + Region Presets:**

- MapStyleToggle: Satellite vs Standard (grayscale)
- RegionPresetSelector: saved geographic viewpoints

**Group 3 — Style Selector (cryptic icons):**

- Eye/Lightning: Realistic vs High-Viz (only works on 2D flat map, NOT 3D globe)
- Palette/Chart: Spot color by Mode vs Band (works, but icons are indecipherable)

**Group 4 — Mode Presets (layer-only):**
| Preset | Layers ON | Layers OFF |
|---|---|---|
| DX Hunter | terminator, greyline, muf, spots, nightLights | aurora, nvis, labels, satellites |
| Contest | terminator, spots | greyline, aurora, muf, nvis, nightLights, labels, satellites |
| VHF/UHF | terminator, aurora, satellites | greyline, muf, nvis, spots, nightLights, labels |
| Emergency | terminator, greyline, nvis, nightLights, labels | aurora, muf, spots, satellites |

### Broken / Non-functional Controls

1. **Eye/Lightning (visualStyle)** — only affects FlatMapView + BandConditionsPanel, dead on 3D globe
2. **NVIS layer** — component exists (`NVISCoverage3D`), Emergency mode sets `nvis: true`, but never rendered
3. **Sporadic E layer** — component stub exists, no UI toggle, never imported
4. **Observed MUF layer** — component stub exists, no UI toggle, never imported
5. **Auto-rotate** — state exists in mapStore, no UI toggle anywhere
6. **ViewModeToggle** — component exists, unused (PropSphere uses inline tabs)
7. **LiteModeToggle** — superseded by LayoutModeDropdown

---

## Three Operator Personas

### The Novice (Technician, 2 months)

- Overwhelmed by 8 jargon toggles
- Needs smart defaults and "what should I do right now?"
- Wants plain-English explanations
- Progressive disclosure — start simple, reveal complexity

### The Intermediate (General, 2 years)

- Wants customizable modes, not rigid presets
- Needs band-aware filtering tied to their equipment
- Quick-switch between saved configs
- Labels over cryptic icons

### The Veteran Elmer (Extra, 25+ years)

- Maximum information density
- Deep mode configurations that transform entire experience
- All overlays working (NVIS, Sporadic E, observed MUF)
- Contest integration, path loss, SNR predictions

---

## Proposed Architecture

### A. Toolbar Simplification

**Replace 4 groups with 2 sections:**

**Section 1 — "Layers" Popover** (single button → categorized panel):
| Category | Layers |
|---|---|
| Illumination | Day/Night, Greyline, City Lights |
| Propagation | MUF, Aurora, NVIS, Sporadic E |
| Activity | Live Spots, Satellites |
| Reference | Labels/Borders, Maidenhead Grid |

Badge shows on-count. Each toggle gets hover description.

**Section 2 — Quick-access bar** (always visible):

- Map style toggle (Satellite/Standard)
- Spot coloring with text labels ("Color: Mode" / "Color: Band")
- Follow toggle
- Region presets

### B. Operating Profiles (replaces shallow Mode Presets)

Modes transform the **entire operating experience**, not just layer switches.

**DX Hunter Profile:**

- Layers: Greyline + MUF + Spots + Day/Night
- Spot coloring: by Band
- Auto-follow: ON
- DX cluster prominent, path analysis auto-opens on spot click
- Band conditions: filtered to HF
- Spots filtered to: CW + SSB + FT8
- Shack integration: highlight workable spots, dim unreachable

**Contest Profile:**

- Layers: Terminator + Spots (minimal noise)
- Visual style: High-Viz
- Layout: Lite mode auto-enabled
- Contest timer, quick-jump to contest windows
- Band conditions: rate-optimized (most activity right now)
- Shack integration: ERP overlay per band

**VHF/UHF Profile:**

- Layers: Aurora + Sporadic E + Satellites
- Spots filtered to 6m/2m/70cm/23cm
- Satellite panel auto-opens
- Map zoom: regional (500-1500 km)
- Shack integration: antenna pattern overlay

**Emergency/ARES Profile:**

- Layers: NVIS + Greyline + Labels + City Lights
- NVIS coverage ring (0-300 mi based on foF2)
- Band focus: 40m, 60m, 80m
- Spots OFF, regional weather alerts

**Listener/SWL Profile** (new, novice-friendly):

- Layers: Day/Night + Spots + Greyline
- Visual style: Realistic
- Guidance panel: "Bands open right now" in plain English
- Auto-follow ON, verbose tooltips
- Shack integration: "You could hear this" badges

### C. Custom Profiles

- Fork any built-in profile
- Save layer + filter + layout + panel config
- Quick-switch from toolbar
- Sync via Supabase

### D. Wire Up Dead Features

- Remove eye/lightning from globe view OR wire to 3D
- Connect NVISCoverage3D to GlobeView
- Complete Sporadic E stub
- Complete Observed MUF stub
- Add auto-rotate toggle to layers popover

---

---

## Layout Mode Deep Dive

### Pro Mode (FullscreenPropSphere) — Current Problems

**Panel layout is completely static:**

- CSS Grid overlay: `grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr_auto]`
- All panels use hard-coded widths: BandConditions `w-64`, PathAnalysis `w-72`, Recommendations `w-80`
- DXSpotList fixed at `h-[180px]` with `maxHeight="148px"` — can't be expanded
- Zero drag handles, zero resize handles, zero docking mechanisms
- No react-dnd, react-grid-layout, react-resizable, or react-rnd installed
- Only interaction: show/hide chevron toggles (collapse to tiny button)

**MapSizeSliders occlusion:**

- Button at `absolute bottom-3 left-3 z-10` inside each map view
- In Pro mode: overlay grid at `z-[200]` sits above; `pointer-events-auto` panels (Recommendations, DX Spots) cover it
- In Lite mode: BandConditionsPanel at `absolute bottom-3 left-3 pointer-events-auto` directly covers it

**Existing infrastructure (unused):**

- `DraggablePanel` component exists — used only on SolarPulse page, not PropSphere
- `layoutManager.ts` exists with panel layout types + 3 presets — not wired into PropSphere
- Panel collapse states in Pro mode are local `useState` — reset on every mode entry

### Lite Mode — Current State (Good Foundation)

- Hides: top row cards, left/right panels, DX console, news ticker
- HUD overlay: LayoutModeDropdown, compact time, callsign badge, S-meter
- Bottom-left: BandConditionsPanel (collapsible)
- Bottom-right: PathAnalysis (collapsible)
- Layer controls bar remains fully accessible
- Keyboard shortcuts remain active
- Good conceptual model — just needs new toolbar/profile system integrated

### HamClock View — Sizing Problem

**The map only covers ~47% of screen at 1920×1080:**

- Root: `fixed inset-0`, CSS Grid with `gridTemplateColumns: "260px 1fr 260px"`
- Fixed 260px sidebars eat 520px horizontal, fixed 48px header
- Available for map at 1920×1080: 1400px × 1032px
- FlatMapView enforces strict **2:1 aspect ratio** (equirectangular projection): `width = Math.min(containerWidth, containerHeight * 2)`
- Result: 1400 × 700px map with 332px vertical dead space

**Missing features vs real HamClock:**

- No sidebar collapse/hide mechanism
- No responsive breakpoints or media queries
- No way to overlay data panels on the map surface
- No toolbar/layer controls at all

**Fix approach:** Overlay data panels on the map (like Pro mode does) instead of using sidebars. Map fills viewport, glass panels float on top. Sidebars become collapsible overlays.

---

## Supabase Spot History — Untapped Data

### Available Tables (frontend queries ZERO of these today)

**`spot_history`** — 30-day rolling, ~7-9M rows/day:

- Columns: source, spotted_at, tx/rx_callsign, tx/rx_grid, tx/rx_lat/lon, frequency_khz, band, mode, snr, wpm, dxcc, continent
- RLS: public read enabled (anon key works)
- Indexes: dedup, spotted_at DESC, band+time, source+time, tx_callsign+time

**`band_hourly_stats`** — preserved forever, ~288 rows/day:

- Columns: hour_utc, band, spot_count, unique_tx/rx, avg/min/max/median_snr, mode_counts (JSONB), source_counts (JSONB), unique_grids_tx/rx, kp_index, sfi, bz_gsm, bt
- One row per band per hour. Perfect for trend charts.

**`solar_snapshots`** — 90-day rolling:

- Columns: captured_at, kp_index, sfi, bz_gsm, by_gsm, bt, solar_wind_speed, sunspot_number

**`band_region_stats`** — NOT YET CREATED (planned Level 1 of location-aware model)

### Features This Data Could Power

1. **"Time Machine Replay"** — Show what spots looked like at any point in the last 30 days. Query `spot_history` for a time window, render arcs on the map exactly like live spots.

2. **Band Activity Sparklines** — 24h or 7-day trend mini-charts per band. Query `band_hourly_stats`. Show in BandConditionsPanel or as overlays on the toolbar.

3. **Propagation Heatmap** — 10-band × 24-hour matrix colored by spot_count or avg_snr. "When is 20m best?" answered visually.

4. **Historical Comparison** — "Right now vs same time yesterday/last week." Side-by-side or overlay spot counts.

5. **Activity Density Map** — Group spots by tx_grid prefix, render as heat overlay on the globe. "Where is 20m activity concentrated?"

6. **Solar Correlation Charts** — Plot band activity vs SFI/Kp over time. "Does high SFI really help 10m?"

7. **Personal Spot Analytics** — If user enters callsign, query their TX/RX history: bands worked, time patterns, geographic reach.

8. **Region-Aware Band Recommendations** — Once `band_region_stats` exists: "Based on your grid, 20m peaks at 1400Z and 40m at 0200Z."

---

## Implementation Plan

### Phase 1: Toolbar & Controls Cleanup

**Goal**: Cohesive, understandable toolbar. Remove dead controls, consolidate layers.

1. **LayersPopover component** — Single "Layers" button opens categorized popover:
   - Illumination: Day/Night, Greyline, City Lights
   - Propagation: MUF, Aurora (+ NVIS, Sporadic E once wired)
   - Activity: Live Spots, Satellites, Follow
   - Reference: Labels/Borders, Maidenhead Grid, Auto-rotate
   - Badge showing active count on the button
   - Each toggle: icon + label + one-line description tooltip

2. **Replace StyleSelector** — Remove eye/lightning/palette/chart icon buttons:
   - Spot coloring: text toggle "Color: Mode ↔ Band" (clear label)
   - Visual style: move to Layers popover as "High Contrast" toggle under a "Display" category
   - Or: remove visual style toggle from globe view entirely until it's wired to 3D

3. **Clean quick-access bar** — Keep visible: Map Style, Spot Color toggle, Region Presets

4. **Fix MapSizeSliders occlusion** — Move to different position or into Layers popover as sliders

### Phase 2: Operating Profiles (Deep Modes)

**Goal**: Modes transform the full experience, not just layers.

1. **Extend mapStore `OperatingProfile` type**:

   ```
   { layers, spotColorMode, visualStyle, layoutMode, spotFilters: { bands, modes },
     panelConfig: { bandConditions, pathAnalysis, dxCluster, satellites },
     autoFollow, mapStyle, defaultZoom }
   ```

2. **5 built-in profiles**: DX Hunter, Contest, VHF/UHF, Emergency, Listener/SWL

3. **Profile applies on selection**: bulk-set all config, switch layout if needed, filter spots

4. **Profile indicator**: active profile shown in toolbar with colored accent

5. **Custom profiles**: fork built-in → tweak → save with custom name

### Phase 3: Pro Mode — Movable/Resizable Panels

**Goal**: Full control over panel layout for power users.

1. **Install `react-grid-layout`** (or build lightweight drag/resize with pointer events)

2. **Panel system**: each panel gets drag handle + resize handle + dock zones
   - DXSpotList: resizable height (180px → full-height), can dock top/bottom/left/right
   - PathAnalysis: draggable to any corner, resizable
   - BandConditions: draggable, resizable
   - Recommendations: draggable
   - MapSizeSliders: integrate into panel system (no more occlusion)

3. **Layout persistence**: save panel positions/sizes to mapStore, persist to localStorage

4. **Layout presets**: wire up existing `layoutManager.ts` infrastructure

5. **Panel z-index management**: active panel comes to front

### Phase 4: HamClock — Full-Screen Map

**Goal**: Map fills viewport, data overlays float on glass panels.

1. **Remove fixed sidebars** — replace with glass overlay panels like Pro mode:
   - DE Station info: top-left glass pill
   - DX Target: top-right glass pill
   - UTC clock: center-top
   - Band Conditions: bottom-right collapsible
   - DX Spot Feed: bottom-center collapsible
   - Solar data: header bar pills (keep current approach)

2. **Map fills `1fr` of full grid** — `gridTemplateColumns: "1fr"` (no sidebars)

3. **Add minimal layer controls** — small floating toolbar or gear icon → popover

4. **Responsive panels** — auto-collapse to icons on smaller screens

### Phase 5: Supabase Historical Data Integration

**Goal**: Leverage 30-day spot history + hourly stats for richer views.

1. **API layer**: TanStack Query hooks for `band_hourly_stats` and `spot_history`
   - `useBandHourlyStats(band, days)` — sparkline/trend data
   - `useSpotHistory(timeRange, filters)` — historical spot replay
   - `usePropagationHeatmap(days)` — band × hour matrix

2. **Band Activity Sparklines** — mini charts in BandConditionsPanel showing 24h trend per band

3. **Time Machine Enhancement** — when time offset is set, optionally show historical spots from Supabase instead of just shifting the terminator. "What was actually on the air at this time?"

4. **Propagation Heatmap Panel** — new floating panel: 10-band × 24-hour color matrix. Click a cell to time-travel to that band/hour.

5. **Activity Density Overlay** — globe heatmap layer showing spot concentration by grid region

### Phase 6: Profile-Aware Features

**Goal**: Each profile leverages historical data differently.

1. **DX Hunter**: "Hot bands right now" based on last-hour band_hourly_stats vs 7-day average
2. **Contest**: rate graph (spots/hour) live from spot_history, band-switching suggestions
3. **VHF/UHF**: sporadic E detection from sudden 6m/2m activity spikes in spot_history
4. **Listener/SWL**: "Best bands for listening right now" with plain-English explanations powered by real data
5. **All profiles**: "Compared to this time yesterday" indicator on each band

---

## Priority Sequence

1. **Phase 1**: Toolbar cleanup — layers popover, label cryptic icons, remove dead controls
2. **Phase 2**: Operating profiles — deep modes that transform the full experience
3. **Phase 3**: Pro mode panels — movable, resizable, dockable
4. **Phase 4**: HamClock full-screen map — glass overlay panels
5. **Phase 5**: Supabase data integration — sparklines, heatmaps, historical replay
6. **Phase 6**: Profile-aware historical features
