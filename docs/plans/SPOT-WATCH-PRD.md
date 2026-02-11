# Spot Watch — Product Requirements Document

## Vision

Transform the current auto-follow toggle and watch system into a unified **Spot Watch** engine that filters the live spot stream by operator-defined criteria, highlights matching spots across all map views, rate-limits camera tracking, and (for subscribers) enables historical spot replay via the Supabase collector database.

The system serves four distinct user personas with the same underlying filter pipeline, adapting its presentation per view mode (Globe, Flat, Pro, Lite, HamClock).

---

## Personas & User Stories

### P1 — The Elmer (Veteran DXer)

> "I want to track a DXpedition without staring at a cluster feed all day."

**US-1.1**: As a veteran operator, I can type a callsign (e.g., `3Y0J`) into the Watch filter so that only spots for that station are highlighted on the map and the globe gently pans to each new match.

**Acceptance Criteria:**

- Text input accepts full or partial callsign with optional wildcard (`*`)
- Matching spots render with full-brightness arcs; non-matching spots dim to 30% opacity
- Globe/flat map pans to each match when match rate is < 1 per 5 seconds
- Pan animation uses ease-out cubic over 800ms, does not interrupt manual user interaction
- Match count badge updates in real-time on the Watch toolbar button
- Clicking a highlighted arc sets it as the path analysis target

**US-1.2**: As a veteran operator, I can combine callsign + band (e.g., `3Y0J` on 17m) to narrow the watch further.

**Acceptance Criteria:**

- Band selector dropdown in Watch popover, defaults to "All"
- Combined filters use AND logic
- When band is specified, only matches on that band trigger panning

---

### P2 — The Newcomer

> "I just got licensed and don't know what bands are open or who I could work."

**US-2.1**: As a new operator, I can tap "Watch My Grid" and immediately see spots involving my Maidenhead grid highlighted on the map, teaching me which bands are open to/from my area.

**Acceptance Criteria:**

- "Watch My Grid" preset pre-fills the grid prefix from the user's profile (2 or 4 char)
- Direction defaults to "Either" (TX from or RX at my grid)
- Works even without bridge connection (filters live spots from PSKReporter/RBN)
- When a match appears, the Maidenhead grid square on the globe briefly glows (pulse animation)

**US-2.2**: As a new operator, I can click any highlighted arc to see path details (distance, bearing, hops, predicted SNR) and understand what the spot means.

**Acceptance Criteria:**

- Clicking a watch-matched arc opens the existing spot details flyout
- Flyout includes "Set as Target" action for full path analysis
- Path difficulty badge (easy/moderate/challenging/extreme) is visible

---

### P3 — The Contester

> "During CQWW, I need to see new multipliers instantly without scanning the full cluster."

**US-3.1**: As a contester, I can set a band watch that highlights all spots on my current operating band, helping me spot new stations without leaving frequency.

**Acceptance Criteria:**

- Band-only watch works across all spot sources
- Spot list (DXSpotList) pins watch-matched spots at the top, highlighted
- When combined with Contest operating profile, auto-configures relevant band filters

**US-3.2**: As a contester, I can filter by continent or CQ zone to find needed multipliers.

**Acceptance Criteria:**

- Continent filter dropdown (AF, AN, AS, EU, NA, OC, SA)
- CQ zone numeric input (1-40)
- Both apply as additional AND criteria on the watch

**US-3.3**: As a contester in Pro mode, I can hide all panels and watch spots land on a slowly rotating globe as an ambient contest dashboard.

**Acceptance Criteria:**

- "Hide All Panels" button in Pro mode toolbar collapses all floating panels
- Combined with auto-rotate + band watch, creates a focused ambient display
- Spot count and watch match count remain visible as a minimal overlay pill

---

### P4 — The Casual Explorer

> "I want to watch the world light up — it's like air traffic radar for ham radio."

**US-4.1**: As a casual explorer, I can set a grid prefix watch (e.g., `JA` for Japan) and watch arcs fan out from that region in real-time.

**Acceptance Criteria:**

- 2-character grid prefix watch produces a moderate match rate (50-200/min)
- At high match rates, auto-pan disables and watch becomes visual-only (highlight + count)
- The watching experience remains smooth at 60fps

**US-4.2**: As a casual explorer, when spots land in a Maidenhead grid, I want the grid square to briefly glow on the globe, creating a "heat pulse" effect.

**Acceptance Criteria:**

- Grid glow applies to the 2-character Maidenhead field containing the spot's TX location
- Glow is a brief pulse (800ms rise, 1200ms fade) with the spot's color mode color
- Multiple simultaneous pulses in the same grid combine additively (brighter, not reset)
- Glow effect works on both Globe and Flat Map views
- Glow is performance-safe: max 20 active glows at once, oldest evicted first

**US-4.3**: As a casual explorer, I can adjust a "Density" slider to control how many arcs are visible at once.

**Acceptance Criteria:**

- Slider range: 10 to 200 arcs (current hardcoded max is 50)
- Slider lives in the Watch popover under "Display" section
- Higher density = more arcs visible, regardless of watch filter
- Lower density = only the most recent arcs shown
- Default: 50 (current behavior)

---

### P5 — The Subscriber (Premium)

> "I want to replay yesterday's contest and see exactly how propagation shifted."

**US-5.1**: As a subscriber, I can activate "Spot Replay" in the time machine to play back historical spots from the Supabase `spot_history` table.

**Acceptance Criteria:**

- When time machine is set to a past time, a "Replay Spots" toggle appears
- When enabled, queries `spot_history` for a sliding 15-minute window around `displayTime`
- Replay spots render as arcs with a sepia/muted tone to distinguish from live spots
- Playback respects the time machine's play speed (1x to 10x)
- Watch filters apply to replay spots identically to live spots
- Requires `isSubscribed` flag (from auth/profile store) — disabled with upgrade prompt otherwise

**US-5.2**: As a subscriber, I can replay a specific date range and watch band openings emerge and fade over hours.

**Acceptance Criteria:**

- Date range picker in time machine (start date + duration)
- Replay loops continuously within the range
- Activity density overlay (grid heat map) updates with replay data
- Works across Globe, Flat Map, and HamClock views

---

## Architecture

### Data Flow

```
                              ┌─────────────────────────────┐
                              │      Watch Filter Engine     │
                              │  (watchStore v2 — unified)   │
                              │                              │
                              │  criteria: {                 │
                              │    callsign?, gridPrefix?,   │
                              │    txOrRx?, band?, mode?,    │
                              │    continent?, cqZone?       │
                              │  }                           │
                              │                              │
                              │  Outputs:                    │
                              │  - matchedSpotIds: Set       │
                              │  - matchCount: number        │
                              │  - matchRate: matches/sec    │
                              │  - recentMatches: DXSpot[]   │
                              └──────────┬──────────────────┘
                                         │
              ┌──────────────────────────┼───────────────────────────┐
              │                          │                           │
              ▼                          ▼                           ▼
    ┌─────────────────┐      ┌─────────────────────┐    ┌───────────────────┐
    │  Map Rendering   │      │   Camera Control     │    │   DX Spot List    │
    │                  │      │                      │    │                   │
    │ - Arc brightness │      │ - Rate-limited pan   │    │ - Pin matches     │
    │ - Grid glow      │      │ - Graceful degrade   │    │ - Filter banner   │
    │ - Match pulse    │      │ - Orbit integration  │    │ - Match counter   │
    └─────────────────┘      └─────────────────────┘    └───────────────────┘
```

### Spot Pipeline Unification

The current codebase has **two separate spot pipelines** that the Watch system must bridge:

| Pipeline   | Source                     | Used By                                        | Watch Integration                            |
| ---------- | -------------------------- | ---------------------------------------------- | -------------------------------------------- |
| DX Cluster | Bridge WS + REST proxy     | `dxStore`, `DXSpotList`, existing `watchStore` | Already wired — `checkForActivity(allSpots)` |
| Live Spots | PSKReporter + RBN + WSJT-X | `LiveSpotArcs`, `FlatMapView` canvas           | **Not wired** — needs integration            |

**Decision**: The Watch filter runs against **both** pipelines. The matching function is the same; only the source differs. Each pipeline feeds matches into the unified `watchStore.matches` array with a `source` tag.

### Store Dependencies

```
watchStore v2 (new)
  ├── reads: profileStore.grid (for "My Grid" preset)
  ├── reads: mapStore.spotFilters (inherits profile band/mode filters)
  ├── writes: watchStore.matches, matchRate, matchCount
  │
  ├── consumed by: LiveSpotArcs (opacity + glow)
  ├── consumed by: DXSpotList (pin + highlight)
  ├── consumed by: CameraController (rate-limited pan)
  ├── consumed by: GridGlowOverlay (pulse effect)
  ├── consumed by: WatchPopover (UI state)
  └── consumed by: WatchStatusPill (match count, rate)

mapStore (existing)
  ├── modified: remove autoPanToSpots (replaced by watchStore.autoPan)
  └── modified: add displayDensity (arc count slider)

Supabase (for replay)
  ├── spot_history table (30-day rolling, ~7-9M rows/day)
  └── useSpotReplay hook (new, TanStack Query)
```

### New Files

| File                                     | Purpose                              | Phase |
| ---------------------------------------- | ------------------------------------ | ----- |
| `src/stores/watchStore.ts`               | Rewrite v2 — unified filter engine   | 1     |
| `src/components/map/WatchPopover.tsx`    | Toolbar popover for Watch controls   | 1     |
| `src/components/map/WatchStatusPill.tsx` | Floating match status pill           | 1     |
| `src/components/map/GridGlowOverlay.tsx` | 3D Maidenhead grid pulse overlay     | 2     |
| `src/components/map/GridGlowCanvas.tsx`  | 2D canvas grid pulse for FlatMapView | 2     |
| `src/hooks/useSpotReplay.ts`             | TanStack Query hook for spot_history | 3     |
| `src/components/map/ReplayIndicator.tsx` | Visual indicator for replay mode     | 3     |

### Modified Files

| File                                          | Changes                                                                        | Phase |
| --------------------------------------------- | ------------------------------------------------------------------------------ | ----- |
| `src/components/map/GlobeView.tsx`            | Wire watch into CameraController, add GridGlowOverlay, remove old watch wiring | 1, 2  |
| `src/components/map/FlatMapView.tsx`          | Wire watch filter to canvas arcs, add GridGlowCanvas, remove old watch wiring  | 1, 2  |
| `src/components/map/LiveSpotArcs.tsx`         | Read watchStore for arc brightness, match pulse animation                      | 1     |
| `src/components/dx/DXSpotList/DXSpotList.tsx` | Pin matched spots, highlight rows, watch filter banner                         | 1     |
| `src/components/map/FullscreenPropSphere.tsx` | Add WatchPopover to toolbar, "Hide All Panels" button, WatchStatusPill         | 1     |
| `src/components/map/HamClockView.tsx`         | Add WatchStatusPill to header, watch filter on DX feed                         | 1     |
| `src/pages/PropSphere.tsx`                    | Add WatchPopover to main toolbar                                               | 1     |
| `src/components/map/TimeControl.tsx`          | Add "Replay Spots" toggle when time is in the past                             | 3     |
| `src/stores/mapStore.ts`                      | Replace `autoPanToSpots` with `displayDensity`, cleanup                        | 1     |
| `src/components/map/LayersPopover.tsx`        | Replace Auto-Follow toggle with link to Watch popover, add density slider      | 1     |
| `src/components/map/WatchListPanel.tsx`       | Deprecate (functionality moves to WatchPopover)                                | 1     |
| `src/components/map/WatchIndicator.tsx`       | Deprecate (replaced by WatchStatusPill)                                        | 1     |

---

## Phase 1 — Watch Filter Engine + UI (Foundation)

### 1A — watchStore v2 (Rewrite)

**Depends on**: Nothing (standalone store)
**Can parallelize with**: 1C (WatchPopover UI)

Rewrite `watchStore.ts` to support unified filter criteria:

```typescript
interface WatchCriteria {
  callsign?: string; // exact or prefix, supports * wildcard
  gridPrefix?: string; // 2, 4, or 6 char Maidenhead
  txOrRx: "tx" | "rx" | "either"; // which end to match
  band?: string; // "20m", "10m", etc.
  mode?: string; // "FT8", "CW", etc.
  continent?: string; // "NA", "EU", etc.
  cqZone?: number; // 1-40
}

interface WatchState {
  // Persisted
  criteria: WatchCriteria | null; // single active watch (MVP)
  autoPan: boolean; // pan camera to matches
  savedWatches: SavedWatch[]; // saved presets (max 20)

  // Runtime
  enabled: boolean;
  matchedSpotIds: Set<string>;
  recentMatches: MatchedSpot[]; // last 50 matches
  matchCount: number; // total since enabled
  matchRate: number; // matches per second (rolling 30s window)
  lastMatchTime: number | null;
  seenSpotIds: Set<string>; // dedup

  // Actions
  setWatch(criteria: WatchCriteria): void;
  clearWatch(): void;
  toggleAutoPan(): void;
  saveWatch(name: string): void;
  loadWatch(id: string): void;
  deleteWatch(id: string): void;
  checkSpots(spots: DXSpot[]): MatchedSpot[];
  checkLiveSpots(spots: LiveSpot[]): MatchedSpot[];
  resetSession(): void;
}
```

**Match rate calculation**: Rolling window of match timestamps over last 30 seconds. Updated on each `checkSpots` call. Used by camera controller to decide pan behavior.

**Performance**: `checkSpots` is called on every spot batch (~every 2-3 seconds). Matching logic must be O(n) where n = batch size. Pre-compile callsign regex on `setWatch`, not per-spot.

**Migration**: Migrate existing `watches[]` and `matches[]` from v1 to `savedWatches[]` in v2. Preserve localStorage key `"propulse-watches"` with version bump.

### 1B — Camera Pan Integration

**Depends on**: 1A (watchStore v2)
**Can parallelize with**: 1C (WatchPopover)

Wire `watchStore.matchRate` into `CameraController` in `GlobeView.tsx`:

```
matchRate < 0.2/sec (< 1 per 5s)  → Pan to each match, 800ms ease-out cubic
matchRate 0.2-2/sec               → Pan to most recent match only, debounced 5s
matchRate > 2/sec                 → No panning, highlight only
```

Pan implementation:

- Read `watchStore.recentMatches` in CameraController
- When a new match appears and pan is viable, call `latLonToCameraPosition(lat, lon, currentDistance)` and animate
- If user is actively dragging (OrbitControls `isDragging`), suppress pan for 10 seconds
- If auto-rotate is active, pan overrides rotation temporarily, then rotation resumes

For FlatMapView: pan the canvas viewport center to the matched spot's projected position using the existing viewport animation system.

### 1C — WatchPopover (Toolbar UI)

**Depends on**: 1A (store types only — can stub store for UI dev)
**Can parallelize with**: 1B (Camera Pan)

New popover matching LayersPopover design language (`bg-void-black/90 backdrop-blur-md border border-white/10 rounded-xl shadow-xl`).

**Layout:**

```
┌──────────────────────────────────┐
│ QUICK START                      │
│ ┌──────────┐ ┌──────────┐       │
│ │ My Grid  │ │ Callsign │       │
│ └──────────┘ └──────────┘       │
│ ┌──────────┐                    │
│ │ Band     │                    │
│ └──────────┘                    │
│                                  │
│ ─────────────────────────────── │
│ FILTER                          │
│ Callsign  [_________________]  │
│ Grid      [____]  (•) TX (•) RX│
│ Band      [All        ▾]       │
│ Mode      [All        ▾]       │
│ Continent [All        ▾]       │
│                                  │
│ ─────────────────────────────── │
│ OPTIONS                         │
│ Auto-pan       [====●]         │
│ Arc density    [==●====] 50    │
│                                  │
│ ─────────────────────────────── │
│ SAVED WATCHES                   │
│ 📡 DXpedition 3Y0J        [✕] │
│ 📍 My Grid EM73           [✕] │
│ 📻 20m FT8                [✕] │
│ + Save Current Watch            │
│ ─────────────────────────────── │
│       [● Clear Watch]          │
└──────────────────────────────────┘
```

**Quick Start buttons**: One-tap presets. "My Grid" pre-fills grid from `profileStore`, "Callsign" focuses the text input, "Band" opens the band dropdown.

**Trigger button**: Shows active watch state:

- Inactive: `Watch` (gray text)
- Active: `Watch · EM73` (white text + signal-green dot)
- Active with matches: `Watch · EM73 · 12` (white text + animated pulse + count badge)

### 1D — Spot List Integration

**Depends on**: 1A (watchStore v2)
**Can parallelize with**: 1B, 1C

Modify `DXSpotList.tsx`:

- When watch is active, matched spots pin to top of list with highlight background (signal-green/10 bg, left accent bar)
- Non-matched spots render normally below (not hidden — context is valuable)
- Filter banner: `Watching: EM73 · 12 matches` with clear button
- Keyboard shortcut `W` on a selected spot creates a callsign watch for that station

### 1E — Arc Rendering Integration

**Depends on**: 1A (watchStore v2)
**Can parallelize with**: 1B, 1C, 1D

Modify `LiveSpotArcs.tsx` (Globe) and `FlatMapView.tsx` (2D canvas):

- Matched spots: full opacity + slight scale-up (1.2x dot size) + brief pulse animation on arrival
- Non-matched spots when watch is active: 30% opacity (dimmed, still visible)
- Non-matched spots when no watch: normal rendering (no change from current behavior)
- Both pipelines (DX Cluster + Live Spots) feed into `watchStore.checkSpots`/`checkLiveSpots`

### 1F — WatchStatusPill (Cross-View)

**Depends on**: 1A (watchStore v2)
**Can parallelize with**: All others

Small floating pill showing active watch status. Used in:

- Pro mode toolbar area
- HamClock header
- Lite mode toolbar
- Normal mode (positioned near Watch popover button)

Content: `📡 EM73 · 20m — 12 matches · 0.3/sec`

Visual states:

- Idle (no watch): hidden
- Active, no recent matches: `text-white/50`, static
- Active, recent match (< 10s ago): `text-signal-green`, subtle pulse
- Active, high rate (> 2/sec): `text-caution-amber`, count badge flashing

### 1G — LayersPopover Cleanup

**Depends on**: 1A, 1C
**Can parallelize with**: 1B, 1D, 1E, 1F

- Remove "Auto-Follow" toggle from LayersPopover (replaced by Watch auto-pan)
- Add "Arc Density" slider (10-200 range, replaces hardcoded `maxArcs=50` in LiveSpotArcs)
- Remove `autoPanToSpots` from `mapStore.ts` (replaced by `watchStore.autoPan`)
- Add `displayDensity: number` to mapStore or settingsStore (persisted)

### 1H — Deprecate Old Watch UI

**Depends on**: 1A, 1C, 1D, 1F
**Sequenced after**: All Phase 1 components are working

- Remove `WatchListPanel.tsx` (slide-in panel — was a UX violation anyway)
- Remove `WatchIndicator.tsx` (replaced by WatchStatusPill)
- Clean up old watch wiring in `GlobeView.tsx` and `FlatMapView.tsx`
- Keep `useWatchAlerts.ts` if audio alert system is desired (can wire to watchStore v2)

---

### Phase 1 Parallel Execution Plan

```
                    1A (watchStore v2)
                   /     |      \    \
                  /      |       \    \
                1B      1C      1D    1F
              (Camera) (Popover)(List)(Pill)
                  \      |       /
                   \     |      /
                    1E (Arc Rendering)
                         |
                    1G (Layers Cleanup)
                         |
                    1H (Deprecation)
```

**Wave 1** (parallel): 1A (store) — all other tasks depend on types
**Wave 2** (parallel): 1B + 1C + 1D + 1F — independent UI integration points
**Wave 3** (parallel): 1E (depends on 1A for match state) + 1G (depends on 1A + 1C)
**Wave 4** (sequential): 1H (cleanup after everything works)

**Agent assignment for Wave 2** (no file conflicts):

- Agent A: `GlobeView.tsx` CameraController changes (1B)
- Agent B: `WatchPopover.tsx` new file (1C)
- Agent C: `DXSpotList.tsx` modifications (1D)
- Agent D: `WatchStatusPill.tsx` new file (1F)

---

## Phase 2 — Grid Glow + Visual Polish

### 2A — GridGlowOverlay (3D Globe)

**Depends on**: Phase 1 complete
**Can parallelize with**: 2B

New Three.js overlay for the globe view. Renders translucent Maidenhead grid field rectangles that pulse when spots land in them.

**Implementation:**

- Geometry: Flat quad meshes projected onto the sphere surface at r=1.003 (between greyline and labels)
- One mesh per active grid field (2-char Maidenhead = 20° longitude × 10° latitude)
- Material: `ShaderMaterial` with uniform for pulse intensity (0.0 → 1.0 → 0.0)
- Color: Derived from spot's color mode (band color, mode color, etc.)
- Animation: 800ms rise (ease-out), 1200ms fade (ease-in), total 2 seconds per pulse
- Pool: Max 20 active glows. When pool is full, recycle oldest completed glow. If a glow fires on a grid that's already glowing, increase peak intensity (additive, max 1.0)

**Performance safeguards:**

- Geometry pooled and reused (don't create/destroy meshes per pulse)
- Shader uniforms updated in `useFrame`, no React state involved during animation
- Grid field boundaries pre-computed (324 possible 2-char fields, lookup table)

### 2B — GridGlowCanvas (2D Flat Map)

**Depends on**: Phase 1 complete
**Can parallelize with**: 2A

Canvas-based grid glow for FlatMapView. Same visual concept, adapted for 2D.

**Implementation:**

- Draw semi-transparent rectangles on the canvas at Maidenhead field boundaries
- Use `globalCompositeOperation: "lighter"` for additive blending
- Same animation timing as 3D (800ms rise, 1200ms fade)
- Same pool limit (max 20 active glows)
- Grid boundaries in pixel coordinates from lat/lon projection

### 2C — Ambient Mode Polish

**Depends on**: Phase 1, 2A
**Can parallelize with**: 2B

For the "screensaver on a big TV" use case:

- Pro mode: "Hide All Panels" button in toolbar (collapses all floating panels, hides toolbar after 3s idle, shows on mouse move)
- When all panels hidden + auto-rotate on + watch active: minimal overlay with just clock + watch status pill + match count
- Cursor hides after 5s of no mouse movement
- Fade in/out toolbar on mouse move (300ms transition)

### 2D — Density Slider Polish

**Depends on**: Phase 1 (1G)

- Wire `displayDensity` into `LiveSpotArcs` `maxArcs` prop
- Wire into `FlatMapView` spot limit (currently hardcoded to 50)
- Show current count vs max in the slider label: `Arcs: 23/50`
- When watch is active, matched spots are never culled by density limit (they always render). Density limit applies to non-matched spots only.

---

### Phase 2 Parallel Execution Plan

```
    2A (GridGlow 3D)    2B (GridGlow 2D)
         \                  /
          \                /
           2C (Ambient Mode)
                |
           2D (Density Slider)
```

**Wave 1** (parallel): 2A + 2B (separate files, separate rendering systems)
**Wave 2** (parallel): 2C + 2D (independent features)

**Agent assignment:**

- Agent A: `GridGlowOverlay.tsx` (Three.js shader work)
- Agent B: `GridGlowCanvas.tsx` (Canvas 2D work)

---

## Phase 3 — Spot Replay (Premium)

### 3A — useSpotReplay Hook

**Depends on**: Phase 1 complete, Supabase `spot_history` table exists
**Can parallelize with**: 3B

TanStack Query hook that queries `spot_history` for historical spots.

```typescript
interface SpotReplayOptions {
  centerTime: Date; // center of the query window
  windowMinutes: number; // default 15
  band?: string;
  mode?: string;
  gridPrefix?: string;
  limit: number; // default 200
  enabled: boolean;
}

function useSpotReplay(options: SpotReplayOptions): {
  spots: SpotHistoryEntry[];
  isLoading: boolean;
  error: Error | null;
};
```

**Query:**

```sql
SELECT * FROM spot_history
WHERE spotted_at >= centerTime - window/2
  AND spotted_at <= centerTime + window/2
  [AND band = ?]
  [AND mode = ?]
  [AND (SUBSTRING(tx_grid, 1, 2) = ? OR SUBSTRING(rx_grid, 1, 2) = ?)]
ORDER BY spotted_at ASC
LIMIT 200
```

**Rate limiting:** Max 1 query per 2 seconds (debounced as `displayTime` changes during playback).

**Subscription gate:** Hook checks `authStore.subscription.tier` — returns empty if not subscribed. UI shows upgrade prompt.

### 3B — Replay Rendering

**Depends on**: 3A
**Can parallelize with**: 3C

- When replay is active, render historical spots as arcs alongside (or instead of) live spots
- Replay arcs use a distinct visual treatment: sepia-toned, slightly translucent (60% opacity), with a subtle shimmer effect to distinguish from live
- Replay arcs respect the watch filter — matched replay spots highlight, non-matched dim
- Arc lifetime: each spot visible for `windowMinutes` duration, then fades out

**Integration with TimeControl playback:**

- Time machine play speed (1x-10x) controls how fast `displayTime` advances
- `useSpotReplay` re-queries as `displayTime` changes (debounced)
- Smooth spot appearance: interpolate spot timestamps against current `displayTime`

### 3C — Replay UI

**Depends on**: 3A
**Can parallelize with**: 3B

- "Replay Spots" toggle in TimeControl, visible only when `displayTime` is in the past
- Replay indicator overlay: `REPLAY · Feb 9, 2026 14:00 UTC · 3x` with timeline scrubber
- Date range selector for continuous loop replay
- Subscription gate: non-subscribers see the toggle grayed out with "Upgrade to unlock historical replay" tooltip

### 3D — Subscription Model Integration

**Depends on**: Auth system (existing `authStore`)

- Add `subscription: { tier: "free" | "pro", expiresAt?: string }` to `authStore` or `profileStore`
- Supabase RLS policy: `spot_history` SELECT requires authenticated user with `pro` tier
- Edge function: `/api/subscription/verify` validates subscription status
- Gated features: Spot Replay, extended history range (30 days vs 7 days for free)

---

### Phase 3 Parallel Execution Plan

```
    3A (useSpotReplay)    3D (Subscription Model)
         |                     |
    3B (Replay Rendering)     |
         |                   /
    3C (Replay UI) ─────────
```

**Wave 1** (parallel): 3A (hook) + 3D (subscription model)
**Wave 2** (parallel): 3B (rendering) + 3C (UI)

---

## Phase 4 — Contest Integration (Future)

> Not in initial scope. Documented for architectural awareness.

### 4A — Contest-Aware Watch Presets

When Contest operating profile is active, auto-suggest watches based on contest type:

- CQWW: Watch for new CQ zones per band
- ARRL DX: Watch for new states/provinces per band
- Field Day: Watch for new ARRL sections

### 4B — Multiplier Detection

Cross-reference incoming spots against a "worked" log:

- Import ADIF log or integrate with WSJT-X/N1MM logger
- Watch filter mode: "Needed Only" — only highlight spots for entities not yet logged
- Band-slot tracking: "Need JA on 15m CW" granularity

### 4C — Rate Analytics

- Live QSO rate graph (based on contest spot activity for your callsign or grid)
- Band-switching suggestions: "20m watch rate dropping, 15m rate rising — consider QSY"
- Historical rate comparison (requires Phase 3 replay data)

---

## Performance Budget

| Metric                      | Target      | Notes                                    |
| --------------------------- | ----------- | ---------------------------------------- |
| `checkSpots()` per call     | < 2ms       | Batch of 50 spots against 1 watch filter |
| Match rate calculation      | < 0.5ms     | Rolling window array slice               |
| Grid glow render            | < 1ms/frame | 20 active glows, pooled geometry         |
| Camera pan (when triggered) | 60fps       | Ease-out cubic, 800ms duration           |
| Replay query                | < 500ms     | Supabase indexed query, 200 row limit    |
| Memory (watch state)        | < 1MB       | 50 recent matches + 20 saved watches     |
| Arc density at max (200)    | 60fps       | Instanced rendering if needed            |

### Rate-Limiting Summary

| What                   | Limit                | Why                     |
| ---------------------- | -------------------- | ----------------------- |
| Auto-pan frequency     | Max 1 per 5 seconds  | Prevent motion sickness |
| Grid glow pool         | Max 20 active        | GPU fill rate           |
| Replay query frequency | Max 1 per 2 seconds  | Supabase rate limits    |
| Watch criteria change  | 500ms debounce       | Re-filter cost          |
| Match sound alert      | Max 1 per 10 seconds | Not annoying            |

---

## Cross-View Behavior Matrix

| Feature           | Globe                          | Flat Map                  | Pro                               | Lite              | HamClock          |
| ----------------- | ------------------------------ | ------------------------- | --------------------------------- | ----------------- | ----------------- |
| WatchPopover      | Toolbar                        | Toolbar                   | Floating toolbar                  | Compact toolbar   | Header            |
| WatchStatusPill   | Below toolbar                  | Below toolbar             | Floating                          | Inline toolbar    | Header glass pill |
| Arc highlighting  | LiveSpotArcs opacity           | Canvas arc opacity        | Same as Globe/Flat                | Same as view mode | Same as Flat      |
| Grid glow         | GridGlowOverlay (3D)           | GridGlowCanvas (2D)       | Same as Globe/Flat                | Same as view mode | Same as Flat      |
| Auto-pan          | Camera orbit via OrbitControls | Viewport center animation | Same as Globe/Flat                | Same as view mode | Viewport pan      |
| Spot list pinning | DXSpotList sidebar             | DXSpotList sidebar        | DXSpotList floating panel         | Mini spot feed    | Bottom strip      |
| Ambient mode      | Auto-rotate + hide panels      | N/A                       | Hide all panels + minimal overlay | Already minimal   | N/A               |
| Replay spots      | Sepia arcs on globe            | Sepia arcs on canvas      | Same as Globe/Flat                | Same as view mode | Same as Flat      |
| Density slider    | WatchPopover                   | WatchPopover              | WatchPopover                      | WatchPopover      | WatchPopover      |

---

## Verification Criteria

### Phase 1 Gate

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` succeeds
- [ ] Watch popover opens/closes with click-outside + Escape
- [ ] "My Grid" preset creates a watch using profile grid
- [ ] Callsign watch matches incoming spots correctly (exact + wildcard)
- [ ] Grid prefix watch matches TX or RX grid
- [ ] Combined filters (callsign + band) use AND logic
- [ ] Matched arcs highlight at full opacity on Globe view
- [ ] Non-matched arcs dim to 30% when watch is active
- [ ] DXSpotList pins matched spots at top
- [ ] Auto-pan fires on Globe view when match rate < 0.2/sec
- [ ] Auto-pan suppressed when match rate > 2/sec
- [ ] Auto-pan does not interrupt active user drag
- [ ] WatchStatusPill shows in Pro, Lite, and HamClock views
- [ ] Old WatchListPanel and WatchIndicator removed
- [ ] Density slider controls arc count (10-200 range)

### Phase 2 Gate

- [ ] Grid glow pulses on Globe when spot lands in a Maidenhead field
- [ ] Grid glow pulses on Flat Map with same timing
- [ ] Max 20 simultaneous glows, oldest recycled
- [ ] Additive glow when multiple spots hit same grid
- [ ] Pro mode "Hide All Panels" creates clean ambient display
- [ ] Toolbar auto-hides after 3s idle, shows on mouse move
- [ ] Cursor hides after 5s idle

### Phase 3 Gate

- [ ] Replay toggle appears in TimeControl when time is in the past
- [ ] Replay spots render with sepia tone, distinct from live spots
- [ ] Replay respects time machine play speed
- [ ] Watch filter applies to replay spots
- [ ] Non-subscribers see upgrade prompt instead of replay toggle
- [ ] Replay query returns within 500ms for 15-minute window
- [ ] Continuous loop replay with date range works

---

## Dependencies on Existing Systems

| System                      | Dependency                     | Risk                                                                |
| --------------------------- | ------------------------------ | ------------------------------------------------------------------- |
| Bridge WebSocket            | Live DX Cluster spots flow     | Low — well-tested, fallback to REST                                 |
| PSKReporter/RBN APIs        | Live Spots for arc rendering   | Low — existing `useLiveSpots` hook                                  |
| Supabase `spot_history`     | Replay feature queries         | Medium — table has 30-day rolling data, needs indexing verification |
| `profileStore.grid`         | "My Grid" preset auto-fill     | Low — may be unset for new users (handle gracefully)                |
| OrbitControls               | Auto-pan camera integration    | Low — already used for auto-rotate, well-understood                 |
| `authStore`                 | Subscription gating for replay | Medium — subscription model not yet implemented                     |
| `displayTime` (TimeControl) | Replay time source             | Low — well-tested time machine system                               |

---

## Open Questions

1. **Multiple simultaneous watches?** MVP uses a single active watch. Should v2 support multiple watches running concurrently with different highlight colors?

2. **Sound alerts?** The existing `useWatchAlerts` hook plays audio on match. Should watch v2 preserve this? What sound, and how to avoid annoyance at high match rates?

3. **Watch sharing?** Could saved watches be shareable via URL params or QR code? "Watch the 3Y0J DXpedition with me."

4. **Mobile behavior?** Auto-pan on mobile could be disorienting. Should mobile suppress pan and only highlight?

5. **Replay data retention?** Free tier could offer 24-hour replay, Pro tier 30-day. What's the right split for monetization?
