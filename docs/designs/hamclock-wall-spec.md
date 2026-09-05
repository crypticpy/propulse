# HamClock Wall and Desk Specification

> Living specification for the HamClock view (`/map` in HamClock layout).
> Updated 2026-09-05 after PRs #167, #169, #170 and #171 shipped and the owner's
> first production review. The feature register at the end is the traceability
> record: every row is either shipped with evidence or still open.

Related documents:

- Style guide: `docs/guides/hamclock-tile-system.md` (rules every tile, report and settings row follows)
- Layer provenance: `docs/PROP-SPHERE-LAYER-SOURCE-AUDIT.md`
- Data truthfulness: `docs/decisions/ADR-SOLAR-DATA-TRUTH.md`
- Delivery tracking: `docs/FEATURE-TRACKER.md` section 13

---

## 1. Purpose and audience

HamClock is the shack wall display. The primary viewer is an older ham reading
a TV from about ten feet away, often with reading glasses off. The secondary
viewer is the same operator at a desk monitor. Both must be served by one
design, not two.

Consequences that drive every rule below:

- One value per tile is readable from across the room. Everything else is secondary.
- Targets are large. Nothing important is smaller than a fingertip.
- The display must be able to run itself: pages rotate, reports can be pinned, nothing needs a mouse to stay useful.
- Every number says where it came from and how old it is. A wall that shows stale data as current is worse than a blank one.

## 2. Principles

| Principle                          | Rule                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| One visual language                | Wall and desk use the same tiles, pages, reports and settings. Only scale and rail treatment differ.                                  |
| Primary controls never move        | Mode, WALL/DESK, projection and SETTINGS live in the same header slot in both densities. A control that moves between modes is a bug. |
| No scrolling inside tiles or rails | A tile shows a summary that fits. A rail pages. Overflow is a design failure, not a scrollbar.                                        |
| No hover menus, no flyouts         | Menus open on click and close on close, Escape or backdrop. Detail views are centered dialogs over the map, never side panels.        |
| Click opens a report               | The whole tile is the click target. The report is the enlarged, interactive version of the tile.                                      |
| Source and freshness on everything | Tiles carry a sub line with the source or age; reports carry a footer `DATA: source · UPDATED hh:mm UTC · age`.                       |
| Honest empty states                | "NONE MAPPED", "WAITING", "NO RECEIVER". Never "ALL CLEAR" for a feed that does not cover the question.                               |
| Simplicity wins                    | A tile with one clear value beats a tile with six. When in doubt, show less.                                                          |
| Configurable the same way          | A widget with options has a gear that opens a centered config dialog with segmented choices. See section 12.                          |
| Themeable from the start           | Every colour, font, radius and glow is a `--hc-*` token. Tiles never hard-code a colour.                                              |

## 3. Densities

| Aspect         | Wall (default)                                           | Desk                                                      |
| -------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| Map            | Full bleed behind everything                             | Full bleed, rails docked                                  |
| Rails          | Translucent glass (`--hc-glass`, `--hc-blur`)            | Opaque panel (`--hc-panel`), hairline separators          |
| Scale          | `--hc-scale: 1` (vh-based tokens in `hamclock-wall.css`) | `--hc-scale` around 0.72, tuned by eye on a 1440p monitor |
| Tiles per rail | 4 left, 5 right per page                                 | 5 left, 6 right per page                                  |
| Auto-page      | On by default                                            | Off by default                                            |
| Header         | Dual clocks, callsign, grid, mode, WALL/DESK, SETTINGS   | Same header, same order                                   |

Desk today still renders the legacy accordion sidebar (`HamClockSidebar`,
`HamClockLocationConditions`, `BandConditionsPanel`). That layout is retired by
HW-24 and HW-25 below: desk becomes the wall tiles at desk scale.

## 4. Page taxonomy

Pages are data (`src/components/map/hamclock/wall/pages.ts`). The shipped set
has five pages; the target set has six. Tiles marked _new_ do not exist yet.

| #   | Page                       | Left rail                                                   | Right rail                                                         |
| --- | -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | Space weather              | X-ray, Solar wind, Space Wx (G/S/R + Kp), Sun               | X-ray, Solar wind, Space Wx, Sun, Aurora _new_                     |
| 2   | Band conditions & forecast | Best band now, MUF, 24h band forecast, Reliability          | Best band now, 24h band forecast, Reliability, MUF, Band activity  |
| 3   | Contact activity           | Best band now, DX cluster, Band activity, Grey line         | DX cluster, Band activity, Recent contacts, Watch matches _new_    |
| 4   | Weather (section 16)       | Local weather, Hourly _new_, Radar _new_, Earthquakes _new_ | Local weather, 7-day _new_, Lightning _new_, Volcanoes _new_, Moon |
| 5   | News & alerts              | Weather alerts, Emcomm, DX news _new_                       | Weather alerts, Emcomm, Contests _new_, DXpeditions _new_          |
| 6   | SDR (optional)             | Band scope, Decodes                                         | Band scope, Decodes, Band activity                                 |

The SDR page is hidden when no receiver is configured. See open decision D2 for
whether desk hides it always.

## 5. Auto-page

- Default dwell is 30 seconds per page. Both rails move together to the same page index.
- On by default at wall density, off at desk. Persisted in `hamclockDisplayStore` as `autoPage: { enabled, dwellSec }`.
- Any pointer, key or touch interaction on the rails or header pauses rotation. Rotation resumes after 60 seconds of quiet.
- An `AUTO` toggle sits beside the pager in the footer and is repeated on the Pages & Tiles settings tab.
- A pinned report (section 8) stays open while pages rotate underneath.
- Kiosk scenes remain the mechanism for custom playlists that mix HamClock pages with other routes. They pin a page via `KioskSceneMapConfig.hamclock` and suspend auto-page while active.

## 6. User-selected rails

Operators choose what each rail shows on each page.

### Interaction

- Settings panel, tab **Pages & Tiles**.
- Every available tile is shown as a large card with a live miniature preview, its title, and the page it currently belongs to.
- The operator picks a page, then a rail, and toggles tiles on or off for that slot. Order is changed with up/down buttons (drag is optional, buttons are required for keyboard and remote use).
- Each rail on each page has a slot limit (wall 4/5, desk 5/6). The panel shows `3 of 5 used` and disables further additions at the limit.
- A **Reset to shipped layout** button restores the defaults.

### Data model

```ts
type RailSide = "left" | "right";
interface RailPage {
  pageId: string; // matches HAMCLOCK_WALL_PAGES[].id
  tileIds: TileId[]; // ordered, length ≤ slot limit for the density
}
railLayout: Record<RailSide, RailPage[]>;
```

- Stored in `hamclockDisplayStore` (bump `version`, migrate by seeding `railLayout` from `HAMCLOCK_WALL_PAGES`).
- Unknown `tileIds` from a retired tile are dropped at read time; unknown `pageId`s are dropped and the shipped page is appended so the pager never shows an empty page.
- Kiosk pins reference page ids, not indexes, once this lands.

## 7. Tile grammar

A tile is three lines and nothing more:

1. **Title** — small caps, `--hc-t-title`, `--hc-dim`.
2. **Hero** — one value, `--hc-t-hero` (or `--hc-t-hero-lg` for a single-word verdict), display font, tone class.
3. **Sub line** — one line, `--hc-t-body`, context or freshness ("36 obs · 30 rx", "as of 10:52 MDT").

Rules:

- The whole tile is one button. `onOpen` opens the report; `openLabel` names it for assistive technology.
- Tone comes from `hc-good`, `hc-warn`, `hc-bad`, `hc-info-text`, `hc-accent-text`, `hc-dim-text`. Tiles never pick a hex.
- Size tokens are vh-based (`hamclock-wall.css`) and multiplied by `--hc-scale` for desk.
- A tile may add one small graphic (moon phase, sun arc, four-dot forecast ladder) in place of the sub line, never in addition to it.

Shipped tiles live in `src/components/map/hamclock/wall/tiles/` and are
registered in `tiles/index.ts`.

## 8. Report anatomy

A report is the centered, enlarged, interactive version of a tile. It is built
on `WallReport` (`AccessibleDialog` with `chrome="bare"`).

```
┌─────────────────────────────────────────────────────────────┐
│ TITLE                                        [pin]  [close] │
│ scale bars / verdict strip (G S R, or best band verdict)    │
├───────────────────────┬─────────────────────────────────────┤
│ imagery / gauge /     │ LABEL              value  (tone)    │
│ hero graphic          │ LABEL              value            │
│ (view switch below)   │ … two columns at ≥ 1600 px …        │
├───────────────────────┴─────────────────────────────────────┤
│ one trend chart, full width, titled "METRIC — RANGE · SRC"  │
├─────────────────────────────────────────────────────────────┤
│ DATA: NOAA SWPC · UPDATED 00:10 UTC · 5 min ago             │
└─────────────────────────────────────────────────────────────┘
```

- **Pin**: a pinned report stays open across auto-page and scene changes until unpinned or closed. Persisted for the session only.
- **Close**: close button, Escape, or backdrop click. Focus returns to the tile that opened it.
- The map remains visible around the dialog. The dialog never exceeds 90 vw × 88 vh and never scrolls; content that does not fit gets a second tab inside the report.
- Charts reuse `SolarMiniChart`, `SolarSeriesChart` and the `MetricCard` sparkline, all reading `--hc-*` tokens (HW-29).
- Reports shipped in #170: Solar, Sun & Moon, Weather, Forecast, Emcomm, Band activity (`src/components/map/hamclock/wall/reports/`).

## 9. Best Band Now report

The band report becomes a ranked table. All inputs already exist
(`useBandVerdicts`, `useBandLadder`, reliability cells, RBN/DX counts).

Header: `BEST BAND NOW · COMPUTED MUF 30.5 MHz · DAYSIDE at QTH`.

| Column     | Source                                   | Notes                                               |
| ---------- | ---------------------------------------- | --------------------------------------------------- |
| Rank       | score order                              |                                                     |
| Band       | `BAND_ORDER`                             | hero mono                                           |
| Status     | ladder state                             | "LEADING · 7/20 MIN" for the leader, otherwise dash |
| Predicted  | physics verdict                          | Open / Marginal / Closed with tone                  |
| DX · RBN   | spot counts in window                    | two numbers, mid dot                                |
| ΔMUF       | band top − MUF                           | signed, tone by sign                                |
| Score      | band verdict score                       | bold                                                |
| Band scope | last 2 h score sparkline + min–max label | `SolarMiniChart` in token colours                   |

Below the table: **SURPRISE ACTIVITY — PREDICTED CLOSED**, bands with observed
activity while predicted closed, same columns. Rows are clickable and set the
band focus on the map.

## 10. World clocks bar

- The top rail gains a row of city clocks between the callsign block and the local/UTC hero clocks.
- Configurable in Settings → Display: up to N clocks (open decision D1), each with city label and IANA zone. Default set is empty at desk and a four-city preset at wall.
- Clocks use `formatClock(date, zone)`; the local and UTC hero clocks keep their size and stay right-aligned.
- Wall only by default; desk may enable it, at which point the header height token grows.

## 11. Settings panel

Replaces every header popout (`HamClockDisplaySettings`, `LayersPopover` in
HamClock, the wall controls menu).

- Centered dialog on `AccessibleDialog`, tabs across the top: **Display · Pages & Tiles · Layers · Map · Theme · Kiosk**.
- No tab scrolls. A tab that would overflow at 1080p is split into sub-tabs.
- Rows are full width with a large **ON / OFF** button on the right that spells the state. Minimum row height is 56 px at desk scale. Switch-style toggles are not used.
- Rows with options show a gear that expands the row inline. Nothing opens a second popover.
- Opens on click only. Closes on the close button, Escape, or backdrop click. Never on pointer leave.
- The dialog covers at most 70 vw so the map stays visible. Layer toggles apply live.

### Layers tab

Each row: icon · name · provenance line `source · cadence · coverage` · optional
amber caveat line · ON/OFF. Rows are generated from one **layer registry**
(HW-21) that also feeds the help page and the wall status line, so a layer is
described the same way everywhere. Categories become sub-tabs with at most
eight rows each. The category-then-options structure of the current
`LayersPopover` is kept.

### Top rail after the panel lands

Mode · WALL | DESK · projection · SETTINGS. Nothing else. Until then (HW-22,
HW-23) the layers trigger moves beside the Activity / Contacts / Both selector
and the popover is clamped to the viewport.

## 12. Widget configuration dialogs

Most feature widgets are configurable, and they are all configured the same
way. A tile or report that has options shows a gear; the gear opens a centered
configuration dialog on the same shell as reports and under the same
big-control rules (section 11).

### Reference example: news feeds

- Header: title `NEWS FEEDS` plus a one-line purpose ("Headlines for the ticker and the DX news tile").
- Two segmented big-button rows: **Fetch every** 15 / 30 / 60 / 120 min, and **Show items from last** 1h / 2h / 3h / 6h / 12h / 24h. One button is lit; no dropdowns.
- Feed rows grouped by category. Each row: category chip in its tone colour, source name, description, last-fetched status (`— · NOT YET FETCHED` or `UPDATED hh:mm · 4 min ago`), big ON / OFF, REFRESH.
- **Add custom feed** form: name, category (select or type), URL, optional description, a row of colour swatches, then VERIFY and, only after verify succeeds, ADD FEED.
- If a category has more than eight rows the dialog paginates by category tab. Nothing scrolls.

### Widget config contract

```ts
interface WidgetConfig<T> {
  schema: ZodType<T>; // validates persisted values on read
  defaults: T;
  ConfigPanel: React.ComponentType<{ value: T; onChange: (next: T) => void }>;
}
// wall/tiles/index.ts
WALL_TILES[id] = { title, Component, config?: WidgetConfig<unknown> };
```

- Persisted per tile id in a new `hamclockWidgetConfigStore` (`widgets: Record<TileId, unknown>`), validated through `schema` on read so a stale shape falls back to `defaults`. Widgets that already own a store (`feedStore`, `dxStore` filters) keep it and expose a `ConfigPanel` over it instead of duplicating state.
- Choices are segmented big buttons, never dropdowns. Free text only where the value is genuinely free (a name, a URL).
- No scrolling inside the dialog. Lists longer than eight rows paginate by category tab.
- User-entered URLs are verified before save by a server-side fetch through the existing edge proxy (`api/feeds/rss.ts`), never from the browser. ADD is disabled until VERIFY returns a parsed title and item count.
- The gear is a second target inside the tile, at least 44 × 44 px, and does not open the report.

### First configurable widgets

| Order | Widget                     | Settings                                                     | Existing state                                       |
| ----- | -------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| 1     | News feeds (ticker + tile) | fetch interval, max age, feed rows, custom feeds             | `feedStore` (`FeedSource`, `TickerCrawlPreferences`) |
| 2     | DX cluster tile            | band, mode, continent and age filters                        | `dxStore.filters` (`DXClusterFilters`)               |
| 3     | Weather tile               | location (home / DX target / custom grid), units override    | `hamclockDisplayStore.units`                         |
| 4     | Band activity / Best band  | band list shown, minimum spot count                          | `BAND_ORDER`                                         |
| 5     | World clocks               | city list and zones (section 10)                             | new                                                  |
| 6     | Weather alerts             | alert area (home county / state / radius) and severity floor | `TickerCrawlPreferences.weatherThreshold`            |

The DX news ticker (`DXNewsTicker.tsx`) becomes the first configurable widget
because its feed list, crawl preferences and edge proxy already exist; the work
is the dialog, not the plumbing.

## 13. Map style chooser

A centered `SELECT MAP STYLE` list under the settings panel's Map tab, using the
same row anatomy as the Layers tab:

- Row: thumbnail swatch, name, one provenance or behaviour line, selected indicator dot, ON-style select target.
- Keyboard hint line at the bottom: `SELECT to apply · BACK to cancel`.
- Selecting applies live; BACK or Escape restores the previous style.

Mapped onto existing state in `src/stores/mapStore.ts` and `src/lib/tiles/providers.ts`:

| Row                | Existing state                                        | Behaviour line                                      |
| ------------------ | ----------------------------------------------------- | --------------------------------------------------- |
| Satellite          | `mapStyle: "satellite"` + provider `esri-world`       | "ESRI World Imagery · city lights at night when on" |
| Satellite (Mapbox) | `mapStyle: "satellite"` + provider `mapbox-satellite` | "Mapbox · Maxar · needs token"                      |
| Standard           | `mapStyle: "standard"` + provider `osm`               | "OpenStreetMap · roads and labels"                  |
| Dark               | `mapStyle: "standard"` + provider `carto-dark`        | "CARTO dark · best behind glass rails"              |
| Night lights       | `layers.nightLights`                                  | "Black Marble city lights on the dark side"         |

Layer presets (`LAYER_PRESETS`: dx-hunter, contest, vhf, emergency, science) sit
below the styles on the same tab as a second row group. A style that auto-swaps
by month is not something we have today; if a seasonal Blue Marble basemap is
added later it gets a row with an "auto-swaps 1st of month" behaviour line.

### Bottom bar (not adopted)

The reference screenshot's bottom bar (PREV / NEXT / NEWS / MENU / STYLE /
LAYERS / SETTINGS / KEYS / HELP / POWER) is the source of the "few primary
controls plus SETTINGS" rule in section 2. We do not adopt it. The wall keeps
its controls in the top rail; style and layers live inside SETTINGS.

## 14. Desk cleanup

- The DE STATION identity block (callsign, grid, coordinates) is removed. The header already shows it.
- Home weather appears once, in the weather tile.
- A **DX TARGET** tile replaces the DX Target accordion: target grid as hero, distance and bearing as the sub line, target weather in the report.

## 15. Lightning

- 3D: each strike is a billboard sprite of a classic bolt glyph (canvas-drawn, yellow-white on the pulse theme, tone token driven), sized in screen space. Fresh strikes pulse once and fade over the existing window. Replaces the additive-blended spheres in `LightningOverlay3D.tsx`.
- 2D: a symbol layer with the same bolt icon replaces the circle layer in `LightningLayer2D.tsx`.
- No additive blending on the core glyph. Glow is a single subtle halo controlled by `--hc-glow`.

## 16. Weather system consolidation

Owner direction (2026-09-05): upgrade the weather system substantially and,
once parity is reached, retire AtmosPulse as a separate destination. Weather
becomes tiles, reports, config dialogs and layers inside this design system
rather than its own route.

### What AtmosPulse provides today

`src/pages/AtmosPulse.tsx` with `src/components/atmos/`:

| Area        | Today                                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Views       | 2D atlas (`AtlasView`) and 3D globe (`AtmosGlobeView`), switched by `ViewSwitcher`                                                                                      |
| Radar       | `RadarLayer2D` plus time scrubbers `RadarScrubber2D` / `RadarScrubber3D`                                                                                                |
| Layers (2D) | alerts, APRS, fires, GOES clouds, lightning, radar, repeaters, river gauges, shadow zones, sea-surface temperature, TEC, tropical cyclones (`components/atmos/layers/`) |
| Cards       | `LocalWeatherCard`, `RegionRIMCard`, `RIMScoreCard`, `SignalChainHealth`, `WeatherLegend`, `WeatherAlertToast`                                                          |
| Regions     | `MonitoredRegionManager` (watch areas, RIM scores)                                                                                                                      |
| EmComm      | `components/atmos/emcomm/` (activation banner and modal, ICS-213, SitRep, NVIS briefing, Winlink status, repeater analysis, net link forecast, frequency plan)          |

The HamClock wall already carries the weather tile, alerts tile, emcomm tile,
Weather report and Emcomm report, so the two surfaces overlap today.

### Target

- **Weather page** in the taxonomy (section 4, page 4 becomes "Weather"): tiles for local now, hourly, 7-day, radar, lightning, alerts, and tides where the QTH is coastal. Earth events keep their slots on the same page.
- **Weather report** with the section 8 anatomy: hero (current conditions and one-word state), trend charts (temperature, wind, pressure over 24 h), a 7-day strip, and pointer-over details on every chart point. Radar and lightning open their own reports with the scrubber as the interactive element.
- **Weather layers** under the settings Layers tab as one category, generated from the layer registry (HW-21): radar, lightning, clouds, alerts, fires, cyclones, river gauges, SST. APRS, repeaters, shadow zones and TEC move to the categories they belong to.
- **Weather configuration dialog** (section 12 contract): location (home / DX target / custom grid), units override, radar cadence (5 / 10 / 15 min), alert area (county / state / radius) and severity floor.
- **EmComm** keeps its forms and activation flow; they open as reports from the Emcomm tile.

### Migration path

1. Build the page, tiles, reports and config dialog inside the wall (HW-40 to HW-45).
2. Port each AtmosPulse layer into the registry so the Layers tab and the map render them in both 2D and 3D (HW-46).
3. Move the region manager and RIM cards into a report opened from the alerts tile (HW-47).
4. Once the parity checklist is green, the `/atmos` route redirects to the map in HamClock layout on the Weather page, or stays as a deep link (open decision D7).

### Parity checklist

Rows HW-40 to HW-49 in the feature register. All are Not started.

## 17. Earth events

- **Earthquakes**: USGS GeoJSON feed, M4.0+ past 24 h, no key. Tile hero = count with largest magnitude; report = table (mag, location, depth, age) plus map markers.
- **Volcanoes**: Smithsonian GVP weekly report, no key. Tile hero = active count; report = list with country and last activity.
- Both live on the Weather & Earth events page. Feeds are proxied by edge functions with the standard rate limit.

## 18. Themes

- `pulse` (default, cyberpunk), `classic` (elegant serif, no glow), `brass` (nautical). Tokens in `src/styles/hamclock-themes.css`.
- State colours derive from the colour-blind palette tokens, so a theme never overrides good/warn/bad.
- Fonts for non-pulse themes are fetched on demand (`ensureHamClockThemeFont`) from both the wall and desk roots.
- The theme picker (`HamClockThemePicker`) renders a miniature tile per theme.

## 19. Accessibility

- Every visual grid has an `sr-only` semantic table (forecast report sets the pattern).
- Dialogs trap focus and return it to the opener.
- Escape closes the innermost open thing: report, then settings, then HamClock itself. Handlers stop propagation at each layer.
- Arrow keys page the rails; `AUTO` is a labelled toggle.

## 20. Feature register

| ID    | Feature                                                          | Status      | Evidence                              | Notes                                                                                                                                                                                                                                                               |
| ----- | ---------------------------------------------------------------- | ----------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HW-01 | Wall shell: full-bleed map, header, paged rails, pager           | Delivered   | PR #167                               | `wall/HamClockWall.tsx`                                                                                                                                                                                                                                             |
| HW-02 | Theme token layer and pulse theme                                | Delivered   | PR #167                               | `src/styles/hamclock-themes.css`                                                                                                                                                                                                                                    |
| HW-03 | Display store: density, theme, units, page index, migrations     | Delivered   | PR #167, #169                         | `hamclockDisplayStore` v3                                                                                                                                                                                                                                           |
| HW-04 | Unit resolution (auto / imperial / metric)                       | Delivered   | PR #167                               | `src/lib/hamclock/units.ts`                                                                                                                                                                                                                                         |
| HW-05 | Keyboard paging and footer pager                                 | Delivered   | PR #167                               |                                                                                                                                                                                                                                                                     |
| HW-06 | Sixteen live tiles                                               | Delivered   | PR #169                               | `wall/tiles/index.ts`                                                                                                                                                                                                                                               |
| HW-07 | Wall as default density                                          | Delivered   | PR #169                               | migrate `< 3` sets wall                                                                                                                                                                                                                                             |
| HW-08 | Page taxonomy v1 (five pages)                                    | Delivered   | PR #169                               | `wall/pages.ts`                                                                                                                                                                                                                                                     |
| HW-09 | Report modal shell on `AccessibleDialog`                         | Delivered   | PR #170                               | `chrome="bare"`, `panelProps`                                                                                                                                                                                                                                       |
| HW-10 | Six reports wired to thirteen tiles                              | Delivered   | PR #170                               | Solar, Sun & Moon, Weather, Forecast, Emcomm, Band activity                                                                                                                                                                                                         |
| HW-11 | Honest empty states and freshness in reports                     | Delivered   | PR #170                               | "NONE MAPPED", per-feed `observedAt`                                                                                                                                                                                                                                |
| HW-12 | Classic and brass themes, picker, fonts on demand                | Delivered   | PR #171                               |                                                                                                                                                                                                                                                                     |
| HW-13 | Wall controls: map content, home region, Escape scoping          | Delivered   | PR #171                               |                                                                                                                                                                                                                                                                     |
| HW-14 | Kiosk scene HamClock pinning                                     | Delivered   | PR #171                               | `applySceneToMap.ts`                                                                                                                                                                                                                                                |
| HW-15 | Accessibility baseline: sr-only tables, focus return             | Delivered   | PR #170, #171                         |                                                                                                                                                                                                                                                                     |
| HW-16 | Style guide for tiles, reports and settings                      | Delivered   | `docs/guides/hamclock-tile-system.md` | this document set                                                                                                                                                                                                                                                   |
| HW-17 | Forecast horizon                                                 | Partial     | PR #169                               | 24 h, not 3 days: the wall's reliability grid is built from the two-day physics reliability forecast; FutureCast model horizons are not wired into the wall yet (`wall/tiles/ForecastMatrixTile.tsx`; horizons gated by `src/lib/propagation/runtimeActivation.ts`) |
| HW-18 | Weather alerts coverage                                          | Partial     | PR #169                               | nationwide feed, mapped geometry only                                                                                                                                                                                                                               |
| HW-19 | SDR decodes tile                                                 | Partial     | PR #169                               | idle until a shared receiver exists                                                                                                                                                                                                                                 |
| HW-20 | Auto-page dwell mode                                             | Not started |                                       | today only kiosk scenes rotate pages                                                                                                                                                                                                                                |
| HW-21 | Layer registry with provenance text                              | Not started |                                       | feeds settings, help, status line                                                                                                                                                                                                                                   |
| HW-22 | Header parity: WALL/DESK toggle and reduced top rail             | Not started |                                       | owner bug: no way back to wall from desk                                                                                                                                                                                                                            |
| HW-23 | Layers popover viewport clamp and trigger move (interim)         | Not started |                                       | owner bug: menu renders off screen                                                                                                                                                                                                                                  |
| HW-24 | Desk on wall tiles, paged, scale token                           | Not started |                                       | retires accordion sidebar                                                                                                                                                                                                                                           |
| HW-25 | Desk cleanup: DE station block, duplicate weather, DX target     | Not started |                                       |                                                                                                                                                                                                                                                                     |
| HW-26 | Centered settings panel with tabs                                | Not started |                                       | replaces all header popouts                                                                                                                                                                                                                                         |
| HW-27 | User-selected rails (Pages & Tiles tab, `railLayout`)            | Not started |                                       |                                                                                                                                                                                                                                                                     |
| HW-28 | World clocks bar                                                 | Not started |                                       | open decision D1                                                                                                                                                                                                                                                    |
| HW-29 | Trend charts in reports, chart components read theme tokens      | Not started |                                       | reuse `SolarMiniChart`, `SolarSeriesChart`, `MetricCard`                                                                                                                                                                                                            |
| HW-30 | Report pin                                                       | Not started |                                       |                                                                                                                                                                                                                                                                     |
| HW-31 | Best Band Now ranked table report                                | Not started |                                       |                                                                                                                                                                                                                                                                     |
| HW-32 | Lightning bolt glyph (2D and 3D)                                 | Not started |                                       | owner bug: white bloom dots                                                                                                                                                                                                                                         |
| HW-33 | Earthquakes tile and report (USGS)                               | Not started |                                       | open decision D4                                                                                                                                                                                                                                                    |
| HW-34 | Volcanoes tile and report (Smithsonian GVP)                      | Not started |                                       | open decision D4                                                                                                                                                                                                                                                    |
| HW-35 | Page taxonomy v2 (six pages, new tiles)                          | Not started |                                       | depends on HW-27, HW-33, HW-34                                                                                                                                                                                                                                      |
| HW-36 | Widget config contract and `hamclockWidgetConfigStore`           | Not started |                                       | section 12                                                                                                                                                                                                                                                          |
| HW-37 | News feeds config dialog (first configurable widget)             | Not started |                                       | over `feedStore`; verify-before-save via `api/feeds/rss.ts`                                                                                                                                                                                                         |
| HW-38 | Config dialogs: cluster, weather, band list, clocks, alerts      | Not started |                                       | one PR per widget                                                                                                                                                                                                                                                   |
| HW-39 | Map style chooser on the Map tab                                 | Not started |                                       | section 13                                                                                                                                                                                                                                                          |
| HW-40 | Weather page with seven weather tiles                            | Not started |                                       | section 16                                                                                                                                                                                                                                                          |
| HW-41 | Weather report: hero, trend charts, 7-day strip, pointer details | Not started |                                       | section 16                                                                                                                                                                                                                                                          |
| HW-42 | Radar report with 2D and 3D scrubber                             | Not started |                                       | reuse `RadarScrubber2D` / `RadarScrubber3D`                                                                                                                                                                                                                         |
| HW-43 | Lightning report                                                 | Not started |                                       | after HW-32                                                                                                                                                                                                                                                         |
| HW-44 | Weather configuration dialog                                     | Not started |                                       | HW-36 contract                                                                                                                                                                                                                                                      |
| HW-45 | Weather layers category on the Layers tab                        | Not started |                                       | HW-21 registry                                                                                                                                                                                                                                                      |
| HW-46 | AtmosPulse 2D layers available in 2D and 3D on the map           | Not started |                                       | twelve layers                                                                                                                                                                                                                                                       |
| HW-47 | Monitored regions and RIM scores as a report                     | Not started |                                       |                                                                                                                                                                                                                                                                     |
| HW-48 | EmComm forms and activation from the Emcomm tile                 | Not started |                                       |                                                                                                                                                                                                                                                                     |
| HW-49 | `/atmos` redirect or deep link                                   | Not started |                                       | open decision D7                                                                                                                                                                                                                                                    |

Totals: 16 delivered, 3 partial, 30 not started.

## 21. Open decisions

| ID  | Question                                                                      | Recommendation                                                              |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| D1  | World clock count and default cities                                          | Up to 6; wall preset Honolulu, Denver, New York, London                     |
| D2  | Does desk hide the SDR page                                                   | Hide unless a receiver is configured, same as wall                          |
| D3  | Can a user place the same tile twice (both rails on one page)                 | Yes, the shipped pages already do it for Best band now                      |
| D4  | Earth event feeds now or after the settings panel                             | After HW-26; they are additive and do not block the bug list                |
| D5  | Desk scale value                                                              | Start at 0.72 and tune on a 1440p monitor                                   |
| D6  | Does the tile gear appear at wall density, or only in the report and settings | Report and settings only at wall; gear on tile at desk                      |
| D7  | Retire the `/atmos` route after parity, or keep it as a deep link             | Redirect to the map Weather page; keep `/atmos` as an alias for one release |

## 22. Delivery order

1. HW-22, HW-23, HW-32 — header parity, layers clamp, lightning glyph (the production bug list).
2. HW-20, HW-21, HW-26 — auto-page, layer registry, settings panel.
3. HW-24, HW-25, HW-27 — desk on tiles, desk cleanup, user-selected rails.
4. HW-29, HW-30, HW-31 — charts, pin, Best Band table.
5. HW-36, HW-37, HW-39 — widget config contract, news feeds dialog, map style chooser.
6. HW-28, HW-33, HW-34, HW-35, HW-38 — world clocks, earth events, taxonomy v2, remaining config dialogs.
7. HW-40 to HW-49 — weather consolidation and AtmosPulse retirement.
