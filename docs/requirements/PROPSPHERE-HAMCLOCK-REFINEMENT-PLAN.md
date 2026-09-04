# PropSphere HamClock Refinement Plan

Status: complete  
Owner: PropSphere  
Last updated: 2026-09-04

## Implementation record (2026-09-04)

Landed on `feat/cluster-settings` with plan defaults:

- **Phase 0:** HamClock modes + preferred projection + enter/exit snapshot restore;
  harvested BestBand, projection switch, moon/contests/dxpeditions/reliability,
  `lib/hamclock`, bottom `DXNewsTicker` crawl slot.
- **Phase 1:** Mode switch + MUF/Aurora/DRAP/Wx chips; solar condition label;
  photoreal (`satellite`) basemap on enter; spot filters re-enabled.
- **Phase 2:** Bands mode with focus chips; filters restored when leaving Bands.
- **Phase 3:** Satellites mode enables birds + footprints; flat-map footprint
  drawing parity with globe angular-horizon math.
- **Phase 4:** Priority crawl via existing `DXNewsTicker` (weather/solar → ham).
- **Phase 4.1:** Allowlisted ARRL + NPR RSS via `/api/feeds/rss`; Ham/News
  crawl toggles; feed failure does not blank the crawl.
- **Phase 5:** Beauty pass — night-darkness control (flat + globe), day-side
  satellite softening, UHD enter quality, cloud attribution on flat map,
  wall kiosk templates (`HamClock Wall`, `HamClock Weather`), larger clock
  presence.

## Outcome

Make HamClock a **higher-end always-on Earth clock** that competes with
HamClock / OpenHamClock, Helioclock, and Geochron — without becoming another
dense panel grid.

The product should feel:

- **map-first** — photoreal Earth + terminator own the screen;
- **solar-weather-first** — conditions are glanceable at 10ft;
- **mode-driven** — Traffic, Bands, Satellites, Weather as presets, not
  twenty simultaneous widgets;
- **composed from existing PropPulse tech** — wire and refine, do not rebuild
  physics, tiles, or spot ingestion.

## Product decisions

### HamClock is a composed product surface, not a layout toggle

Entering HamClock applies HamClock defaults (basemap, layers, crawl, panel
stack). Leaving restores the operator’s prior Normal/Pro preferences. HamClock
must not silently inherit whatever Normal left on.

### Modes beat panel sprawl

Classic HamClock loses to visual chaos. PropPulse wins by keeping the map
sacred and exposing a small set of **view modes / presets**:

| Mode | Map emphasis | Sidebar emphasis |
| --- | --- | --- |
| Traffic (default) | Live spots / arcs | DX list + DE/DX/space wx |
| Bands | Filtered band traffic + activity | Band ladder + focus controls |
| Satellites | Birds + footprints | Next passes / selected sat |
| Weather | Alerts (+ optional radar/clouds) | Alert summary + solar state |

Modes flip layer presets and sidebar content. Operators can still open Layers
for one-off overrides; persistence is per-mode where it matters.

### Compose existing capability before inventing

Prefer wiring:

- `FlatMapView` / `GlobeView` / `AzimuthalView`
- `DXNewsTicker`, `useWeatherAlerts`, `BandConditionsPanel` /
  `useBandActivity` / `BandVerdictPanel`
- `useSatellites`, globe footprint overlay, satellite pass hooks
- High-res tiled imagery + attribution from the UHD/wall work
- Worktree HamClock upgrades (BestBand, contests, moon, reliability,
  projection switch, ticker slot) as a **candidate baseline**, not gospel

### Interaction model stays PropPulse

No side-of-browser flyouts. Detail = anchored popover or centered modal.
Always-on crawl is a full-width bottom bar, not a slide-in panel.

### Differentiation vs competitors

| Competitor strength | PropPulse answer |
| --- | --- |
| HamClock dense Live Spots | Band-focus monitoring + better traffic fidelity |
| Geochron photoreal theater | UHD tiles + seasonal surfaces + clean greyline |
| Helioclock alert crawl + news | Priority crawl (weather/solar → ham → optional world news) |
| OpenHamClock panel kitchen-sink | Mode presets + map-first restraint |

## Current baseline (this branch)

`HamClockView` today:

- Header: layout switch, callsign/grid, UTC/local clock, SFI/Kp/Bz pills,
  Layers, Watch, exit
- Sidebars: DX spots (`showFilters={false}`) + stacked DE / DX / Space Wx /
  Band Conditions
- Map: `FlatMapView` only
- Missing in-view: crawl/ticker, band focus UI, sat mode, weather-first
  defaults, projection switch, HamClock-specific layer presets

Related work already elsewhere in the app or in worktrees should be harvested,
not rewritten.

## Attack phases

### Phase 0 — Baseline harvest and HamClock contract

**Goal:** Stop treating HamClock as a thin shell; establish the product
contract and land reusable worktree pieces that fit.

**Work**

1. Diff current `HamClockView` vs
   `.worktrees/wall-display-clean` (and related) HamClock modules.
2. Selectively land, with hunk-level care against current map/store work:
   - bottom `DXNewsTicker` slot
   - `HamClockProjectionSwitch` (flat / azimuthal / globe, lazy)
   - `HamClockBestBandHero` (if it does not fight Band mode design)
   - Contests / DXpeditions / Moon / Reliability panels as **optional**
     info-stack entries (default collapsed)
3. Extend `hamclockStore` for:
   - `viewMode` preference inside HamClock (or reuse map `viewMode` with
     HamClock enter/exit restore)
   - `hamclockMode`: `traffic` | `bands` | `satellites` | `weather`
   - per-mode layer snapshot + panel collapse defaults
4. On `setLayoutMode("hamclock")`: apply HamClock defaults; stash prior
   layout/layer/viewMode for restore on exit.
5. Document the contract in this file’s checklist; keep UX Rules (no flyouts).

**Done when**

- Entering HamClock always yields a coherent default scene.
- Projection can change without leaving HamClock.
- Crawl slot exists (even if content is still the existing DX ticker).
- `npm run lint` + targeted HamClock tests / smoke pass.

**Out of scope for Phase 0:** new RSS sources, flat-map footprints, band
focus chrome.

---

### Phase 1 — Compose the solar-weather + traffic core

**Goal:** Make the default Traffic mode feel premium and glanceable.

**Work**

1. **Visual hierarchy pass**
   - Slimmer chrome where possible; map fills the emotional center
   - Clock + solar state readable at wall distance
   - Sidebars denser but quieter (less card chrome, more mono data)
2. **Space weather elevation**
   - Keep header pills
   - Enrich Space Wx panel: SFI/SSN/Kp/Bz plus short trend or condition label
   - One-tap layer chips for Aurora / DRAP / MUF (reuse existing layers)
3. **Spot sidebar productization**
   - Re-enable compact band/mode filters inside HamClock spots sidebar
   - Keep live count badge; add “age window” if already available in DX list
4. **Weather alerts available, not buried**
   - Weather layer reachable from HamClock header/mode without hunting Layers
   - Alert click → existing anchored flyout/modal pattern (no new flyout system)
5. **Imagery defaults**
   - Photoreal / best available basemap as HamClock default
   - Attribution always visible and correct (align with UHD plan)

**Done when**

- Default Traffic mode looks intentional on a large monitor.
- Operator can filter spots by band without leaving HamClock.
- Aurora/DRAP/MUF/weather are one gesture away.
- Manual UI check: enter HamClock cold → readable in &lt;3 seconds.

---

### Phase 2 — Band monitoring mode

**Goal:** “Watch 20m (or a set of bands) and see what’s happening” as a
first-class HamClock experience.

**Work**

1. HamClock band focus control (multi-select HF/VHF set).
2. Drive `spotFilters.bands` (and map arc filtering) from that control.
3. Band activity strip / ladder using existing
   `useBandActivity` / `BandVerdictPanel` / hourly stats — HamClock-scaled,
   not a dashboard paste.
4. Optional: per-band spot-rate sparkline in the info stack.
5. Mode preset `bands`: enables spots + traces as needed, focuses sidebar on
   activity + filtered list.

**Done when**

- Selecting one band filters list + map together.
- Activity readout updates with live traffic.
- Switching back to Traffic clears or restores prior band focus per product
  choice (decide: restore previous filters vs clear — prefer restore).

**Reuse**

- `mapStore.spotFilters`
- `BandConditionsPanel`, `useBandHourlyStats`, `useBandActivity`,
  `BandVerdictPanel`
- Spot coloring / presentation already on FlatMap

---

### Phase 3 — Satellite mode + flat footprints

**Goal:** Flip HamClock into a satellite theater competitive with Geochron /
HamClock sat panels.

**Work**

1. Mode preset `satellites`:
   - enable `layers.satellites` (+ footprints when ready)
   - de-emphasize or hide spot arcs by default (toggle to keep both)
2. **FlatMap footprint parity** — today footprints exist on Globe only.
   Port/adapt footprint drawing to `FlatMapView` (and azimuthal if cheap).
3. Sidebar: next passes / selected satellite summary via
   `useSatelliteNextPasses` / existing sat UI.
4. Motion: footprints and markers update smoothly at wall refresh rates;
   cap visible sats (Globe already limits footprints).

**Done when**

- Satellites mode shows birds moving with footprints on the default flat map.
- Selecting a sat surfaces pass context without leaving HamClock.
- Performance acceptable on a typical wall machine (no multi-second hitch).

**Risk**

- Flat canvas footprint math must match globe semantics; share geometry
  helpers rather than duplicating ad-hoc circles.

---

### Phase 4 — Priority crawl (alerts + ham ticker + optional world news)

**Goal:** Own the Helio-style bottom crawl without becoming a news app.

**Work**

1. Mount crawl permanently in HamClock (Phase 0 slot).
2. **Priority stack** (highest wins the break-in):
   1. Nearby severe weather / critical solar alerts
   2. Ham/propagation ticker (extend `DXNewsTicker`)
   3. Optional configured free world/ham RSS headlines
3. Extend ticker item model for `source` + `priority` + optional link.
4. Free news source selection (examples to evaluate, not commit yet):
   - Ham: ARRL news RSS, or existing in-app DX/solar strings
   - World: a small allowlist of free RSS feeds via an Edge proxy
     (`api/` proxy for CORS + rate limit + sanitization)
5. Settings: enable world news on/off; feed allowlist; never block weather
   break-ins.
6. Optional soft audio on critical break-in (off by default; respect kiosk
   norms).

**Done when**

- Weather/solar critical items visually interrupt the crawl.
- Ham traffic/conditions continue when quiet.
- Optional world news works through the proxy with attribution and failure
  isolation (feed down ≠ blank HamClock).

**Out of scope**

- Full custom multi-feed CMS, markets panels, debt clocks, non-ham NOC kits
  beyond the crawl.

---

### Phase 5 — Beauty and wall refinement

**Goal:** Geochron-adjacent presence using PropPulse imagery strengths.

**Work**

1. Seasonal / day-night surface polish under HamClock defaults.
2. Optional live clouds as a beauty layer with freshness + attribution
   (per UHD plan: de-clouded base, clouds optional).
3. Night dimming / high-contrast option for dark shacks.
4. 4K/UHD smoke: clock, pills, crawl, and band chips legible at 3840×2160.
5. Kiosk/Wall Display: HamClock scene template uses the refined defaults.

**Done when**

- Side-by-side with Geochron/Helio marketing stills, PropPulse HamClock reads
  as intentional theater, not a browser dashboard.
- Wall Display can launch HamClock mode without extra operator fiddling.

---

## Implementation map (primary files)

| Area | Likely touch points |
| --- | --- |
| Shell / modes | `src/components/map/HamClockView.tsx`, `src/components/map/hamclock/*`, `src/stores/hamclockStore.ts` |
| Enter/exit defaults | `src/stores/mapStore.ts` (`setLayoutMode`) |
| Map layers | `FlatMapView.tsx`, `GlobeView.tsx`, `LayersPopover.tsx` |
| Band focus | `HamClockSpotsSidebar.tsx`, spot filter store, band activity hooks |
| Sat footprints | `FlatMapView.tsx` (+ shared footprint util extracted from globe path) |
| Crawl | `DXNewsTicker.tsx`, new `api/` RSS proxy if world news lands |
| Imagery | Existing tile providers / UHD display quality helpers |
| Entry | `src/pages/PropSphere.tsx`, kiosk scenes if wall-templated |

## Non-goals (this initiative)

- Rebuilding live WSPR ingestion
- Full OpenHamClock panel parity (EmComm, SDR-in-panel, 40+ widgets)
- Hardware appliance / multi-display server SKU
- Replacing Wall Display / kiosk playlist system
- Side flyout redesigns

## Sequencing and dependencies

```text
Phase 0 (baseline + contract)
    → Phase 1 (traffic + solar compose)
        → Phase 2 (bands)     ──┐
        → Phase 3 (satellites) ─┼→ Phase 4 (crawl/news) → Phase 5 (beauty)
                                │
        Phase 2 and 3 may run in parallel after Phase 1
```

Phase 4 can start after Phase 1 for the ham/alert crawl; world RSS can trail.
Phase 5 should absorb imagery fixes discovered earlier rather than block
Phases 2–4.

## Verification

Per phase, before calling done:

1. `npm run lint` (and tests touched by the change)
2. Manual HamClock enter/exit restore check
3. Mode switches: Traffic ↔ Bands ↔ Sats ↔ Weather
4. Wall-distance glance test (clock, solar, mode state)
5. For Phase 3+: sat footprint visible on flat map
6. For Phase 4+: alert break-in overrides news; feed failure isolated
7. For Phase 5: 4K smoke capture if wall tooling is available

## Open decisions (resolve at phase kickoff, not sooner)

1. **Worktree harvest depth** — land full optional panel stack in Phase 0, or
   only ticker + projection + BestBand?
2. **Band focus restore** — returning from Bands mode restores prior filters
   (recommended) vs always clears.
3. **World news** — ship ham/solar crawl only first, or include one free RSS
   allowlist in Phase 4.1?
4. **Audio break-in** — Phase 4 optional or defer entirely?
5. **Default HamClock projection** — stay flat (current) or allow last-used?

Defaults if unprompted during execution: harvest ticker + projection +
BestBand in Phase 0; restore filters; ham/solar crawl first with RSS as
Phase 4.1; audio off/defer; flat default with remembered override.

## Success criteria (initiative)

HamClock is no longer “PropSphere with sidebars.” It is a distinct,
beautiful, solar-weather-forward wall view where an operator can:

1. See Earth + conditions at a glance,
2. Focus one or more bands and watch real traffic,
3. Flip to satellites with footprints,
4. Catch weather/solar break-ins on a live crawl,

…using technology PropPulse already owns, refined into one composition.
