# HamClock Wall and Desk Specification

> Living specification for the HamClock view (`/map` in HamClock layout).
> Updated 2026-09-05 after PRs #167, #169, #170 and #171 shipped and the owner's
> first production review. The feature register at the end is the traceability
> record: every row is either shipped with evidence or still open.

Related documents:

- Style guide: `docs/guides/hamclock-tile-system.md` (rules every tile, report and settings row follows)
- Layer provenance: `docs/PROP-SPHERE-LAYER-SOURCE-AUDIT.md`
- Data truthfulness: `docs/decisions/ADR-SOLAR-DATA-TRUTH.md`
- Delivery tracking: `docs/FEATURE-TRACKER.md` section 14

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

| Principle                          | Rule                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| One visual language                | Wall and desk use the same tiles, pages, reports and settings. Only scale and rail treatment differ.                                   |
| Primary controls never move        | Mode, WALL/DESK, projection and SETTINGS live in the same header slot in both densities. A control that moves between modes is a bug.  |
| No scrolling inside tiles or rails | A tile shows a summary that fits. A rail pages. Overflow is a design failure, not a scrollbar.                                         |
| No hover menus, no flyouts         | Menus open on click and close on close, Escape or backdrop. Detail views are centered dialogs over the map, never side panels.         |
| Click opens a report               | The whole tile is the click target. The report is the enlarged, interactive version of the tile.                                       |
| Source and freshness on everything | Tiles carry a sub line with the source or age; reports carry a footer `DATA: source · UPDATED hh:mm UTC · age`.                        |
| Honest empty states                | "NONE MAPPED", "WAITING", "NO RECEIVER". Never "ALL CLEAR" for a feed that does not cover the question.                                |
| Simplicity wins                    | A tile with one clear value beats a tile with six. When in doubt, show less.                                                           |
| One tile, one place                | A tile appears at most once on screen at a time. The store rejects duplicates on a page and the picker greys out tiles already placed. |
| Configurable the same way          | A widget with options has a gear that opens a centered config dialog with segmented choices. See section 13.                           |
| Themeable from the start           | Every colour, font, radius and glow is a `--hc-*` token. Tiles never hard-code a colour.                                               |

## 3. Densities

| Aspect         | Wall (default)                                           | Desk                                                      |
| -------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| Map            | Full bleed behind everything                             | Full bleed, rails docked                                  |
| Rails          | Translucent glass (`--hc-glass`, `--hc-blur`)            | Opaque panel (`--hc-panel`), hairline separators          |
| Rail content   | Both rails follow the active page                        | Same                                                      |
| Scale          | `--hc-scale: 1` (vh-based tokens in `hamclock-wall.css`) | `--hc-scale` around 0.72, tuned by eye on a 1440p monitor |
| Tiles per rail | 4 left, 5 right per page, no tile twice on a page        | 5 left, 6 right per page, no tile twice on a page         |
| Auto-page      | On by default                                            | Off by default                                            |
| Header         | Dual clocks, callsign, grid, mode, WALL/DESK, SETTINGS   | Same header, same order                                   |

Desk today still renders the legacy accordion sidebar (`HamClockSidebar`,
`HamClockLocationConditions`, `BandConditionsPanel`). That layout is retired by
HW-24 and HW-25 below: desk becomes the wall tiles at desk scale.

## 4. Page taxonomy

Pages are data (`src/components/map/hamclock/wall/pages.ts`). The shipped set
has five pages; the target set has six. Tiles marked _new_ do not exist yet.

Both rails follow the active page. Each page defines a left set and a right set
of different tiles; no rail is fixed to one widget, and no tile appears twice on
a page. The shipped composition breaks both rules (Best band now on both rails,
Band activity pinned to the right rail on most pages) and is corrected by HW-54.
The only element that stays across pages is the optional user-chosen pinned tile
(section 6).

| #   | Page                       | Left rail                                                        | Right rail                                                          |
| --- | -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Space weather              | X-ray, Solar wind, Space Wx (G/S/R + Kp), Sun                    | Aurora _new_, Moon, Grey line, MUF, Reliability                     |
| 2   | Band conditions & forecast | Best band now, MUF, 24h band forecast, Reliability               | Band activity, DX cluster, Grey line, Sun, X-ray                    |
| 3   | Contact activity           | DX cluster, Band activity, Recent contacts, Watch matches _new_  | Best band now, Grey line, MUF, Reliability, Emcomm                  |
| 4   | Weather (section 17)       | Local weather, Hourly _new_, Radar _new_, Earthquakes _new_      | 7-day _new_, Lightning _new_, Volcanoes _new_, Moon, Weather alerts |
| 5   | News & alerts              | DX news _new_, Contests _new_, DXpeditions _new_, Weather alerts | Emcomm, Earthquakes _new_, Volcanoes _new_, Local weather, Space Wx |
| 6   | SDR (optional)             | Band scope, Decodes                                              | Band activity, DX cluster, Best band now                            |

The SDR page is hidden when no receiver is configured. See open decision D2 for
whether desk hides it always.

## 5. Auto-page

- Default dwell is 30 seconds per page. Both rails move together to the same page index.
- On by default at wall density, off at desk. Persisted in `hamclockDisplayStore` as `autoPage: { enabled, dwellSec }`.
- Any pointer, key or touch interaction on the rails or header pauses rotation. Rotation resumes after 60 seconds of quiet.
- An `AUTO` toggle sits beside the pager in the footer and is repeated on the Pages & Tiles settings tab.
- A pinned report (section 9) stays open while pages rotate underneath.
- Kiosk scenes remain the mechanism for custom playlists that mix HamClock pages with other routes. They pin a page via `KioskSceneMapConfig.hamclock` and suspend auto-page while active.

## 6. User-selected rails

Operators choose what each rail shows on each page.

### Interaction

- Settings panel, tab **Pages & Tiles**.
- Every available tile is shown as a large card with a live miniature preview, its title, and the page it currently belongs to.
- The operator picks a page, then a rail, and toggles tiles on or off for that slot. Order is changed with up/down buttons (drag is optional, buttons are required for keyboard and remote use).
- Each rail on each page has a slot limit (wall 4/5, desk 5/6). The panel shows `3 of 5 used` and disables further additions at the limit.
- A tile can be placed once per page across both rails. Tiles already on the page are greyed out in the picker with the label `ON LEFT RAIL` / `ON RIGHT RAIL`.
- A **Reset to shipped layout** button restores the defaults.
- **Pinned tile (optional):** one user-chosen tile can be pinned to the top of a rail on every page. It is the only element that survives a page change, and it counts toward that page's uniqueness rule, so a page that also lists it shows it once.

### Data model

```ts
type RailSide = "left" | "right";
interface RailPage {
  pageId: string; // matches HAMCLOCK_WALL_PAGES[].id
  tileIds: TileId[]; // ordered, length ≤ slot limit for the density
}
railLayout: Record<RailSide, RailPage[]>;
pinnedTile?: { side: RailSide; tileId: TileId };
```

- Stored in `hamclockDisplayStore` (bump `version`, migrate by seeding `railLayout` from `HAMCLOCK_WALL_PAGES`).
- Unknown `tileIds` from a retired tile are dropped at read time; unknown `pageId`s are dropped and the shipped page is appended so the pager never shows an empty page.
- `setRailLayout` validates before write: a page with the same `tileId` on both rails, or twice on one rail, is rejected and the previous layout stays (HW-50). Migration de-duplicates the shipped pages the same way.
- Kiosk pins reference page ids, not indexes, once this lands. `KioskSceneHamClockConfig.leftPage` / `rightPage` are numeric today (`kioskStore.ts`), so this is a `kioskStore` version bump plus a migration that maps each saved scene's indexes onto `HAMCLOCK_WALL_PAGES[index].id`.

## 7. Use presets

Not every wall belongs to an active operator. Some people want a weather
display, or news and an earth view in the living room, with no radio at all. A
preset is a saved `railLayout`, auto-page settings, and a suggested theme.

| Preset          | Pages                                        | Auto-page | Theme   |
| --------------- | -------------------------------------------- | --------- | ------- |
| Radio (default) | the six shipped pages                        | on, 30 s  | pulse   |
| Weather wall    | Weather, News & alerts                       | on, 45 s  | classic |
| News & Earth    | News & alerts, Weather (earth events first)  | on, 45 s  | brass   |
| Space weather   | Space weather, Band conditions & forecast    | on, 30 s  | pulse   |
| Living room     | one page: clocks, local weather, 7-day, news | off       | classic |

- Presets are chosen at the top of the **Pages & Tiles** tab as large cards with a preview. Choosing one replaces `railLayout` and the auto-page settings; the theme is offered, not forced.
- Users can save the current layout as their own preset (`presets: Array<{ id, name, layout, autoPage }>` in `hamclockDisplayStore`); shipped presets live in `wall/presets.ts`.
- **No radio dependency (HW-53):** a tile that needs a callsign or station location (Best band now, DX cluster, Grey line, Recent contacts, MUF at QTH) shows a neutral state such as `SET HOME IN SETTINGS` when no station is set. It never errors, never blocks the page, and the Living room preset never places one.

## 8. Tile grammar

A tile is three lines and nothing more:

1. **Title** — small caps, `--hc-t-title`, `--hc-dim`.
2. **Hero** — one value, `--hc-t-hero` (or `--hc-t-hero-lg` for a single-word verdict), display font, tone class.
3. **Sub line** — one line, `--hc-t-body`, context or freshness ("36 obs · 30 rx", "as of 10:52 MDT").

Rules:

- The tile is a semantic `<section>`; when it has a report, a transparent full-bleed sibling `<button>` (`.hc-tile-open`) overlays it so the heading and values stay outside the control (`HamClockTile.tsx`). `onOpen` opens the report; `openLabel` names the button for assistive technology. Any further control, such as the config gear, is a sibling button positioned in the tile corner, never nested inside the overlay.
- Tone comes from `hc-good`, `hc-warn`, `hc-bad`, `hc-info-text`, `hc-accent-text`, `hc-dim-text`. Tiles never pick a hex.
- Size tokens are vh-based (`hamclock-wall.css`) and multiplied by `--hc-scale` for desk.
- A tile may add one small graphic (moon phase, sun arc, four-dot forecast ladder) in place of the sub line, never in addition to it.
- **Hero text must fit its container.** The hero size is `clamp()`ed on the vh token and the tile is a size container (`container-type: inline-size`) so long values scale with the rail width in `cqw` units. On top of that, `HamClockTile` classifies the hero string by length — short (≤ 4 chars, `--hc-t-hero-lg`), medium (≤ 8, `--hc-t-hero`), long (`--hc-t-hero-long`, a new token) — and applies the matching class. A value that still overflows is measured after layout and shrunk one step. Clipping is a bug. `overflow: hidden` is never the fix. Tests assert the class for each length band and that "NO MAPPED ALERTS" renders without overflow at 1080p and 2160p wall (HW-51).

Shipped tiles live in `src/components/map/hamclock/wall/tiles/` and are
registered in `tiles/index.ts`.

## 9. Report anatomy

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

## 10. Best Band Now report

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

## 11. World clocks bar

- The top rail gains a row of city clocks between the callsign block and the local/UTC hero clocks.
- Configurable in Settings → Display: up to N clocks (open decision D1), each with city label and IANA zone. Default set is empty at desk and a four-city preset at wall.
- Clocks use `formatClock(date, zone)`; the local and UTC hero clocks keep their size and stay right-aligned.
- Wall only by default; desk may enable it, at which point the header height token grows.

## 12. Settings panel

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

## 13. Widget configuration dialogs

Most feature widgets are configurable, and they are all configured the same
way. A tile or report that has options shows a gear; the gear opens a centered
configuration dialog on the same shell as reports and under the same
big-control rules (section 12).

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
// wall/tiles/index.ts — the registry erases T only here
export function registerWidgetConfig<T>(
  id: TileId,
  config: WidgetConfig<T>,
): void;
// `WALL_TILES[id].config` is typed `WidgetConfig<unknown>` for the dialog shell;
// a `WidgetConfig<Specific>` is not assignable to it under strict function
// checks, so tiles register through the helper instead of assigning directly.
```

- Persisted per tile id in a new `hamclockWidgetConfigStore` (`widgets: Partial<Record<TileId, unknown>>`; only configured tiles have entries), validated through `schema` on read so a stale shape falls back to `defaults`. Widgets that already own a store (`feedStore`, `dxStore` filters) keep it and expose a `ConfigPanel` over it instead of duplicating state.
- Choices are segmented big buttons, never dropdowns. Free text only where the value is genuinely free (a name, a URL).
- No scrolling inside the dialog. Lists longer than eight rows paginate by category tab.
- User-entered URLs are verified before save through the existing `api/_lib/handlers/rssFeed.ts` handler, never from the browser. The handler is an SSRF boundary and keeps its controls unchanged. ADD is disabled until VERIFY returns a parsed title and item count.
- The gear is a sibling button in the tile corner, at least 44 × 44 px, layered above the full-bleed open button, and does not open the report.

### First configurable widgets

| Order | Widget                     | Settings                                                     | Existing state                                       |
| ----- | -------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| 1     | News feeds (ticker + tile) | fetch interval, max age, feed rows, custom feeds             | `feedStore` (`FeedSource`, `TickerCrawlPreferences`) |
| 2     | DX cluster tile            | band, mode, continent and age filters                        | `dxStore.filters` (`DXClusterFilters`)               |
| 3     | Weather tile               | location (home / DX target / custom grid), units override    | `hamclockDisplayStore.units`                         |
| 4     | Band activity / Best band  | band list shown, minimum spot count                          | `BAND_ORDER`                                         |
| 5     | World clocks               | city list and zones (section 11)                             | new                                                  |
| 6     | Weather alerts             | alert area (home county / state / radius) and severity floor | `TickerCrawlPreferences.weatherThreshold`            |

The DX news ticker (`DXNewsTicker.tsx`) becomes the first configurable widget
because its feed list, crawl preferences and edge proxy already exist; the work
is the dialog, not the plumbing.

## 14. Map style chooser

A centered `SELECT MAP STYLE` list under the settings panel's Map tab, using the
same row anatomy as the Layers tab:

- Row: thumbnail swatch, name, one provenance or behaviour line, selected indicator dot, ON-style select target.
- Keyboard hint line at the bottom: `SELECT to apply · BACK to cancel`.
- Selecting applies live; BACK or Escape restores the previous style.

Mapped onto what the renderers support today. `mapStore` persists only the
two-value `mapStyle`; `selectTileProvider()` in `src/lib/tiles/providers.ts`
picks Mapbox for Pro and Esri for free on satellite, and always OSM on
standard. CARTO dark exists as a provider but is never selected.

| Row          | Existing state          | Behaviour line                               |
| ------------ | ----------------------- | -------------------------------------------- |
| Satellite    | `mapStyle: "satellite"` | "ESRI World Imagery (Mapbox · Maxar on Pro)" |
| Standard     | `mapStyle: "standard"`  | "OpenStreetMap · roads and labels"           |
| Night lights | `layers.nightLights`    | "Black Marble city lights on the dark side"  |

Making Esri / Mapbox and OSM / CARTO dark individually selectable needs a
persisted provider id in `mapStore` (HW-55, batch B6): add `tileProviderId`
with a version bump and a migration that derives it from `mapStyle` and tier,
and teach `selectTileProvider()` to honour it before falling back to the tier
rule.

Layer presets (`LAYER_PRESETS`: dx-hunter, contest, vhf, emergency, science) sit
below the styles on the same tab as a second row group. A style that auto-swaps
by month is not something we have today; if a seasonal Blue Marble basemap is
added later it gets a row with an "auto-swaps 1st of month" behaviour line.

### Bottom bar (not adopted)

The reference screenshot's bottom bar (PREV / NEXT / NEWS / MENU / STYLE /
LAYERS / SETTINGS / KEYS / HELP / POWER) is the source of the "few primary
controls plus SETTINGS" rule in section 2. We do not adopt it. The wall keeps
its controls in the top rail; style and layers live inside SETTINGS.

## 15. Desk cleanup

- The DE STATION identity block (callsign, grid, coordinates) is removed. The header already shows it.
- Home weather appears once, in the weather tile.
- A **DX TARGET** tile replaces the DX Target accordion: target grid as hero, distance and bearing as the sub line, target weather in the report.

## 16. Lightning

- 3D: each strike is a billboard sprite of a classic bolt glyph (canvas-drawn, yellow-white on the pulse theme, tone token driven), sized in screen space. Fresh strikes pulse once and fade over the existing window. Replaces the additive-blended spheres in `LightningOverlay3D.tsx`.
- 2D: a symbol layer with the same bolt icon replaces the circle layer in `LightningLayer2D.tsx`.
- No additive blending on the core glyph. Glow is a single subtle halo controlled by `--hc-glow`.

## 17. Weather system consolidation

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
- **Weather report** with the section 9 anatomy: hero (current conditions and one-word state), trend charts (temperature, wind, pressure over 24 h), a 7-day strip, and pointer-over details on every chart point. Radar and lightning open their own reports with the scrubber as the interactive element.
- **Weather layers** under the settings Layers tab as one category, generated from the layer registry (HW-21): radar, lightning, clouds, alerts, fires, cyclones, river gauges, SST. APRS, repeaters, shadow zones and TEC move to the categories they belong to.
- **Weather configuration dialog** (section 13 contract): location (home / DX target / custom grid), units override, radar cadence (5 / 10 / 15 min), alert area (county / state / radius) and severity floor.
- **EmComm** keeps its forms and activation flow; they open as reports from the Emcomm tile.

### Migration path

1. Build the page, tiles, reports and config dialog inside the wall (HW-40 to HW-45).
2. Port each AtmosPulse layer into the registry so the Layers tab and the map render them in both 2D and 3D (HW-46).
3. Move the region manager and RIM cards into a report opened from the alerts tile (HW-47).
4. Once the parity checklist is green, the `/atmos` route redirects to the map in HamClock layout on the Weather page, or stays as a deep link (open decision D7).

### Parity checklist

Rows HW-40 to HW-49 in the feature register. All are Not started.

## 18. Earth events

- **Earthquakes**: USGS GeoJSON feed, M4.0+ past 24 h, no key. Tile hero = count with largest magnitude; report = table (mag, location, depth, age) plus map markers.
- **Volcanoes**: Smithsonian GVP weekly report, no key. Tile hero = active count; report = list with country and last activity.
- Both live on the Weather & Earth events page. Feeds are proxied by edge functions with the standard rate limit.

## 19. Themes

- `pulse` (default, cyberpunk), `classic` (elegant serif, no glow), `brass` (nautical). Tokens in `src/styles/hamclock-themes.css`.
- State colours derive from the colour-blind palette tokens, so a theme never overrides good/warn/bad.
- Fonts for non-pulse themes are fetched on demand (`ensureHamClockThemeFont`) from both the wall and desk roots.
- The theme picker (`HamClockThemePicker`) renders a miniature tile per theme.

## 20. Accessibility

- Every visual grid has an `sr-only` semantic table (forecast report sets the pattern).
- Dialogs trap focus and return it to the opener.
- Escape closes the innermost open thing: report, then settings, then HamClock itself. Handlers stop propagation at each layer.
- Arrow keys page the rails; `AUTO` is a labelled toggle.

## 21. Feature register

| ID    | Feature                                                                                     | Status      | Evidence                              | Notes                                                                                                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------- | ----------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HW-01 | Wall shell: full-bleed map, header, paged rails, pager                                      | Delivered   | PR #167                               | `wall/HamClockWall.tsx`                                                                                                                                                                                                                                             |
| HW-02 | Theme token layer and pulse theme                                                           | Delivered   | PR #167                               | `src/styles/hamclock-themes.css`                                                                                                                                                                                                                                    |
| HW-03 | Display store: density, theme, units, page index, migrations                                | Delivered   | PR #167, #169                         | `hamclockDisplayStore` v3                                                                                                                                                                                                                                           |
| HW-04 | Unit resolution (auto / imperial / metric)                                                  | Delivered   | PR #167                               | `src/lib/hamclock/units.ts`                                                                                                                                                                                                                                         |
| HW-05 | Keyboard paging and footer pager                                                            | Delivered   | PR #167                               |                                                                                                                                                                                                                                                                     |
| HW-06 | Sixteen live tiles                                                                          | Delivered   | PR #169                               | `wall/tiles/index.ts`                                                                                                                                                                                                                                               |
| HW-07 | Wall as default density                                                                     | Delivered   | PR #169                               | migrate `< 3` sets wall                                                                                                                                                                                                                                             |
| HW-08 | Page taxonomy v1 (five pages)                                                               | Delivered   | PR #169                               | `wall/pages.ts`                                                                                                                                                                                                                                                     |
| HW-09 | Report modal shell on `AccessibleDialog`                                                    | Delivered   | PR #170                               | `chrome="bare"`, `panelProps`                                                                                                                                                                                                                                       |
| HW-10 | Six reports wired to thirteen tiles                                                         | Delivered   | PR #170                               | Solar, Sun & Moon, Weather, Forecast, Emcomm, Band activity                                                                                                                                                                                                         |
| HW-11 | Honest empty states and freshness in reports                                                | Partial     | PR #170                               | empty states shipped; `WeatherReport.tsx` puts the condition text in the `updated` slot and `LocalWeatherData` has no observation timestamp, so the source · updated · age footer is not met on every report; closed by B9                                          |
| HW-12 | Classic and brass themes, picker, fonts on demand                                           | Delivered   | PR #171                               |                                                                                                                                                                                                                                                                     |
| HW-13 | Wall controls: map content, home region, Escape scoping                                     | Delivered   | PR #171                               |                                                                                                                                                                                                                                                                     |
| HW-14 | Kiosk scene HamClock pinning                                                                | Delivered   | PR #171                               | `applySceneToMap.ts`                                                                                                                                                                                                                                                |
| HW-15 | Accessibility baseline: sr-only tables, focus return                                        | Delivered   | PR #170, #171                         |                                                                                                                                                                                                                                                                     |
| HW-16 | Style guide for tiles, reports and settings                                                 | Delivered   | `docs/guides/hamclock-tile-system.md` | this document set                                                                                                                                                                                                                                                   |
| HW-17 | Forecast horizon                                                                            | Partial     | PR #169                               | 24 h, not 3 days: the wall's reliability grid is built from the two-day physics reliability forecast; FutureCast model horizons are not wired into the wall yet (`wall/tiles/ForecastMatrixTile.tsx`; horizons gated by `src/lib/propagation/runtimeActivation.ts`) |
| HW-18 | Weather alerts coverage                                                                     | Partial     | PR #169                               | nationwide feed, mapped geometry only                                                                                                                                                                                                                               |
| HW-19 | SDR decodes tile                                                                            | Partial     | PR #169                               | idle until a shared receiver exists                                                                                                                                                                                                                                 |
| HW-20 | Auto-page dwell mode                                                                        | Not started |                                       | today only kiosk scenes rotate pages                                                                                                                                                                                                                                |
| HW-21 | Layer registry with provenance text                                                         | Delivered   | PR #222                               | feeds settings, help; no distinct wall status line component exists to feed (see B6 report)                                                                                                                                                                         |
| HW-22 | Header parity: WALL/DESK toggle and reduced top rail                                        | Delivered   | PR #216                               | mode · WALL \| DESK · projection · Display in one fixed slot at both densities; owner bug (no way back to wall from desk) closed                                                                                                                                    |
| HW-23 | Layers popover viewport clamp and trigger move (interim)                                    | Delivered   | PR #216                               | `LayersPopover` clamps to the viewport on open and resize; owner bug (menu renders off screen) closed                                                                                                                                                               |
| HW-24 | Desk on wall tiles, paged, scale token                                                      | Not started |                                       | retires accordion sidebar                                                                                                                                                                                                                                           |
| HW-25 | Desk cleanup: DE station block, duplicate weather, DX target                                | Not started |                                       |                                                                                                                                                                                                                                                                     |
| HW-26 | Centered settings panel with tabs                                                           | Delivered   | PR #221                               | replaces all header popouts                                                                                                                                                                                                                                         |
| HW-27 | User-selected rails (Pages & Tiles tab, `railLayout`)                                       | Delivered   | PR #234                               |                                                                                                                                                                                                                                                                     |
| HW-28 | World clocks bar                                                                            | Not started |                                       | open decision D1                                                                                                                                                                                                                                                    |
| HW-29 | Trend charts in reports, chart components read theme tokens                                 | Not started |                                       | reuse `SolarMiniChart`, `SolarSeriesChart`, `MetricCard`                                                                                                                                                                                                            |
| HW-30 | Report pin                                                                                  | Not started |                                       |                                                                                                                                                                                                                                                                     |
| HW-31 | Best Band Now ranked table report                                                           | Not started |                                       |                                                                                                                                                                                                                                                                     |
| HW-32 | Lightning bolt glyph (2D and 3D)                                                            | Delivered   | PR #217                               | `src/lib/map/lightningGlyph.ts`; owner bug (white bloom dots) fixed                                                                                                                                                                                                 |
| HW-33 | Earthquakes tile and report (USGS)                                                          | Not started |                                       | open decision D4                                                                                                                                                                                                                                                    |
| HW-34 | Volcanoes tile and report (Smithsonian GVP)                                                 | Not started |                                       | open decision D4                                                                                                                                                                                                                                                    |
| HW-35 | Page taxonomy v2 (six pages, new tiles)                                                     | Not started |                                       | depends on HW-27, HW-33, HW-34                                                                                                                                                                                                                                      |
| HW-36 | Widget config contract and `hamclockWidgetConfigStore`                                      | Not started |                                       | section 13                                                                                                                                                                                                                                                          |
| HW-37 | News feeds config dialog (first configurable widget)                                        | Not started |                                       | over `feedStore`; verify-before-save via `api/feeds/rss.ts`                                                                                                                                                                                                         |
| HW-38 | Config dialogs: cluster, weather, band list, clocks, alerts                                 | Not started |                                       | one PR per widget                                                                                                                                                                                                                                                   |
| HW-39 | Map style chooser on the Map tab                                                            | Delivered   | PR #222                               | section 14                                                                                                                                                                                                                                                          |
| HW-40 | Weather page with seven weather tiles                                                       | Not started |                                       | section 17                                                                                                                                                                                                                                                          |
| HW-41 | Weather report: hero, trend charts, 7-day strip, pointer details                            | Not started |                                       | section 17                                                                                                                                                                                                                                                          |
| HW-42 | Radar report with 2D and 3D scrubber                                                        | Not started |                                       | reuse `RadarScrubber2D` / `RadarScrubber3D`                                                                                                                                                                                                                         |
| HW-43 | Lightning report                                                                            | Not started |                                       | after HW-32                                                                                                                                                                                                                                                         |
| HW-44 | Weather configuration dialog                                                                | Not started |                                       | HW-36 contract                                                                                                                                                                                                                                                      |
| HW-45 | Weather layers category on the Layers tab                                                   | Not started |                                       | HW-21 registry                                                                                                                                                                                                                                                      |
| HW-46 | AtmosPulse 2D layers available in 2D and 3D on the map                                      | Not started |                                       | twelve layers                                                                                                                                                                                                                                                       |
| HW-47 | Monitored regions and RIM scores as a report                                                | Not started |                                       |                                                                                                                                                                                                                                                                     |
| HW-48 | EmComm forms and activation from the Emcomm tile                                            | Not started |                                       |                                                                                                                                                                                                                                                                     |
| HW-49 | `/atmos` redirect or deep link                                                              | Not started |                                       | open decision D7                                                                                                                                                                                                                                                    |
| HW-50 | Duplicate guard: store validation and picker grey-out                                       | Delivered   | PR #218                               | owner: duplicate panels on screen                                                                                                                                                                                                                                   |
| HW-51 | Hero text fit: clamp, container units, length classes, tests                                | Delivered   | PR #218                               | owner: text clips outside the widget                                                                                                                                                                                                                                |
| HW-52 | Use presets: five shipped, user-saved                                                       | Delivered   | PR #234                               | section 7                                                                                                                                                                                                                                                           |
| HW-53 | No radio dependency: station tiles degrade to a neutral state                               | Delivered   | PR #234                               | section 7                                                                                                                                                                                                                                                           |
| HW-54 | Both rails follow the page; remove fixed band-activity slot; de-duplicated shipped pages    | Delivered   | PR #218                               | owner: right rail locked                                                                                                                                                                                                                                            |
| HW-55 | Persist a tile provider id in `mapStore` so Esri / Mapbox and OSM / CARTO become selectable | Delivered   | PR #222                               | migration derives it from `mapStyle` + tier; section 14                                                                                                                                                                                                             |
| HW-56 | `EngineComparisonStrip`: physics / nowcast / observed on every model-backed report          | Not started |                                       | section 26.1; also added to the Best band report                                                                                                                                                                                                                    |
| HW-57 | MUF report: ionosphere facts, hop table, usable-window chart                                | Not started |                                       | section 26.2                                                                                                                                                                                                                                                        |
| HW-58 | Reliability report: SNR, confidence, station inputs, three-engine chart                     | Not started |                                       | section 26.3                                                                                                                                                                                                                                                        |
| HW-59 | Propagation forecast report: 48 h band chart, matrix tab, FutureCast horizons tab           | Not started |                                       | section 26.4                                                                                                                                                                                                                                                        |
| HW-60 | Solar report: SFI, SSN, flux forecast, cycle 25 chart                                       | Not started |                                       | section 26.5                                                                                                                                                                                                                                                        |
| HW-61 | X-ray and flares report: flux curve with B/C/M/X, latest flare, D-RAP, probabilities        | Not started |                                       | section 26.6                                                                                                                                                                                                                                                        |
| HW-62 | Solar wind and geomagnetic report: Bz / speed / density, Kp, Dst, aurora, CMEs, protons     | Not started |                                       | section 26.7                                                                                                                                                                                                                                                        |
| HW-63 | Sun report: rise / noon / set, twilights, elevation curve, day-length trend                 | Not started |                                       | section 26.8                                                                                                                                                                                                                                                        |
| HW-64 | Grey line report: per-band 160/80/40 tiers, windows, target overlap                         | Not started |                                       | section 26.9                                                                                                                                                                                                                                                        |
| HW-65 | EME computation module `src/lib/utils/eme.ts`                                               | Not started |                                       | new: path loss, declination and sky noise, mutual window, Doppler                                                                                                                                                                                                   |
| HW-66 | Moon and EME report                                                                         | Not started |                                       | section 26.10; depends on HW-65                                                                                                                                                                                                                                     |
| HW-67 | Open-Meteo fetch extended to hourly and 7-day                                               | Not started |                                       | `src/lib/api/openMeteo.ts`; return shape stays a superset                                                                                                                                                                                                           |
| HW-68 | Alerts report: severity, area, expiry, map link, 24 h count chart                           | Not started |                                       | section 26.12                                                                                                                                                                                                                                                       |
| HW-69 | Radio Impact Model tile                                                                     | Not started |                                       | new wall tile over `computeRIM` / `useRIM`; section 26.13                                                                                                                                                                                                           |
| HW-70 | Band activity report: per-band counts over time, mode split, top DX                         | Not started |                                       | section 26.14                                                                                                                                                                                                                                                       |
| HW-71 | Recent contacts report: log statistics and 30-day chart                                     | Not started |                                       | section 26.15                                                                                                                                                                                                                                                       |
| HW-72 | DX cluster modal adopts the report chrome, pin and footer                                   | Not started |                                       | section 26.16; chrome only, no new data                                                                                                                                                                                                                             |
| HW-73 | Model track: weather-derived features in NowCast                                            | Not started |                                       | section 26.17; backlog, after every panel is live                                                                                                                                                                                                                   |

Totals: 28 delivered, 4 partial, 41 not started.

## 22. Open decisions

D3 (the same tile on both rails) is closed: the answer is no, and it is now the
"One tile, one place" principle in section 2.

| ID  | Question                                                                      | Recommendation                                                              |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| D1  | World clock count and default cities                                          | Up to 6; wall preset Honolulu, Denver, New York, London                     |
| D2  | Does desk hide the SDR page                                                   | Hide unless a receiver is configured, same as wall                          |
| D4  | Earth event feeds now or after the settings panel                             | After HW-26; they are additive and do not block the bug list                |
| D5  | Desk scale value                                                              | Start at 0.72 and tune on a 1440p monitor                                   |
| D6  | Does the tile gear appear at wall density, or only in the report and settings | Report and settings only at wall; gear on tile at desk                      |
| D7  | Retire the `/atmos` route after parity, or keep it as a deep link             | Redirect to the map Weather page; keep `/atmos` as an alias for one release |

## 23. Working the register

Batches are farmed out as GitHub issues, one issue per batch, so ownership is
visible. The flow:

1. Pick the issue for a batch. Claim it by assigning yourself or commenting `claiming`. One person per batch; if a batch is claimed, pick the next.
2. Read `docs/guides/hamclock-tile-system.md` first. Then read the batch brief below; it is written to stand on its own.
3. Branch from `origin/main` in a worktree: `feat/hamclock-b<N>-<slug>` (for example `feat/hamclock-b3-lightning-glyph`).
4. Open a PR against `main` titled `feat(hamclock): <scope> [B<N>: HW-xx, HW-yy]`, referencing the issue (`Closes #<issue>`) and the HW ids. Keep it at or under 15 files.
5. Bots review (Codex, Copilot, Sourcery). Address every thread: push a fix or reply with the reason, then resolve. The maintainer merges with a merge commit; contributors do not merge.
6. In the same PR, flip the batch's rows in the feature register (section 21) and in `docs/FEATURE-TRACKER.md` section 13 to Delivered with the PR number as evidence, and update the summary and Grand Total rows there.

Status flows issue open → claimed → PR open → merged → register rows Delivered.
A batch is not done until the register says so.

### Project board

Work is tracked on the GitHub Project **ProPulse Delivery**
(<https://github.com/users/crypticpy/projects/4>), one item per batch issue.
The umbrella checklist is issue #213; batch issues are #197 to #212 and are
linked from each heading in section 24.

| Field        | Values                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Status       | Backlog → Ready → Claimed → In progress → In review → Done                                                        |
| Workstream   | HamClock Wall · Weather (AtmosPulse fold-in) · Profile & Shack · Forecast engine · Band Health · Platform & infra |
| Batch        | the B-id                                                                                                          |
| Register IDs | the HW ids the batch covers                                                                                       |
| Agent        | Unclaimed · Human · Claude · Codex · Cursor · Grok · Other                                                        |
| Priority     | P1 bug · P2 core · P3 expansion                                                                                   |
| Assignees    | the owner of the work                                                                                             |

- Contributors, human or agent, pick only items in **Ready**.
- Claiming = set Agent, assign yourself, move the item to **Claimed**. Move it to **In progress** when the branch exists.
- Opening the PR moves the item to **In review**. Merging moves it to **Done**.
- B1 to B3 are P1 bug and Workstream HamClock Wall; B4 to B12 are P2 core, HamClock Wall; B13 to B16 are P3 expansion, Weather (AtmosPulse fold-in).
- B17 to B21 and B24 are P2 core, Workstream HamClock Wall; B22 and B23 are P3 expansion, Weather (AtmosPulse fold-in); B25 is P3 expansion, Workstream Forecast engine. Issues #225–#233 (B17–B25) are on the board as Backlog until B9 merges.

## 24. Development breakdown

Each batch is one PR of at most 15 files and one self-contained brief. Batches
ship in this order: the production bug list first (B1 to B3), then rails
unlock and presets (B4), the settings panel (B5, B6), auto-page (B7), desk on
tiles (B8), charts, pin and table (B9), config dialogs (B10, B11), earth
events (B12), and weather consolidation (B13 to B16). B17 to B25 build the
dedicated reports of section 26. `§` references point to
`docs/guides/hamclock-tile-system.md`.

**Order of delivery.** B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8 → **B9** → B10 →
B11 → B12 → B13 → B14 → B15 → B16, then the dedicated reports:

1. **B9 first.** Chart primitives, the report pin, the footer contract and the Best band table are the foundation every dedicated report builds on. No report batch starts before B9 merges.
2. **B17** — the engine strip lands with the first report that needs it. B18, B19, B20, B21 and B24 all import it, so nothing in that set starts before B17 merges.
3. **B18, B19, B20, B21** — independent of each other and may run in parallel; they touch disjoint report files.
4. **B22** — after B13 (which keeps the weather page, tiles and config) and after B17. The fetch extension inside B22 is a prerequisite of the weather report in the same batch.
5. **B23** — after B22 (shared weather inputs) and after B16's region work is out of its way.
6. **B24** — after B17.
7. **B25** — last. It is the model track and does not start until every panel above is live, because until then a model change cannot be told apart from a display change.

### B1 — Header parity and layers clamp (#197)

- **Covers:** HW-22, HW-23
- **Intent:** At desk there is no way back to wall without opening a menu, and the layers popover renders off screen. Put mode, WALL | DESK, projection and SETTINGS in one fixed header slot at both densities and clamp the popover to the viewport.
- **In scope:**
  - WALL | DESK toggle visible in the header at desk and wall
  - Header order identical at both densities
  - Layers trigger moved beside Activity / Contacts / Both at desk
  - `LayersPopover` position clamped so its rect stays inside the viewport
- **Out of scope:**
  - The settings panel (B5)
  - Any tile or page change
- **Files to touch:**
  - `src/components/map/hamclock/wall/HamClockWallHeader.tsx`
  - `src/components/map/hamclock/wall/HamClockWallControls.tsx`
  - `src/components/map/HamClockView.tsx`
  - `src/components/map/LayersPopover.tsx`
  - `src/components/map/hamclock/HamClockDisplaySettings.tsx`
  - tests beside each
- **Do not touch:** `wall/tiles/*`, `wall/pages.ts`, `hamclockDisplayStore.ts`, `hamclock-themes.css`
- **Style guide rules that apply:** §8 Settings rows (click to open, close on Escape/backdrop, never hover); §5 Spacing and hit targets (≥ 44 px targets)
- **Already available:**
  - `useHamclockDisplayStore` (density, setDensity)
  - `useMapStore` (viewMode, layoutMode)
- **Verification:** `npm run verify` and `npx vitest run src/components/map/hamclock/wall/HamClockWallControls.test.tsx src/components/map/HamClockView.test.tsx`
- **Acceptance:**
  - [ ] From desk, WALL is visible in the header without opening a menu.
  - [ ] Mode, WALL | DESK, projection and SETTINGS appear in the same order at wall and at desk.
  - [ ] The layers menu never renders off screen at 1366×768 or 1920×1080.
- **PR:** ≤ 15 files, title `feat(hamclock): header parity and layers clamp [B1: HW-22, HW-23]`, branch `feat/hamclock-b1-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B2 — Text fit, duplicate guard, rails follow page (#198)

- **Covers:** HW-50, HW-51, HW-54
- **Intent:** Hero text clips outside tiles, the same tile appears on both rails, and the right rail is locked to band activity. Make hero text always fit, reject duplicate tiles per page in the store, and recompose the shipped pages so both rails change with the page.
- **In scope:**
  - `heroSizeClass()` in `wall/tokens.ts` with short/medium/long bands and a new `--hc-t-hero-long` token
  - `clamp()` on hero tokens and `container-type: inline-size` on `.hc-tile`
  - Measure-and-shrink step in `HamClockTile` for values that still overflow
  - Store validation that rejects a layout with a tile twice on one page
  - New shipped page composition from spec section 4 (existing tiles only)
- **Out of scope:**
  - User-selected rails and the picker (B4)
  - New tiles marked _new_ in section 4
- **Files to touch:**
  - `src/components/map/hamclock/wall/HamClockTile.tsx`
  - `src/components/map/hamclock/wall/tokens.ts`
  - `src/styles/hamclock-wall.css`
  - `src/components/map/hamclock/wall/pages.ts`
  - `src/components/map/hamclock/wall/pages.test.ts`
  - `src/stores/hamclockDisplayStore.ts`
  - `src/components/map/hamclock/wall/tiles/tiles.test.tsx`
- **Do not touch:** `wall/reports/*`, `HamClockWallHeader.tsx`, `hamclock-themes.css` (tokens live in `hamclock-wall.css`)
- **Style guide rules that apply:** §1 Tile anatomy; §2 Type scale; §5 Spacing and hit targets (hero text must fit, no `overflow: hidden`); §13 What not to do
- **Already available:**
  - `HAMCLOCK_WALL_PAGES`, `wallPageTiles()` in `wall/pages.ts`
  - `WALL_TILES` in `wall/tiles/index.ts`
- **Verification:** `npm run verify` and `npx vitest run src/components/map/hamclock/wall/pages.test.ts src/components/map/hamclock/wall/tiles/tiles.test.tsx src/stores/hamclockDisplayStore.test.ts`
- **Acceptance:**
  - [ ] No page shows the same widget twice on screen.
  - [ ] "NO MAPPED ALERTS" fits inside its tile at 1080p and 4K wall without clipping.
  - [ ] The right rail changes with the page exactly like the left rail.
  - [ ] A tile test exists for each hero length band.
- **PR:** ≤ 15 files, title `feat(hamclock): text fit, duplicate guard, rails follow page [B2: HW-50, HW-51, HW-54]`, branch `feat/hamclock-b2-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B3 — Lightning bolt glyph (#199)

- **Covers:** HW-32
- **Intent:** Lightning renders as white bloom dots. Replace the additive spheres with a classic bolt glyph in 3D and a symbol icon in 2D, with a single modest pulse on fresh strikes.
- **In scope:**
  - Canvas-drawn bolt sprite texture built once (`src/lib/map/lightningGlyph.ts`)
  - Billboard sprites in `LightningOverlay3D`, screen-space sized, tone from `--hc-warn`
  - Symbol layer with the same icon in `LightningLayer2D`
  - One pulse then fade for strikes newer than the fresh window
- **Out of scope:**
  - Lightning report (B14)
  - Strike data fetching
- **Files to touch:**
  - `src/components/map/LightningOverlay3D.tsx`
  - `src/components/atmos/layers/LightningLayer2D.tsx`
  - new `src/lib/map/lightningGlyph.ts` and its test
- **Do not touch:** `src/hooks/useLightning*`, `layerCapabilities.ts`, anything under `wall/`
- **Style guide rules that apply:** §3 Tone tokens (read the colour from the token, never a hex); §13 What not to do
- **Already available:**
  - Existing strike feed consumed by `LightningOverlay3D` (keep its props)
  - Memory: custom raycasts must invert `matrixWorld` for the tilt group
- **Verification:** `npm run verify` and `npx vitest run src/lib/map/lightningGlyph.test.ts`
- **Acceptance:**
  - [ ] Lightning shows as bolt icons, not white dots.
  - [ ] Fresh strikes pulse once and fade; nothing blooms.
  - [ ] 2D and 3D use the same glyph.
- **PR:** ≤ 15 files, title `feat(hamclock): lightning bolt glyph [B3: HW-32]`, branch `feat/hamclock-b3-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B4 — User-selected rails, presets, no radio dependency (#200)

- **Covers:** HW-27, HW-52, HW-53
- **Intent:** Operators need to choose what each rail shows, pick a shipped use preset such as Living room, and use the wall with no callsign set. Add the rail layout model, presets and the Pages & Tiles picker, and make station-dependent tiles degrade to a neutral state.
- **In scope:**
  - `railLayout`, `pinnedTile`, `presets`, `autoPage` fields in `hamclockDisplayStore` with a version bump and migration seeded from `HAMCLOCK_WALL_PAGES`
  - `kioskStore` version bump and migration: `leftPage` / `rightPage` indexes become page ids so pins survive a re-ordered layout
  - `wall/presets.ts` with Radio, Weather wall, News & Earth, Space weather, Living room
  - Pages & Tiles picker (large cards, per-page per-rail slots, up/down order, greyed placed tiles, reset, save as preset) rendered inside `PagesTilesTab` — B5 landed first and removed `HamClockDisplaySettings`, so the picker is built directly into the shipped tab rather than a placeholder host
  - Neutral state (`SET HOME IN SETTINGS`) for Best band, Cluster, Grey line, Recent contacts, MUF when no station
- **Out of scope:**
  - The settings dialog shell (B5)
  - Auto-page timer (B7); only the persisted fields land here
- **Files to touch:**
  - `src/stores/hamclockDisplayStore.ts` and test
  - `src/stores/kioskStore.ts`, `src/lib/kiosk/applySceneToMap.ts` and tests
  - new `src/components/map/hamclock/wall/presets.ts` and test
  - new `src/components/map/hamclock/wall/settings/PagesTilesTab.tsx` and test
  - `src/components/map/hamclock/wall/HamClockRail.tsx`
  - `wall/tiles/{BestBandTile,ClusterTile,GreyLineTile,RecentContactsTile,MufTile}.tsx`
- **Do not touch:** `wall/reports/*`, `HamClockWallHeader.tsx`, `HamClockPager.tsx` (auto-page timer comes with B7)
- **Style guide rules that apply:** §8 Settings rows (big ON/OFF, no dropdowns); §6 Data formatting (honest empty states); §1 Tile anatomy
- **Already available:**
  - `useActiveLocation` (home / station presence)
  - `useHamclockDisplayStore`
  - `HAMCLOCK_WALL_PAGES`, `WALL_TILES`
- **Verification:** `npm run verify` and `npx vitest run src/stores/hamclockDisplayStore.test.ts src/components/map/hamclock/wall/presets.test.ts src/components/map/hamclock/wall/settings/PagesTilesTab.test.tsx src/components/map/hamclock/wall/tiles/tiles.test.tsx`
- **Acceptance:**
  - [ ] I can choose which tiles show on each rail of each page and it survives reload.
  - [ ] Tiles already on the page are greyed out in the picker.
  - [ ] Choosing Living room shows clocks, weather and news, no radio tiles, and no errors when no callsign is set.
  - [ ] I can save my current layout as a preset and pick it again later.
- **PR:** ≤ 15 files, title `feat(hamclock): user-selected rails, presets, no radio dependency [B4: HW-27, HW-52, HW-53]`, branch `feat/hamclock-b4-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B5 — Settings panel shell (#201)

- **Covers:** HW-26
- **Intent:** Header popouts are hover-fragile and off screen. Replace them with one centered settings dialog with tabs Display, Pages & Tiles, Layers, Map, Theme, Kiosk, none of which scroll.
- **In scope:**
  - `HamClockSettingsDialog` on `HamClockDialog` (size `settings`, itself built on `AccessibleDialog`), tabs on `HamClockTabs`, opened by SETTINGS, closed by close/Escape/backdrop
  - Display, Pages & Tiles (moved from B4), Theme, Kiosk tabs
  - Layers and Map tabs as placeholders that say what is coming
  - Remove `HamClockDisplaySettings` and the wall controls popout
  - One tile wired through the widget-config contract (guide §9) as the
    reference registration: `recentContacts` (`wall/config/recentContactsConfig.ts`),
    surfaced by an OPTIONS gear on Pages & Tiles
- **Out of scope:**
  - Layer registry, Layers tab content, Map tab content (B6)
- **Files to touch:**
  - new `src/components/map/hamclock/wall/settings/{HamClockSettingsDialog,DisplayTab,ThemeTab,KioskTab}.tsx` and tests
  - `src/components/map/hamclock/wall/settings/PagesTilesTab.tsx`
  - `src/components/map/hamclock/wall/HamClockWallHeader.tsx`
  - `src/components/map/hamclock/HamClockDisplaySettings.tsx` (delete)
  - `src/components/map/hamclock/HamClockThemePicker.tsx`
- **Do not touch:** `LayersPopover.tsx` (still used by non-HamClock layouts), `wall/tiles/*`, `wall/pages.ts`
- **Style guide rules that apply:** §8 Settings rows (all of it); §7 Reports (dialog size, focus return); §5 Spacing and hit targets
- **Already available:**
  - `AccessibleDialog` (`src/components/ui/AccessibleDialog.tsx`, `chrome="bare"`)
  - `useHamclockDisplayStore`, `useKioskStore`
  - `wall/controls/*` primitives and `hamclockWidgetConfigStore` (B0, PR #215)
- **Verification:** `npm run verify` and `npx vitest run src/components/map/hamclock/wall/settings`
- **Acceptance:**
  - [ ] SETTINGS opens a centered dialog with tabs; the map stays visible around it.
  - [ ] Every toggle is a big ON / OFF button that spells its state.
  - [ ] Nothing inside the dialog scrolls.
  - [ ] The dialog never opens on hover and never closes when the pointer leaves.
  - [ ] Escape closes the dialog and focus returns to SETTINGS.
- **PR:** ≤ 15 files, title `feat(hamclock): settings panel shell [B5: HW-26]`, branch `feat/hamclock-b5-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B6 — Layer registry, Layers tab, Map style chooser (#202)

- **Covers:** HW-21, HW-39, HW-55
- **Intent:** Layers are described differently in the popover, the help page and the status line. Build one registry with provenance text that feeds all three, render the Layers tab from it, and add the map style chooser on the Map tab.
- **In scope:**
  - `src/lib/map/layerRegistry.ts`: icon, name, category, source, cadence, coverage, caveat per `MapState.layers` key
  - Layers tab: category sub-tabs, ≤ 8 rows each, live toggles
  - Map tab: style rows (swatch, name, behaviour line, selected dot, keyboard hint) over `mapStyle` and `nightLights`, plus `LAYER_PRESETS` rows
  - `tileProviderId` persisted in `mapStore` with a version bump and a migration derived from `mapStyle` and tier; `selectTileProvider()` honours it, so Esri / Mapbox and OSM / CARTO dark become separate rows
  - Help page and wall status line read the registry
- **Out of scope:**
  - New layers of any kind
  - Weather category content beyond what exists (B14)
- **Files to touch:**
  - new `src/lib/map/layerRegistry.ts` and test
  - `src/components/map/hamclock/wall/settings/{LayersTab,MapTab}.tsx` and tests
  - `src/components/help/sections/*` (one section)
  - `src/lib/map/layerCapabilities.ts`
  - `src/stores/mapStore.ts` and test (provider id, migration)
  - `src/lib/tiles/providers.ts` and test
- **Do not touch:** `LayersPopover.tsx` internals, `wall/tiles/*`, `wall/reports/*`
- **Style guide rules that apply:** §8 Settings rows (row anatomy: icon · name · provenance · caveat · ON/OFF); §9 Configuration dialogs (segmented choices, no scroll)
- **Already available:**
  - `docs/PROP-SPHERE-LAYER-SOURCE-AUDIT.md` for provenance text
  - `src/lib/tiles/providers.ts` (esri-world, osm, carto-dark, mapbox-satellite)
  - `useMapStore` (`layers`, `toggleLayer`, `mapStyle`, `setMapStyle`, `applyPreset`)
  - `wall/controls/*` primitives and `hamclockWidgetConfigStore` (B0, PR #215)
- **Verification:** `npm run verify` and `npx vitest run src/lib/map/layerRegistry.test.ts src/components/map/hamclock/wall/settings`
- **Acceptance:**
  - [ ] Every layer row shows source · cadence · coverage, and the help page shows the same words.
  - [ ] Turning a layer on in the dialog changes the map immediately.
  - [ ] Map style rows show a swatch, a name and a behaviour line; SELECT applies immediately and BACK restores.
- **PR:** ≤ 15 files, title `feat(hamclock): layer registry, layers tab, map style chooser [B6: HW-21, HW-39, HW-55]`, branch `feat/hamclock-b6-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B7 — Auto-page (#203)

- **Covers:** HW-20
- **Intent:** The wall should run itself. Rotate both rails through the pages on a dwell timer, pause on any interaction, resume after quiet, and expose AUTO by the pager and in settings.
- **In scope:**
  - `useWallAutoPage` hook: dwell (default 30 s), pause on pointer/key/touch on rails or header, resume after 60 s, suspended while a kiosk scene pins a page
  - AUTO toggle in `HamClockPager` and on the Display tab
  - Kiosk pins reference page ids
- **Out of scope:**
  - Report pin (B9)
  - Preset dwell values beyond what `wall/presets.ts` already stores
- **Files to touch:**
  - new `src/hooks/useWallAutoPage.ts` and test
  - `src/components/map/hamclock/wall/HamClockPager.tsx`
  - `src/components/map/hamclock/wall/HamClockWall.tsx`
  - `src/components/map/hamclock/wall/settings/DisplayTab.tsx`
  - `src/stores/kioskStore.ts` (suspend flag only; the page-id migration shipped in B4)
- **Do not touch:** `wall/tiles/*`, `wall/reports/*`, `hamclock-wall.css`
- **Style guide rules that apply:** §8 Settings rows; §5 Spacing and hit targets (AUTO is a ≥ 44 px labelled toggle)
- **Already available:**
  - `useHamclockDisplayStore` (`autoPage`, `pageIndex`, `stepPage`)
  - `useKioskStore` (`map.hamclock`)
- **Verification:** `npm run verify` and `npx vitest run src/hooks/useWallAutoPage.test.ts src/components/map/hamclock/wall/HamClockWall.test.tsx src/lib/kiosk`
- **Acceptance:**
  - [ ] At wall, pages rotate every 30 s by default and stop when I touch anything.
  - [ ] Rotation resumes on its own after a minute of quiet.
  - [ ] At desk, auto-page is off until I turn it on.
  - [ ] A kiosk scene that pins a page stops the rotation while it is active.
- **PR:** ≤ 15 files, title `feat(hamclock): auto-page [B7: HW-20]`, branch `feat/hamclock-b7-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B8 — Desk on wall tiles and desk cleanup (#204)

- **Covers:** HW-24, HW-25
- **Intent:** Desk still shows the legacy accordion sidebar with a DE STATION block and duplicate weather. Render the wall tiles at desk scale with opaque rails, remove the sidebar, and add a DX TARGET tile.
- **In scope:**
  - `--hc-scale` for desk (start 0.72, D5) applied to the vh tokens
  - Opaque rails (`--hc-panel`) and desk slot limits 5 / 6
  - Delete `HamClockSidebar`, `HamClockLocationConditions`, the DE STATION block
  - `DxTargetTile`: target grid hero, distance and bearing sub line, report with target weather
- **Out of scope:**
  - Any new page
  - Auto-page defaults (B7)
- **Files to touch:**
  - `src/components/map/HamClockView.tsx`
  - `src/components/map/hamclock/wall/HamClockWall.tsx`
  - `src/styles/hamclock-wall.css`
  - `src/components/map/hamclock/HamClockSidebar.tsx` (delete)
  - `src/components/map/hamclock/HamClockLocationConditions.tsx` (delete)
  - new `wall/tiles/DxTargetTile.tsx`, `wall/reports/DxTargetReport.tsx` and tests
  - `wall/tiles/index.ts`, `wall/pages.ts`
- **Do not touch:** `BandConditionsPanel.tsx` (used elsewhere), `hamclock-themes.css`
- **Style guide rules that apply:** §1 Tile anatomy; §2 Type scale (scale token, no px); §13 What not to do (no header facts inside tiles)
- **Already available:**
  - `useActiveLocation`, `useHamclockStore` (DX target)
  - `useLocalWeather`, `src/lib/api/openMeteo`
  - `resolveUnits`, `formatTemperature` in `src/lib/hamclock/units.ts`
- **Verification:** `npm run verify` and `npx vitest run src/components/map/hamclock/wall src/components/map/HamClockView.test.tsx`
- **Acceptance:**
  - [ ] Desk shows the same tiles as wall, smaller, with opaque rails.
  - [ ] No DE STATION block; home weather appears once.
  - [ ] A DX TARGET tile shows the target grid, distance and bearing, and its report shows target weather.
- **PR:** ≤ 15 files, title `feat(hamclock): desk on wall tiles and desk cleanup [B8: HW-24, HW-25]`, branch `feat/hamclock-b8-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B9 — Trend charts, report pin, Best Band table, forecast horizons (#205)

- **Covers:** HW-11, HW-17, HW-29, HW-30, HW-31
- **Intent:** Reports have no trend charts, cannot be pinned, and the band report is a list. Make the solar chart components read theme tokens and add one chart per report, add the pin, replace the band report with the ranked table, and surface FutureCast horizons when the runtime activates them.
- **In scope:**
  - `SolarMiniChart`, `SolarSeriesChart`, `MetricCard` sparkline read `--hc-*` tokens when rendered under `[data-hamclock-theme]`
  - One trend chart per report with title `METRIC — RANGE · SRC`
  - Pin control in `WallReport`, session-only, survives page steps and scene changes
  - `BestBandReport` table per spec section 10, rows set the band focus
  - Forecast report reads `runtimeFutureCastHorizonIsActivated` and adds model columns when active
  - Footer contract on every report: `DATA: source · UPDATED hh:mm UTC · age` from the feed's own timestamp; add an observation time to `LocalWeatherData` and move the condition text out of the `updated` slot in `WeatherReport`
- **Out of scope:**
  - New data feeds
  - Weather report rewrite (B13)
- **Files to touch:**
  - `src/components/map/hamclock/wall/reports/*.tsx` and `reports.test.tsx`
  - new `wall/reports/BestBandReport.tsx`
  - `src/components/solar/{SolarMiniChart,SolarSeriesChart,MetricCard}.tsx`
  - `src/styles/hamclock-wall-report.css`
  - `src/lib/api/weather.ts`, `src/hooks/useLocalWeather.ts` (observation timestamp only)
- **Do not touch:** `wall/tiles/*` except wiring the new report id, `useBandVerdicts.ts` internals
- **Style guide rules that apply:** §7 Reports (anatomy, size limit, sr-only table, focus return); §3 Tone tokens; §6 Data formatting (footer, one format per column)
- **Already available:**
  - `useBandVerdicts`, `useBandLadder`, `src/lib/verdict/{bestBand,ladder}.ts`
  - `useWallReliability`, `src/lib/hamclock/reliabilityForecast.ts`
  - `useSolarData`, `useSolarResource`, `src/lib/solar/selectors.ts`
  - `src/lib/propagation/runtimeActivation.ts`
- **Verification:** `npm run verify` and `npx vitest run src/components/map/hamclock/wall/reports src/components/solar`
- **Acceptance:**
  - [ ] Every report has one trend chart in the current theme's colours.
  - [ ] Every report footer shows its own source, UTC update time and age; the weather report no longer shows the condition text there.
  - [ ] A pinned report stays open while the pages rotate underneath.
  - [ ] Best band report is a ranked table with a scope sparkline per band and a surprise-activity section.
  - [ ] Clicking a band row focuses that band on the map.
- **PR:** ≤ 15 files, title `feat(hamclock): trend charts, report pin, best band table, forecast horizons [B9: HW-11, HW-17, HW-29, HW-30, HW-31]`, branch `feat/hamclock-b9-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B10 — Widget config contract and news feeds dialog (#206)

- **Covers:** HW-36, HW-37
- **Intent:** Widgets need a uniform way to be configured, and the news ticker already has feeds and preferences with no wall UI. Add the `config` contract to the tile registry, a per-tile config store, the dialog shell, and the news feeds panel with server-side verify.
- **In scope:**
  - `config?: { schema, defaults, ConfigPanel }` on `WALL_TILES` entries
  - `hamclockWidgetConfigStore` keyed by tile id, validated on read
  - `WidgetConfigDialog` on the report shell: header + purpose, segmented rows, category tabs above eight rows
  - News feeds panel over `feedStore`: fetch interval, max age, feed rows with status and REFRESH, add-custom-feed with VERIFY then ADD
  - `api/feeds/rss.ts` verify mode returning title and item count
- **Out of scope:**
  - Other widgets' panels (B11)
  - Ticker rendering changes
- **Files to touch:**
  - new `src/stores/hamclockWidgetConfigStore.ts` and test
  - `src/components/map/hamclock/wall/tiles/index.ts`
  - new `src/components/map/hamclock/wall/config/{WidgetConfigDialog,NewsFeedsConfig}.tsx` and tests
  - `src/stores/feedStore.ts`
  - `api/feeds/rss.ts` and test
  - `src/components/map/DXNewsTicker.tsx` (gear only)
- **Do not touch:** `wall/reports/*`, `wall/settings/*`, other tiles
- **Style guide rules that apply:** §9 Configuration dialogs (row anatomy, segmented choices, verify before save, no scroll); §8 Settings rows
- **Already available:**
  - `useFeedStore` (`FeedSource`, `TickerCrawlPreferences`, `addFeed`, `updateFeed`)
  - `useRssFeeds` in `src/hooks/useRssFeed.ts`
  - `api/_lib/rateLimit.ts` for the proxy
  - `wall/controls/*` primitives and `hamclockWidgetConfigStore` (B0, PR #215)
- **Verification:** `npm run verify` and `npx vitest run src/stores/hamclockWidgetConfigStore.test.ts src/components/map/hamclock/wall/config api/feeds`
- **Acceptance:**
  - [ ] The news tile gear opens a centered dialog with big-button fetch intervals and max age.
  - [ ] Adding a feed requires VERIFY to succeed first, and the browser never fetches the URL itself.
  - [ ] Feed lists longer than eight rows paginate by category tab.
  - [ ] Each feed row shows its last-fetched time or NOT YET FETCHED.
- **PR:** ≤ 15 files, title `feat(hamclock): widget config contract and news feeds dialog [B10: HW-36, HW-37]`, branch `feat/hamclock-b10-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B11 — Remaining config dialogs, world clocks, alerts area (#207)

- **Covers:** HW-18, HW-28, HW-38
- **Intent:** With the contract in place, give the cluster, weather, band list, world clocks and alerts widgets their panels, add the clocks row to the header, and let alerts be scoped to an area.
- **In scope:**
  - Config panels: cluster filters, weather location and units, band list, world clocks (city + IANA zone, up to the D1 count), alert area and severity floor
  - World clocks row in the header between the callsign block and the hero clocks
  - `useWeatherAlerts` accepts an area scope and reports mapped coverage honestly
- **Out of scope:**
  - New tiles
  - Earth events
- **Files to touch:**
  - new `wall/config/{ClusterConfig,WeatherConfig,BandListConfig,ClocksConfig,AlertsConfig}.tsx` and tests
  - `src/components/map/hamclock/wall/HamClockWallHeader.tsx`
  - `src/hooks/useWeatherAlerts.ts` and test
  - `wall/tiles/{ClusterTile,WeatherTile,BandActivityTile,AlertsTile}.tsx` (gear wiring)
- **Do not touch:** `feedStore.ts`, `NewsFeedsConfig.tsx`, `wall/reports/*`
- **Style guide rules that apply:** §9 Configuration dialogs; §6 Data formatting (local + UTC together, NONE MAPPED)
- **Already available:**
  - `useDxStore` (`filters`, `updateFilter`, `DXClusterFilters`)
  - `useWeatherAlerts`, `useLocalWeather`
  - `formatClock` in `wall/tokens.ts`
  - `BAND_ORDER` in `src/lib/data/bandRanges.ts`
  - `wall/controls/*` primitives and `hamclockWidgetConfigStore` (B0, PR #215)
- **Verification:** `npm run verify` and `npx vitest run src/components/map/hamclock/wall/config src/hooks/useWeatherAlerts.test.ts src/components/map/hamclock/wall/HamClockWall.test.tsx`
- **Acceptance:**
  - [ ] I can add up to the configured number of city clocks to the top rail from settings.
  - [ ] The alerts tile can be scoped to my county and says NONE MAPPED when nothing is mapped there.
  - [ ] Every configurable tile shows a gear that opens its own dialog.
- **PR:** ≤ 15 files, title `feat(hamclock): remaining config dialogs, world clocks, alerts area [B11: HW-18, HW-28, HW-38]`, branch `feat/hamclock-b11-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B12 — Earth events and taxonomy v2 (#208)

- **Covers:** HW-33, HW-34, HW-35
- **Intent:** Add earthquakes and volcanoes as tiles and reports, then recompose the pages into the six-page taxonomy including the new tiles.
- **In scope:**
  - Edge proxies for USGS GeoJSON (M4+, 24 h) and Smithsonian GVP weekly report with rate limits
  - `useEarthquakes`, `useVolcanoes` hooks with `observedAt`
  - `EarthquakesTile`, `VolcanoesTile`, their reports (table + map markers)
  - Six-page `HAMCLOCK_WALL_PAGES` and preset updates
- **Out of scope:**
  - Aurora, Watch matches, Contests, DXpeditions tiles (separate follow-ups)
  - Weather tiles (B13)
- **Files to touch:**
  - new `api/earth/usgs.ts`, `api/earth/gvp.ts` and tests
  - new `src/hooks/{useEarthquakes,useVolcanoes}.ts`
  - new tiles and reports under `wall/`
  - `wall/tiles/index.ts`, `wall/pages.ts`, `wall/presets.ts`
- **Do not touch:** `wall/settings/*`, `wall/config/*`
- **Style guide rules that apply:** §1 Tile anatomy; §6 Data formatting (footer with source and age); §7 Reports
- **Already available:**
  - `api/_lib/rateLimit.ts`
  - `useMapStore` `layers.earthquakes` already exists for markers
- **Verification:** `npm run verify` and `npx vitest run api/earth src/components/map/hamclock/wall`
- **Acceptance:**
  - [ ] Earthquakes M4+ in the last 24 h show as a count tile and a report list with magnitude, place, depth and age.
  - [ ] Volcanoes show an active count and a report list.
  - [ ] The pager shows six pages in the Radio preset and no page repeats a tile.
- **PR:** ≤ 15 files, title `feat(hamclock): earth events and taxonomy v2 [B12: HW-33, HW-34, HW-35]`, branch `feat/hamclock-b12-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B13 — Weather page, tiles and config (#209)

- **Covers:** HW-40, HW-44
- **Intent:** Weather becomes a first-class page in the wall. Build the local-now, hourly, 7-day, tides, radar and lightning tiles and the weather config dialog. The dedicated Weather report (HW-41) moved to B22, where it ships with the Open-Meteo fetch extension it depends on.
- **In scope:**
  - Tiles: local now (existing `WeatherTile` upgraded), hourly, 7-day, tides where coastal, radar status, lightning status
  - `WeatherConfig` panel: location, units override, radar cadence, alert area link
- **Out of scope:**
  - The dedicated Weather report and the Open-Meteo hourly / 7-day fetch (B22)
  - Radar and lightning reports (B14)
  - AtmosPulse layer ports (B15)
- **Files to touch:**
  - `wall/tiles/WeatherTile.tsx` and new weather tiles
  - new `wall/config/WeatherConfig.tsx`
  - `src/hooks/useLocalWeather.ts` (wiring only)
  - `wall/pages.ts`, `wall/presets.ts`
- **Do not touch:** `src/components/atmos/*`, `wall/settings/*`, `wall/reports/WeatherReport.tsx`, `src/lib/api/openMeteo.ts`
- **Style guide rules that apply:** §1 Tile anatomy (one graphic in place of the sub line, never both); §7 Reports; §6 Data formatting (`formatTemperature`, `formatSpeed`)
- **Already available:**
  - `useLocalWeather`, `src/lib/api/openMeteo.ts`, `src/lib/api/weather.ts`
  - `useActiveLocation`
  - `SolarSeriesChart` after B9 for trend charts
- **Verification:** `npm run verify` and `npx vitest run src/components/map/hamclock/wall src/hooks/useLocalWeather.test.ts`
- **Acceptance:**
  - [ ] The Weather page shows current conditions, hourly, 7-day, radar and lightning as tiles.
  - [ ] Tiles that have no hourly or daily data yet show a named waiting state, not a blank.
  - [ ] Weather location and units can be changed from the tile's gear.
- **PR:** ≤ 15 files, title `feat(hamclock): weather page, tiles and config [B13: HW-40, HW-44]`, branch `feat/hamclock-b13-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B14 — Radar and lightning reports, weather layers category (#210)

- **Covers:** HW-42, HW-43, HW-45
- **Intent:** Radar and lightning deserve their own interactive reports, and weather layers belong under the Layers tab. Reuse the AtmosPulse scrubbers inside reports and add the Weather category to the registry.
- **In scope:**
  - `RadarReport` embedding `RadarScrubber2D` / `RadarScrubber3D` by view mode
  - `LightningReport` with strike list and the glyph map
  - Weather category in `layerRegistry.ts`: radar, lightning, clouds, alerts, fires, cyclones, river gauges, SST
- **Out of scope:**
  - Porting layers to 3D (B15)
- **Files to touch:**
  - new `wall/reports/{RadarReport,LightningReport}.tsx` and tests
  - `src/components/atmos/{RadarScrubber2D,RadarScrubber3D}.tsx` (props only)
  - `src/lib/map/layerRegistry.ts`
  - `wall/settings/LayersTab.tsx`
- **Do not touch:** `src/components/atmos/layers/*`, `AtmosPulse.tsx`
- **Style guide rules that apply:** §7 Reports; §8 Settings rows
- **Already available:**
  - `useMapStore` layer keys `radar`, `lightning`, `weather`, `fires`
  - `src/components/atmos/layers/*` for existing sources
- **Verification:** `npm run verify` and `npx vitest run src/components/map/hamclock/wall/reports src/lib/map/layerRegistry.test.ts`
- **Acceptance:**
  - [ ] Radar opens a report with a time scrubber in both 2D and 3D.
  - [ ] The Layers tab has a Weather category with radar, lightning, clouds, alerts, fires, cyclones, river gauges and SST.
- **PR:** ≤ 15 files, title `feat(hamclock): radar and lightning reports, weather layers category [B14: HW-42, HW-43, HW-45]`, branch `feat/hamclock-b14-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B15 — AtmosPulse layers on the map (#211)

- **Covers:** HW-46
- **Intent:** Every layer AtmosPulse renders in 2D must render on the main map in 2D and 3D from the registry. Port them in two groups if the file count demands it.
- **In scope:**
  - Registry entries and map wiring for alerts, APRS, fires, GOES clouds, lightning, radar, repeaters, river gauges, shadow zones, SST, TEC, tropical cyclones
  - 3D counterparts where missing, following existing `*Overlay3D.tsx` patterns
  - `layerCapabilities.ts` availability per view mode
- **Out of scope:**
  - Removing AtmosPulse (B16)
  - New data sources
- **Files to touch:**
  - `src/components/atmos/layers/*` (reuse, do not fork)
  - `src/components/map/*Overlay3D.tsx` (new files where needed)
  - `src/lib/map/layerRegistry.ts`, `src/lib/map/layerCapabilities.ts` and tests
- **Do not touch:** `wall/*`, `AtmosPulse.tsx`
- **Style guide rules that apply:** §3 Tone tokens; §13 What not to do
- **Already available:**
  - `docs/PROP-SPHERE-LAYER-SOURCE-AUDIT.md`
  - Memory: depth primer needs explicit `renderOrder`; custom raycasts invert `matrixWorld`
- **Verification:** `npm run verify` and `npx vitest run src/lib/map/layerCapabilities.test.ts src/lib/map/layerRegistry.test.ts`
- **Acceptance:**
  - [ ] Every layer AtmosPulse offers today can be turned on from the map's Layers tab in 2D and 3D.
- **PR:** ≤ 15 files, title `feat(hamclock): atmospulse layers on the map [B15: HW-46]`, branch `feat/hamclock-b15-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B16 — EmComm and `/atmos` retirement (#212)

- **Covers:** HW-48, HW-49
- **Intent:** Finish parity: EmComm forms open from the Emcomm tile and `/atmos` redirects or aliases per D7. Monitored regions and RIM scores (HW-47) moved to B23, where they ship with the RIM tile.
- **In scope:**
  - Emcomm report gains ICS-213, SitRep and activation entry points
  - `/atmos` route change in `App.tsx`; register rows HW-48 and HW-49 flipped to Delivered
- **Out of scope:**
  - Monitored regions and RIM (B23)
  - Deleting `src/components/atmos/*` (a later cleanup once nothing imports it)
- **Files to touch:**
  - `wall/reports/EmcommReport.tsx`
  - `src/components/atmos/emcomm/*` (props only)
  - `src/App.tsx`, `src/pages/AtmosPulse.tsx`
- **Do not touch:** `src/components/atmos/layers/*`, `wall/settings/*`
- **Style guide rules that apply:** §7 Reports; §13 What not to do
- **Already available:**
  - `src/components/atmos/emcomm/*`
- **Verification:** `npm run verify` and `npx vitest run src/components/map/hamclock/wall/reports src/App.test.tsx`
- **Acceptance:**
  - [ ] ICS-213, SitRep and activation open from the Emcomm tile.
  - [ ] Visiting /atmos lands on the map Weather page (or the alias, per D7).
- **PR:** ≤ 15 files, title `feat(hamclock): emcomm and /atmos retirement [B16: HW-48, HW-49]`, branch `feat/hamclock-b16-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B17 — Engine comparison strip and MUF report (#225)

- **Covers:** HW-56, HW-57
- **Intent:** The three-engine comparison is the product's core claim and nothing on the wall shows it. Build `EngineComparisonStrip` once, prove it on the MUF report, and retrofit it onto the Best band report that B9 delivered. The MUF tile currently opens the shared Forecast report; give it the ionosphere detail the engine already computes and never surfaces.
- **In scope:**
  - `EngineComparisonStrip` per section 26.1: three columns, agreement tone computed from the readings, `MODEL OFF` / `NO SPOTS` for unavailable engines, `stale` tone from `formatAge`
  - A pure `compareEngines()` helper that turns physics / nowcast / observed readings into the agree / split / disagree verdict and its one-line reason, unit tested on its own
  - `MufReport` per section 26.2: `PATH` and `HOPS` tabs, fact columns, usable-window chart, hop rows that flash the reflection point on the map
  - 24 h MUF-at-QTH series sampled from the existing point function
  - Strip added above the Best band ranked table with the leading band as `subject`
- **Out of scope:**
  - Any other report (B18 to B24)
  - Changing the physics engine, the model client or the gating in `runtimeActivation.ts`
- **Files to touch:**
  - new `src/lib/hamclock/engineComparison.ts` and `engineComparison.test.ts`
  - new `wall/reports/EngineComparisonStrip.tsx`
  - new `wall/reports/MufReport.tsx`
  - `wall/reports/BestBandReport.tsx`, `wall/reports/reports.test.tsx`
  - `wall/tiles/MufTile.tsx`, `wall/tiles/index.ts`
  - `src/lib/api/muf.ts`, `src/hooks/useMUFData.ts` (add the hourly series, keep existing signatures)
  - `src/styles/hamclock-wall-report.css`
- **Do not touch:** `src/lib/utils/ionosphere.ts`, `rayTrace.ts`, `signal.ts`, `src/lib/propagation/*`
- **Style guide rules that apply:** §7 Reports (anatomy, 90 vw × 88 vh, second tab instead of scrolling, `sr-only` table twin, focus return); §3 Tone tokens; §6 Data formatting (one format per column, `reportFooter`); §2 Type scale for the strip's value class
- **Already available:**
  - `getIonosphericParameters`, `calculateDLayerAbsorption`, `calculateLUF`, `calculateFOT`, `describeConditions` (`src/lib/utils/ionosphere.ts`)
  - multi-hop ray trace with per-hop absorption, elevation, path loss and limiting hop (`src/lib/utils/rayTrace.ts`)
  - `useCurrentSFI`, `generateMUFGrid`, `getMUFAtLocation`
  - `useBandVerdicts`, `useBandLadder` for the observed column; `modelClient` for the nowcast column
  - `SolarSeriesChart` and the report pin from B9
- **Verification:** `npm run verify` and `npx vitest run src/lib/hamclock/engineComparison.test.ts src/components/map/hamclock/wall/reports`
- **Acceptance:**
  - [ ] The MUF tile opens a MUF report, not the shared forecast report.
  - [ ] The strip shows three columns and states AGREE, SPLIT or DISAGREE with a reason, computed from the readings.
  - [ ] An engine with no data reads `MODEL OFF` or `NO SPOTS`; no engine ever borrows another engine's number.
  - [ ] The `HOPS` tab lists each hop and selecting one marks the reflection point on the map.
  - [ ] The Best band report carries the strip above its table.
- **PR:** ≤ 15 files, title `feat(hamclock): engine comparison strip and MUF report [B17: HW-56, HW-57]`, branch `feat/hamclock-b17-<slug>`
- **Do not:** name, imply or add VOACAP anywhere; add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B18 — Reliability and propagation forecast reports (#226)

- **Covers:** HW-58, HW-59
- **Intent:** The reliability engine computes an SNR, a confidence and a status per cell and the wall shows only a coloured dot. The forecast matrix shows a 24 h grid with no time axis and no model horizons. Give both their own report and put the three engines on one chart.
- **In scope:**
  - `ReliabilityReport` per section 26.3: `NOW` and `BY HOUR` tabs, SNR / confidence / mode-threshold facts, station inputs (power, antenna gain, noise environment), the two-line-plus-bars chart
  - `PropagationForecastReport` per section 26.4: `MATRIX` and `HORIZONS` tabs, a 48 h band-score chart with a now marker, per-horizon rows carrying core and personalized probability, confidence, top factors and OOD flags spelled out in words
  - Both reports carry `EngineComparisonStrip`
  - Horizons that `runtimeActivation` has not enabled render as `MODEL OFF` rows with the reason, never as an empty tab
- **Out of scope:**
  - Enabling FutureCast horizons or changing `capabilityAccess` gating
  - Any change to the reliability maths
- **Files to touch:**
  - new `wall/reports/ReliabilityReport.tsx` and `wall/reports/PropagationForecastReport.tsx`
  - `wall/reports/reports.test.tsx`
  - `wall/tiles/ReliabilityTile.tsx`, `wall/tiles/ForecastMatrixTile.tsx`, `wall/tiles/index.ts`
  - `wall/tiles/useWallReliability.ts` (expose the full cell, not just the score)
  - `src/hooks/useNowCastBandPredictions.ts` (surface `topFactors`, `oodFlags`, `dataFreshness`; no fetch change)
  - `src/styles/hamclock-wall-report.css`
- **Do not touch:** `src/lib/hamclock/reliabilityForecast.ts` internals, `src/lib/propagation/runtimeActivation.ts`, `capabilityAccess.ts`, `wall/reports/EngineComparisonStrip.tsx`
- **Style guide rules that apply:** §7 Reports (`sr-only` twin for both grids); §6 Data formatting (SNR signed, confidence integer, `reportFooter` from the feed being shown); §3 Tone tokens
- **Already available:**
  - `buildReliabilityForecast` cells with `score`, `snrEstimate`, `confidence`, `status` and `MODE_PARAMETERS` (`src/lib/hamclock/reliabilityForecast.ts`)
  - station power, antenna gain pattern and noise environment inputs in `useWallReliability.ts`
  - `modelClient` fields `core_probability`, `personalized_probability`, `confidence`, `ood_flags`, `top_factors`, `model_version`, `data_freshness`
  - `EngineComparisonStrip` and `compareEngines` from B17
- **Verification:** `npm run verify` and `npx vitest run src/components/map/hamclock/wall`
- **Acceptance:**
  - [ ] The reliability report shows the SNR estimate, its mode threshold and the station inputs that produced it.
  - [ ] The reliability chart shows physics, nowcast and observed on one time axis.
  - [ ] The forecast report has a time axis and a now marker; the matrix keeps its `sr-only` table.
  - [ ] Every FutureCast horizon appears, either with values or with `MODEL OFF` and a reason.
- **PR:** ≤ 15 files, title `feat(hamclock): reliability and propagation forecast reports [B18: HW-58, HW-59]`, branch `feat/hamclock-b18-<slug>`
- **Do not:** name, imply or add VOACAP anywhere; add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B19 — Solar, X-ray and solar wind reports (#227)

- **Covers:** HW-60, HW-61, HW-62
- **Intent:** Three tiles share one Solar report today and half the space-weather data the app already fetches never reaches the wall. Split the shared report into three dedicated ones and surface the flare events, D-RAP absorption, probabilities, Dst, proton flux, aurora oval and CMEs that `SolarPulse` already reads. The shared Solar report is retired when the third one lands, because nothing points at it any more.
- **In scope:**
  - `SolarReport` rewritten per section 26.5: `NOW` and `CYCLE` tabs, flux forecast tail, cycle 25 chart
  - `XrayReport` per section 26.6: `FLUX`, `ABSORPTION`, `PROBABILITIES` tabs, log-axis flux chart with B / C / M / X threshold rules, latest classified flare, D-RAP, C/M/X and proton probabilities
  - `SolarWindReport` per section 26.7: `WIND`, `GEOMAGNETIC`, `EVENTS` tabs, Bz zero rule, Kp and Dst, aurora oval reach, CME list
  - A log-scale option on `SolarSeriesChart` (prop only, token colours)
  - Map links that toggle the existing D-RAP and aurora layers behind the dialog
- **Out of scope:**
  - The engine comparison strip; these reports show observations, not our prediction
  - Any new upstream provider; the feed work below stays on NOAA / NASA products the app already proxies
- **Files to touch:**
  - `wall/reports/SolarReport.tsx`, new `wall/reports/XrayReport.tsx`, new `wall/reports/SolarWindReport.tsx`
  - `wall/reports/reports.test.tsx`
  - `wall/tiles/SpaceWxTile.tsx`, `wall/tiles/XrayTile.tsx`, `wall/tiles/SolarWindTile.tsx`, `wall/tiles/index.ts`
  - `src/hooks/useSolarExpanded.ts`, `src/hooks/useSolarData.ts`
  - `src/lib/solar/selectors.ts`
  - `src/components/solar/SolarSeriesChart.tsx`
  - `src/styles/hamclock-wall-report.css`
  - `src/lib/solar/sourcePolicies.ts` and `api/solar/*` for the three horizons the reports promise and the current products do not carry: the 27-day flux forecast (`noaa-flux-forecast` is a three-day product today), a 24 h X-ray curve (`noaa-xray` reads the six-hour endpoint), and 24 h of Bz / speed / density (the wind policies keep ≤ 90 magnetometer rows and one plasma summary). Extend retention and point at the 1-day products; if that pushes the batch past 15 files, ship the feed work first as `B19a` (`feat(solar): report horizons for the wall`) and the reports as `B19b`.
- **Do not touch:** `src/pages/SolarPulse.tsx` (it must keep rendering identically from the same resources)
- **Style guide rules that apply:** §7 Reports (one chart per tab, `sr-only` twin for the probability grid); §6 Data formatting (empty states name the gap: `NO FLARES ABOVE B`, `NONE MAPPED`, never `ALL CLEAR`); §3 Tone tokens for the R / S / G scales
- **Already available:**
  - resources `noaa-protons`, `noaa-dst`, `noaa-drap`, `noaa-probabilities`, `noaa-sunspots`, `noaa-flux-forecast`
  - `useProtonFlux`, `useDstIndex`, `useSunspots`, `useProbabilities`
  - aurora OVATION products in `src/lib/solar/mediaProducts.ts`; CME analyses from NASA DONKI
  - `SolarCycleContext` for the cycle position
- **Verification:** `npm run verify` and `npx vitest run src/components/map/hamclock/wall/reports src/components/solar src/hooks/useSolarData.test.ts`
- **Acceptance:**
  - [ ] X-ray, Solar wind and Space Wx each open their own report; the shared Solar report has no remaining callers.
  - [ ] The X-ray chart is log scale with labelled B / C / M / X rules and marks the last flare.
  - [ ] Dst, proton flux, flare probabilities, D-RAP and CMEs are visible on the wall for the first time.
  - [ ] Aurora and D-RAP map links toggle the existing layers behind the dialog.
- **PR:** ≤ 15 files, title `feat(hamclock): solar, x-ray and solar wind reports [B19: HW-60, HW-61, HW-62]`, branch `feat/hamclock-b19-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B20 — Sun and grey line reports (#228)

- **Covers:** HW-63, HW-64
- **Intent:** Sun and Grey line both open the shared Sun & Moon report. Give the sun its own elevation curve, twilights and day-length trend, and give the grey line the per-band tiers and target overlap that `greyline.ts` can already reason about but never shows.
- **In scope:**
  - `SunReport` per section 26.8: rise / noon / set in local and UTC, civil, nautical and astronomical twilights, day-length delta vs yesterday, 24 h elevation curve with shaded twilight bands, polar day and night states
  - `GreyLineReport` per section 26.9: window start and end, state and countdown, 160 / 80 / 40 m tiers, mutual overlap window with the DX target, 24 h intensity chart, terminator map link
  - New computations: hourly sun elevation and zenith sampling, twilight instants, day-length delta, hourly grey-line intensity, mutual overlap between the QTH and target terminator windows
  - The shared Sun & Moon report stays wired to the Moon tile until B21 retires it
- **Out of scope:**
  - Anything moon or EME (B21)
  - Terminator rendering changes on the map
- **Files to touch:**
  - new `wall/reports/SunReport.tsx` and `wall/reports/GreyLineReport.tsx`
  - `wall/reports/SunMoonReport.tsx` (unwire the sun and grey-line tiles only)
  - `wall/reports/reports.test.tsx`
  - `wall/tiles/SunTile.tsx`, `wall/tiles/GreyLineTile.tsx`, `wall/tiles/index.ts`
  - new `src/lib/hamclock/sunCurve.ts` and `sunCurve.test.ts`
  - `src/lib/utils/greyline.ts` and `greyline.test.ts` (add the hourly intensity sampler and the overlap window)
  - `src/styles/hamclock-wall-report.css`
- **Do not touch:** `src/lib/utils/ionosphere.ts`, `src/lib/utils/moon.ts`, terminator layers
- **Style guide rules that apply:** §6 Data formatting (`formatClock` shows local and UTC together, `formatCountdown` for the window); §7 Reports; §1 Tile anatomy for the tile sub lines that change
- **Already available:**
  - sunrise, sunset, solar noon and day length in `SunMoonReport.tsx`
  - solar zenith and local solar hour in `src/lib/utils/ionosphere.ts:520,545`
  - `getGreylineVisualParams`, `isGreylineActiveForBand`, tiers normal / enhanced / peak (`src/lib/utils/greyline.ts`)
  - `useActiveLocation` and the DX target from the map store
- **Verification:** `npm run verify` and `npx vitest run src/lib/hamclock/sunCurve.test.ts src/lib/utils/greyline.test.ts src/components/map/hamclock/wall/reports`
- **Acceptance:**
  - [ ] The Sun tile opens a sun report with an elevation curve and three twilight bands.
  - [ ] Day length shows a signed change against yesterday.
  - [ ] Polar day and night render `SUN DOES NOT SET` / `SUN DOES NOT RISE` with the next transition, and the curve still draws.
  - [ ] The grey line report shows a tier per low band and, when a target is set, the mutual overlap window.
- **PR:** ≤ 15 files, title `feat(hamclock): sun and grey line reports [B20: HW-63, HW-64]`, branch `feat/hamclock-b20-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B21 — EME module and Moon report (#229)

- **Covers:** HW-65, HW-66
- **Intent:** The moon is currently a phase glyph. EME operators need the numbers that decide whether tonight is worth setting up for, and none of them exist in the app. Build one tested module and one EME-grade report on top of it.
- **In scope:**
  - New `src/lib/utils/eme.ts`: Earth-Moon path loss at 2 m / 70 cm / 23 cm from the topocentric range, degradation in dB against perigee, moon declination with the high / low declination word, sky-noise temperature including the galactic-plane penalty, Doppler shift from the topocentric range rate, and the mutual visibility window between the QTH and a target grid
  - `MoonReport` per section 26.10: `MOON` and `EME` tabs, band selector as segmented big buttons, 24 h elevation chart and a 28-day degradation chart with perigee and apogee labelled, sub-lunar point map link
  - Retire `SunMoonReport` once the Moon tile is rewired, since B20 already moved the sun and grey-line tiles off it
- **Out of scope:**
  - Satellite Doppler (`src/lib/utils/doppler.ts` is a different geometry and is not reused or modified)
  - Antenna modelling, elevation rotator control, or any bridge work
- **Files to touch:**
  - new `src/lib/utils/eme.ts` and `eme.test.ts`
  - `src/lib/utils/moon.ts` and `moon.test.ts` (export the topocentric range rate and declination; no behaviour change)
  - new `wall/reports/MoonReport.tsx`
  - `wall/reports/SunMoonReport.tsx` (delete once unreferenced), `wall/reports/reports.test.tsx`
  - `wall/tiles/MoonTile.tsx`, `wall/tiles/index.ts`
  - `src/styles/hamclock-wall-report.css`
- **Do not touch:** `src/lib/utils/doppler.ts`, satellite pages, `src/lib/utils/greyline.ts`
- **Style guide rules that apply:** §7 Reports (band selector is segmented big buttons inside the report, not a dropdown); §5 Spacing and hit targets (≥ 44 px); §6 Data formatting (dB signed, Hz integer, distances unit-resolved)
- **Already available:**
  - `getMoonConditions`, `getMoonSnapshot`, `getSublunarPoint`, topocentric distance (`src/lib/utils/moon.ts`)
  - `useActiveLocation` and the DX target grid
  - `HamClockButton` segmented controls in `wall/controls/`
  - `SolarSeriesChart` from B9
- **Verification:** `npm run verify` and `npx vitest run src/lib/utils/eme.test.ts src/lib/utils/moon.test.ts src/components/map/hamclock/wall/reports`
- **Acceptance:**
  - [ ] `eme.ts` has unit tests covering path loss at perigee and apogee, the declination word, sky noise on and off the galactic plane, Doppler sign on approach and recession, and an overlap window that is correctly empty when the two stations never see the moon together.
  - [ ] The Moon tile opens the EME report; the shared Sun & Moon report is gone and nothing imports it.
  - [ ] Changing the band changes path loss, Doppler and sky noise.
  - [ ] With no target grid the mutual window reads `NO TARGET SET`, never a computed window.
- **PR:** ≤ 15 files, title `feat(hamclock): EME module and moon report [B21: HW-65, HW-66]`, branch `feat/hamclock-b21-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B22 — Weather fetch extension, weather report, alerts report (#230)

- **Covers:** HW-67, HW-41, HW-68
- **Intent:** `fetchLocalWeather` asks Open-Meteo for one day and current conditions only, so the hourly and 7-day tiles B13 places have nothing to show and the weather report cannot have a chart. Extend the fetch, then build the Weather report and give alerts their own report instead of a list inside the tile.
- **In scope:**
  - `fetchLocalWeather` extended to `forecast_days=7` with an `hourly` block (temperature_2m, precipitation_probability, wind_speed_10m, pressure_msl) and a daily block (temperature_2m_max/min, weather_code, precipitation_sum). The returned shape stays a superset of today's so existing callers compile unchanged.
  - `WeatherReport` per section 26.11: `NOW`, `HOURLY`, `7-DAY` tabs, a fixed readout row under each chart instead of a cursor-following tooltip
  - `AlertsReport` per section 26.12: alert list on the left, selected alert on the right, 24 h count chart, `SHOW ON MAP` for alerts with geometry
  - Wire the B13 hourly and 7-day tiles to the extended payload
- **Out of scope:**
  - Radar and lightning reports (B14)
  - Alert area scoping and severity floor, which HW-18 delivers in B11
  - Any weather input to the propagation model (B25)
- **Files to touch:**
  - `src/lib/api/openMeteo.ts` and its test
  - `src/hooks/useLocalWeather.ts` and its test
  - `wall/reports/WeatherReport.tsx`, new `wall/reports/AlertsReport.tsx`, `wall/reports/reports.test.tsx`
  - `wall/tiles/WeatherTile.tsx` and the B13 hourly / 7-day tiles (wiring only)
  - `wall/tiles/AlertsTile.tsx`, `wall/tiles/index.ts`
  - `src/lib/api/weather.ts` `WeatherAlert` and its parser: keep `effective`, `expires`, `sender`, `urgency`, `certainty` and `areaDesc` from the NWS payload (the parser drops them today)
  - new `src/lib/weather/alertHistory.ts` and test: a rolling 24 h store of alert snapshots (id, severity, effective, expires) persisted in `localStorage`, appended on every fetch so expired alerts stay in the chart; a cold client shows `COLLECTING SINCE hh:mm UTC` over the hours it has not seen
  - `src/lib/utils/alertMatcher.ts` matches DX spots, not NWS alerts — leave it alone
  - `src/styles/hamclock-wall-report.css`
- **Do not touch:** `src/components/atmos/*`, `wall/config/WeatherConfig.tsx`, `wall/settings/*`
- **Style guide rules that apply:** §6 Data formatting (`resolveUnits`, `formatTemperature`, `formatSpeed`, `reportFooter` from the observation time added in B9); §7 Reports; empty states name the gap (`NO MAPPED ALERTS`, never `ALL CLEAR`)
- **Already available:**
  - `fetchLocalWeather`, `useLocalWeather`, `src/lib/api/weather.ts`
  - the observation timestamp on `LocalWeatherData` from B9
  - the active alerts feed behind `AlertsTile.tsx` and `src/lib/utils/alertMatcher.ts`
  - `SolarSeriesChart` and the report pin from B9
- **Verification:** `npm run verify` and `npx vitest run src/lib/api/openMeteo.test.ts src/hooks/useLocalWeather.test.ts src/components/map/hamclock/wall`
- **Acceptance:**
  - [ ] One Open-Meteo request returns current, hourly and 7-day data and existing callers are unchanged.
  - [ ] The weather report has three tabs, each with its own chart and a fixed readout row.
  - [ ] The alerts report shows severity, urgency, certainty, area and expiry for the selected alert and frames it on the map when it has geometry.
  - [ ] With no alerts the report reads `NO MAPPED ALERTS` and names the covered area.
- **PR:** ≤ 15 files, title `feat(hamclock): weather fetch extension, weather and alerts reports [B22: HW-67, HW-41, HW-68]`, branch `feat/hamclock-b22-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B23 — Radio Impact Model tile and report (#231)

- **Covers:** HW-69, HW-47
- **Intent:** `computeRIM` already turns lightning, flooding, NVIS viability, repeater health and ducting into a composite and four sub-scores, and none of it is on the wall. Make it a tile and a report, and fold the monitored regions in as the report's second tab. HW-47 moves here from B16.
- **In scope:**
  - `RimTile`: composite as the hero, worst sub-score as the sub line, placed on the Weather page and available to any rail
  - `RimReport` per section 26.13: `SCORE` and `REGIONS` tabs, four sub-scores with a one-sentence explanation each, the input facts, a 12 h composite chart, region re-scoping, lightning and river-gauge map links
  - A rolling 12 h composite series retained in `useRIM` (no new feed)
  - A missing input excludes its sub-score from the composite and labels the composite `PARTIAL` with the missing inputs named; defaults are never substituted
- **Out of scope:**
  - EmComm forms and activation (B16, HW-48)
  - New weather feeds; B22 already extended the only fetch that needed it
- **Files to touch:**
  - new `wall/tiles/RimTile.tsx`
  - new `wall/reports/RimReport.tsx`
  - `wall/tiles/index.ts`, `wall/tiles/tiles.test.tsx`, `wall/reports/reports.test.tsx`
  - `wall/pages.ts`, `wall/presets.ts`
  - `src/hooks/useRIM.ts` and its test (rolling series and per-sub-score availability)
  - `src/lib/atmos/rim.ts` and `rim.test.ts`: `computeRIM` drops a sub-score whose `dataAvailable` is false and renormalises the remaining weights instead of scoring a fallback value; it returns the reason for each sub-score and the list of excluded inputs. This is a scoring change and is covered by tests for every combination of one and two missing inputs; `AtmosPulse` consumers see the same composite when all inputs are present.
  - `src/components/atmos/MonitoredRegionManager.tsx` (props only)
  - `src/styles/hamclock-wall-report.css`
- **Do not touch:** `src/components/atmos/layers/*`, `src/pages/AtmosPulse.tsx`, `wall/settings/*`
- **Style guide rules that apply:** §1 Tile anatomy (one hero, one sub line); §7 Reports; §6 Data formatting (scores to one decimal, `NO DATA` names the gap)
- **Already available:**
  - `computeRIM` and `useRIM` with the composite and four sub-scores
  - `analyzeNVIS` (`src/lib/utils/nvis.ts`), `useLightning`, `useRiverGauges`, `useRepeaters`, `useDuctingForecast`, `useTEC`
  - `MonitoredRegionManager`, `RegionRIMCard`, `RIMScoreCard`
  - `SolarSeriesChart` from B9
- **Verification:** `npm run verify` and `npx vitest run src/hooks/useRIM.test.ts src/components/map/hamclock/wall`
- **Acceptance:**
  - [ ] A RIM tile exists on the Weather page and opens the RIM report.
  - [ ] Each sub-score explains itself in one sentence naming the inputs that moved it.
  - [ ] A missing input marks the composite `PARTIAL` and names what is missing; no sub-score is defaulted.
  - [ ] Monitored regions are reachable from the report and selecting one re-scopes it.
- **PR:** ≤ 15 files, title `feat(hamclock): radio impact model tile and report [B23: HW-69, HW-47]`, branch `feat/hamclock-b23-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B24 — Band activity, recent contacts and cluster chrome (#232)

- **Covers:** HW-70, HW-71, HW-72
- **Intent:** Band activity is the observed engine's own page and deserves history and a mode split; recent contacts has a tile and no report; and the DX cluster modal predates the report chrome. Finish the activity side of the wall.
- **In scope:**
  - `BandActivityReport` per section 26.14: `BANDS` and `TOP DX` tabs, stacked 6 h per-band chart, mode split, furthest spot, contributing feeds named, band rows that set the map's band focus
  - `RecentContactsReport` per section 26.15: today / week / month counts, unique DXCC, best DX, top band and mode, 30-day daily chart coloured by dominant band, selecting a day refills the facts
  - `ClusterDetailPopover` gains the `WallReport` shell, the pin, focus return and the standard footer. Chrome only: no layout change, no new data, no engine strip.
  - 6 h per-band history from a new `api/spots/band-history` edge route over the durable `band_hourly_stats` aggregate in Supabase (the only spot history that survives the 2 h `spot_history` window), plus a client-side 10-minute rolling store of the live counts for the most recent hour; 30-day log aggregation as a new computation over `logStore`
- **Out of scope:**
  - Cluster filters and the cluster config dialog (B11)
  - Editing QSOs from the wall
- **Files to touch:**
  - `wall/reports/BandActivityReport.tsx`, new `wall/reports/RecentContactsReport.tsx`, `wall/reports/reports.test.tsx`
  - `wall/tiles/BandActivityTile.tsx`, `wall/tiles/RecentContactsTile.tsx`, `wall/tiles/ClusterTile.tsx`, `wall/tiles/index.ts`
  - `src/components/map/ClusterDetailPopover.tsx` and `ClusterDetailPopover.test.tsx`
  - `src/lib/hamclock/recentContacts.ts` and `recentContacts.test.ts`
  - `src/lib/utils/bandActivity.ts` and `bandActivity.test.ts`
  - new `api/spots/band-history.ts` (+ handler test under `api/_lib/handlers/`) reading `band_hourly_stats`, and new `src/hooks/useBandHistory.ts`
  - `src/styles/hamclock-wall-report.css`
- **Do not touch:** `src/hooks/useBandVerdicts.ts` internals, `src/stores/dxStore.ts`, `src/lib/db/logStore`, the collector
- **Style guide rules that apply:** §7 Reports (`sr-only` twin for the top-DX list); §6 Data formatting (integers for counts, distances unit-resolved, `reportFooter` per feed); §3 Tone tokens for band colours
- **Already available:**
  - `useBandVerdicts`, `useBandLadder`, `src/components/map/bandHealthPresentation.ts`
  - `src/lib/utils/bandActivity.ts`, `modeNormalize.ts`
  - `src/lib/hamclock/recentContacts.ts`, `src/lib/db/logStore`, `dxccStore`
  - `WallReport`, `reportFooter` and the pin from B9
- **Verification:** `npm run verify` and `npx vitest run src/lib/hamclock/recentContacts.test.ts src/lib/utils/bandActivity.test.ts src/components/map/hamclock/wall src/components/map/ClusterDetailPopover.test.tsx`
- **Acceptance:**
  - [ ] Band activity shows 6 h of per-band history, the mode split and which feeds contributed.
  - [ ] With no spots the report names the window and still lists the feeds, one of which reads `WAITING`.
  - [ ] Recent contacts opens a report with a 30-day chart; an empty log reads `NO CONTACTS LOGGED`.
  - [ ] The cluster modal has the report title bar, pin, footer and focus return, and its content is otherwise unchanged.
- **PR:** ≤ 15 files, title `feat(hamclock): band activity, recent contacts and cluster chrome [B24: HW-70, HW-71, HW-72]`, branch `feat/hamclock-b24-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

### B25 — Model track: weather features in NowCast (backlog, #233)

- **Covers:** HW-73
- **Intent:** Terrestrial weather is an input the propagation model does not have. `operationalWeather.ts` and `ml/service/operational_weather.py` are **space** weather and are not this. This batch adds weather-derived features to NowCast. It starts only after every panel above is live, because until the wall is stable a model change cannot be told apart from a display change.
- **In scope:**
  - Candidate features: precipitation and lightning density near the path (rain scatter and QRN), surface pressure gradient and the ducting index for VHF/UHF, soil moisture as a ground-conductivity proxy for NVIS
  - A feature-contract version bump so `modelClient` rejects a serving version that does not carry the new columns
  - Offline evaluation against the held-out set before the model is promoted: no promotion without a measured improvement
  - Serving-side ingestion of the weather source on Railway, with the same freshness and OOD handling the existing operational inputs use
- **Out of scope:**
  - Any wall or report change; the reports read whatever the model returns
  - Live WSPR ingestion of any kind (decommissioned 2026-07-21, see `CLAUDE.md`)
  - Scheduling anything on the M5
- **Files to touch:** scoped when the batch starts. Expected: `ml/src/` feature builders, `ml/service/` serving, `src/lib/propagation/coreFeatureBuilder.ts`, `src/lib/propagation/modelClient.ts`, and one plan document under `ml/`. Wall files are explicitly not in this batch.
- **Do not touch:** `src/components/map/hamclock/wall/*`, any report, any tile
- **Style guide rules that apply:** none directly; the model returns values the existing reports already render, including `MODEL OFF` when a contract mismatch is detected
- **Already available:**
  - `src/lib/propagation/coreFeatureBuilder.ts`, `operationalWeather.ts` (space weather) as the pattern for freshness and source ages
  - `modelClient` `feature_contract` and `model_version` fields
  - the Open-Meteo hourly and daily payload from B22 as a client-side reference for what the serving side must ingest
- **Verification:** offline evaluation report plus `npm run verify` and `npx vitest run src/lib/propagation`
- **Acceptance:**
  - [ ] The feature contract is versioned and a mismatched serving version reports `MODEL OFF` rather than a silent wrong answer.
  - [ ] The retrained model beats the current one on the held-out set, with the numbers recorded in the plan document.
  - [ ] No wall file changed in this PR.
- **PR:** ≤ 15 files, title `feat(propagation): weather features in NowCast [B25: HW-73]`, branch `feat/prop-b25-<slug>`
- **Do not:** name, imply or add VOACAP anywhere; rebuild live WSPR ingestion; schedule work on the M5; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

## 25. Coverage check

Every register id maps to exactly one batch or to a shipped PR. HW-19 is parked:
the SDR decodes tile cannot leave Partial until a shared receiver exists, which
is outside this plan.

| ID    | Batch                    |
| ----- | ------------------------ |
| HW-01 | shipped (#167)           |
| HW-02 | shipped (#167)           |
| HW-03 | shipped (#167, #169)     |
| HW-04 | shipped (#167)           |
| HW-05 | shipped (#167)           |
| HW-06 | shipped (#169)           |
| HW-07 | shipped (#169)           |
| HW-08 | shipped (#169)           |
| HW-09 | shipped (#170)           |
| HW-10 | shipped (#170)           |
| HW-11 | B9                       |
| HW-12 | shipped (#171)           |
| HW-13 | shipped (#171)           |
| HW-14 | shipped (#171)           |
| HW-15 | shipped (#170, #171)     |
| HW-16 | shipped (#172)           |
| HW-17 | B9                       |
| HW-18 | B11                      |
| HW-19 | parked (shared receiver) |
| HW-20 | B7                       |
| HW-21 | B6                       |
| HW-22 | B1                       |
| HW-23 | B1                       |
| HW-24 | B8                       |
| HW-25 | B8                       |
| HW-26 | B5                       |
| HW-27 | B4                       |
| HW-28 | B11                      |
| HW-29 | B9                       |
| HW-30 | B9                       |
| HW-31 | B9                       |
| HW-32 | B3                       |
| HW-33 | B12                      |
| HW-34 | B12                      |
| HW-35 | B12                      |
| HW-36 | B10                      |
| HW-37 | B10                      |
| HW-38 | B11                      |
| HW-39 | B6                       |
| HW-40 | B13                      |
| HW-41 | B22                      |
| HW-42 | B14                      |
| HW-43 | B14                      |
| HW-44 | B13                      |
| HW-45 | B14                      |
| HW-46 | B15                      |
| HW-47 | B23                      |
| HW-48 | B16                      |
| HW-49 | B16                      |
| HW-50 | B2                       |
| HW-51 | B2                       |
| HW-52 | B4                       |
| HW-53 | B4                       |
| HW-54 | B2                       |
| HW-55 | B6                       |
| HW-56 | B17                      |
| HW-57 | B17                      |
| HW-58 | B18                      |
| HW-59 | B18                      |
| HW-60 | B19                      |
| HW-61 | B19                      |
| HW-62 | B19                      |
| HW-63 | B20                      |
| HW-64 | B20                      |
| HW-65 | B21                      |
| HW-66 | B21                      |
| HW-67 | B22                      |
| HW-68 | B22                      |
| HW-69 | B23                      |
| HW-70 | B24                      |
| HW-71 | B24                      |
| HW-72 | B24                      |
| HW-73 | B25                      |

## 26. Dedicated reports

Every tile opens a report built for that tile. The six shared reports shipped in
PR #170 (Solar, Sun & Moon, Weather, Forecast, Emcomm, Band activity) stay wired
as fallbacks: a tile keeps its shared report until its dedicated report lands,
and the shared report is retired only when nothing points at it any more.

### 26.0 The three-engine rule

Anywhere our propagation model appears — MUF, Reliability, the forecast matrix,
Best band now — the report shows all three engines side by side and makes that
comparison the headline. This is the product's core claim: nobody else puts
physics, a trained model and live observation next to each other and lets the
operator see where they disagree.

- **PHYSICS** — our simplified physics model in the spirit of ITU-R P.533: calibrated Chapman / CCIR layer heuristics, a secant-law oblique MUF and a multi-hop ray trace (`src/lib/utils/ionosphere.ts`, `rayTrace.ts`, `signal.ts`, `src/lib/hamclock/reliabilityForecast.ts`). It is not a P.533 implementation and the wall must not call it one: column titles and chart sources read `PHYSICS`, and any provenance text says "P.533-style physics model". A full P.533 port would be its own tracked item.
- **NOWCAST** — the trained NowCast / FutureCast models on Railway (`src/lib/propagation/modelClient.ts`, `src/hooks/useNowCastBandPredictions.ts`).
- **OBSERVED** — what the air actually shows: RBN / DX cluster / PSKReporter counts and the band-health ladder (`src/hooks/useBandVerdicts.ts`, `src/hooks/useBandLadder.ts`).

VOACAP is not implemented, is not planned, and is never shown as a fourth
column or named as a source. Reports that contrast us with VOACAP in prose are
wrong; the comparison we make is internal.

### 26.1 Shared component: `EngineComparisonStrip`

One component, reused by every model-backed report, rendered directly under the
report title and above the fact columns.

```ts
interface EngineReading {
  value: string; // display only, already formatted, one format per column
  comparable:
    | { kind: "number"; value: number; unit: "MHz" | "dB" | "pct" | "spots" }
    | { kind: "verdict"; verdict: "closed" | "marginal" | "open" }
    | { kind: "none" }; // unavailable engines carry no comparable
  detail?: string; // "SNR +9 dB", "412 spots / 30 min"
  confidence?: number; // 0-100, rendered as a bar, omitted when unknown
  updatedAt?: Date; // drives the freshness word ladder
  state: "ok" | "stale" | "unavailable";
}
interface EngineComparisonStripProps {
  subject: string; // "20 M TO JA", "MUF AT QTH"
  physics: EngineReading;
  nowcast: EngineReading;
  observed: EngineReading;
}
```

- Three equal columns titled `PHYSICS` · `NOWCAST` · `OBSERVED`. Each column is value (`--hc-t-hero-long` class rules from section 8), one detail line, one confidence/freshness line.
- **Agreement tone** is computed by `compareEngines()` from the three `comparable` fields only — never by parsing `value`. Two numbers of the same unit are mapped to a verdict step by the report's own thresholds (MUF: band usable / marginal / closed against the subject band; SNR and probability: the mode's `minSNR` margin and the 40 / 60 % lines); a `verdict` is used as is; `none` takes that engine out of the comparison and the word is computed from the remaining two (or reads `NO COMPARISON` with one). All three within one verdict step → `hc-good` and the word `AGREE`; one outlier → `hc-warn` and `SPLIT`; physics and nowcast on opposite sides of the open/closed line → `hc-bad` and `DISAGREE`. The word sits centred under the three columns with a one-line reason ("model sees an opening physics does not").
- `unavailable` renders `MODEL OFF` / `NO SPOTS` in `hc-dim-text`. A missing engine never falls back to another engine's number and never renders as zero. FutureCast horizons that `runtimeActivation` has not enabled are `unavailable`, not hidden, so the wall never implies the model was consulted.
- `stale` keeps the value but tones it `hc-warn` and shows the age. Freshness words come from `formatAge` (`wall/tokens.ts`); the strip never invents a timestamp.
- The strip is one row at ≥ 1600 px and stays one row below it by dropping the detail lines, never by scrolling.
- Applied to the **Best band now** report of section 10 as well: the strip sits above the ranked table with `subject` set to the leading band, and the SURPRISE ACTIVITY section becomes the strip's `DISAGREE` case made concrete.

### 26.2 MUF

- **Tabs:** `PATH` · `HOPS`
- **Hero:** `MUF 30.5 MHz · FOT 25.9 · LUF 4.2 — 20 M IS THE HIGHEST OPEN BAND`
- **Fact columns:** left — foF2 · MHz · P.533 Chapman; hmF2 · km · layer heights; M(3000)F2 · ratio · CCIR; D-layer absorption · dB · P.533; solar zenith · deg · computed; day/night at midpoint · word · computed. right — FOT · MHz · 0.85 × MUF; LUF · MHz · `calculateLUF`; take-off angle · deg · `hopElevationAngle`; hops · count · ray trace; total path loss · dB · ray trace; limiting hop · index + reason · ray trace.
- **Chart:** `MUF — 24 H · P.533 AT QTH`, with the FOT and LUF lines drawn as a shaded usable window behind it.
- **Interactions:** pointer along the chart reads out the hour, MUF, FOT and LUF; the `HOPS` tab is a row per hop (reflection point, day/night, f0F2, absorption, quality 0-100) and selecting a row flashes that reflection point on the map behind the dialog. `EngineComparisonStrip` with `subject: "MUF AT QTH"` — physics MUF, nowcast implied MUF from the highest band above 50 % probability, observed highest band with spots in the last 30 minutes.
- **Data:**
  - foF2, f0E, f0F1, hmF2, M(3000)F2, MUF(3000), zenith, geomagnetic latitude — `src/lib/utils/ionosphere.ts` — existing, not surfaced
  - D-layer absorption, LUF, FOT, `describeConditions` — `src/lib/utils/ionosphere.ts` — existing, not surfaced
  - per-hop reflection point, elevation, absorption, total path loss, limiting hop, viability — `src/lib/utils/rayTrace.ts` — existing, not surfaced
  - 24 h MUF history at QTH — `src/hooks/useMUFData.ts` + `src/lib/api/muf.ts` — new computation (sample the existing point function over the hour grid; no new feed)
- **Empty / stale:** no station set → `SET HOME IN SETTINGS` and the strip renders all three columns `unavailable`. SFI feed stale → physics column `stale` with its age; the chart keeps the last good series and dims the trailing segment.

### 26.3 Reliability

- **Tabs:** `NOW` · `BY HOUR`
- **Hero:** `20 M TO JA · OPEN · 78% · SNR +9 dB FOR FT8`
- **Fact columns:** left — band · label · `BAND_ORDER`; status · open/marginal/closed · reliability cell; confidence · 0-100 · reliability cell; SNR estimate · dB · reliability cell; mode threshold · dB · `MODE_PARAMETERS`. right — power · W · station profile; antenna gain · dBi + pattern · station profile; noise environment · word · noise model; path length · km · computed; hops · count · ray trace.
- **Chart:** `RELIABILITY — 24 H · P.533 + NOWCAST`, two lines (physics score, nowcast probability) with observed spot counts as faint bars behind them. This chart is the three-engine claim in one picture.
- **Interactions:** pointer reads out the hour and all three values; the `BY HOUR` tab is the hour × band grid with its `sr-only` table twin; selecting a cell sets the hero to that cell. `EngineComparisonStrip` with `subject` set to the current band and target.
- **Data:**
  - per-cell score, snrEstimate, confidence, status — `src/lib/hamclock/reliabilityForecast.ts` — existing, only score surfaced
  - mode thresholds and sigmoid margin — `reliabilityForecast.ts` `MODE_PARAMETERS` — existing, not surfaced
  - power, antenna gain pattern, noise environment inputs — `wall/tiles/useWallReliability.ts` — existing, not surfaced
  - core / personalized probability, confidence, ood_flags, top_factors, data_freshness — `src/lib/propagation/modelClient.ts` — existing, desk-only today
  - observed counts per band — `src/hooks/useBandVerdicts.ts` — existing
- **Empty / stale:** no target set → the report is QTH-wide and the hero says `NO TARGET — SHOWING QTH`. Model unreachable → nowcast column `MODEL OFF`, physics and observed still render, `DISAGREE` is not claimed.

### 26.4 Propagation forecast

The report behind the forecast matrix tile.

- **Tabs:** `MATRIX` · `HORIZONS`
- **Hero:** `BEST IN 6 H — 15 M · 71% · MODEL AND PHYSICS AGREE`
- **Fact columns:** left — leading band now · label · band verdict; leading band at +6 h · label · forecast; MUF now / at +6 h · MHz · P.533; Kp forecast · index · NOAA. right — model profile · `physics` or `nowcast` · `modelClient`; model version · string · `modelClient`; horizons active · list · `runtimeActivation`; data freshness · age · model response.
- **Chart:** `BAND SCORE — 48 H · P.533 + FUTURECAST`. Time on the x axis, one line per band in `BAND_ORDER`, physics solid and FutureCast dashed at the activated horizons, with a now marker. The 24 h × 2-day dot matrix moves to the `MATRIX` tab and keeps its `sr-only` twin.
- **Interactions:** pointer on the chart pins an hour and rewrites the fact columns to that hour; the `HORIZONS` tab lists +3 / +6 / +12 / +24 h rows with core and personalized probability, confidence, top factors and any OOD flag spelled out in words. `EngineComparisonStrip` sits above both tabs.
- **Data:**
  - 24 h × 2-day band × hour matrix — `wall/tiles/useWallReliability.ts` — existing
  - FutureCast horizons `[3, 6, 12, 24]` and the activation gate — `src/lib/propagation/runtimeActivation.ts`, `capabilityAccess.ts` — existing, gated off at the data layer
  - top_factors, assumptions, ood_flags, feature_contract — `src/lib/propagation/modelClient.ts` — existing, not surfaced
  - fallbackBands / staleInputBands / nowcastBands — `src/hooks/useNowCastBandPredictions.ts` — existing, not surfaced
- **Empty / stale:** horizons not activated → the `HORIZONS` tab renders one row per horizon with `MODEL OFF` and the reason, never an empty tab. Stale inputs → the affected bands are toned `hc-warn` and named in the strip's reason line.

### 26.5 Solar

- **Tabs:** `NOW` · `CYCLE`
- **Hero:** `SFI 168 · SSN 121 — RISING, BEST HF IN THREE MONTHS`
- **Fact columns:** left — SFI · sfu · NOAA SWPC; SFI 27-day forecast · sfu · NOAA flux forecast; SSN · count · SIDC; A-index · index · NOAA. right — cycle 25 position · month + phase · computed; smoothed SSN · count · SIDC; predicted cycle peak · date + value · NOAA; 10.7 cm trend · signed delta · computed.
- **Chart:** `NOW` tab `SFI — 30 D · NOAA SWPC` with the flux forecast continuing as a dashed tail; `CYCLE` tab `SSN — CYCLE 25 · SIDC / NOAA` monthly with the predicted curve behind the observed one.
- **Interactions:** pointer reads the day and value on both charts. No map link.
- **Data:**
  - SFI, SSN, A-index — `src/hooks/useSolarData.ts` — existing
  - solar flux forecast — resource `noaa-flux-forecast` (`sourcePolicies.ts`) — existing, never rendered
  - monthly sunspot history — `noaa-sunspots` / `useSunspots` — existing, latest scalar only today
  - cycle position — `SolarCycleContext` — existing
- **Empty / stale:** feed down → hero reads `WAITING` and the chart holds the last series with the gap drawn as a gap, never interpolated.

### 26.6 X-ray and flares

- **Tabs:** `FLUX` · `ABSORPTION` · `PROBABILITIES`
- **Hero:** `C2.1 — QUIET · LAST FLARE M1.4 AT 09:12 UTC`
- **Fact columns:** left — current class · letter + scale · GOES; 24 h peak · class + time · GOES; latest classified flare · class, region, start/peak/end · GOES events; R-scale now · R0-R5 · NOAA. right — D-RAP peak absorption · dB + region · NOAA D-RAP; HF blackout area · words · D-RAP; 1-day flare probability · C / M / X percentages · NOAA; proton event probability · percent · NOAA.
- **Chart:** `FLUX` tab `X-RAY FLUX — 24 H · GOES 0.1-0.8 nm` on a log axis with labelled B / C / M / X threshold rules and flare peaks marked; `ABSORPTION` tab `D-RAP ABSORPTION — 6 H · NOAA` as a max-absorption trace; `PROBABILITIES` tab has no chart, only the three-day probability grid with its `sr-only` twin.
- **Interactions:** pointer on the flux chart reads the minute and class; selecting a marked flare fills the fact columns with that event; `SHOW ON MAP` on the absorption tab turns on the D-RAP layer behind the dialog.
- **Data:**
  - X-ray flux history and thresholds — `SolarPulse.tsx:333` resources — existing, class strip only on the wall
  - latest classified flare event — `SolarPulse.tsx:291` — existing, not on the wall
  - D-RAP absorption grid — resource `noaa-drap` — existing, not on the wall
  - 1-day C/M/X and proton probabilities — resource `noaa-probabilities`, `useSolarData.ts:58` — existing, not on the wall
- **Empty / stale:** no flare in 24 h → `NO FLARES ABOVE B` (never `ALL CLEAR`). D-RAP unavailable → `NONE MAPPED` and the map link is disabled, not hidden.

### 26.7 Solar wind and geomagnetic

- **Tabs:** `WIND` · `GEOMAGNETIC` · `EVENTS`
- **Hero:** `Bz -8.4 nT SOUTH · 612 km/s · Kp 5 — STORM CONDITIONS`
- **Fact columns:** left — Bz · nT + direction word · DSCOVR; Bt · nT · DSCOVR; speed · km/s · DSCOVR; density · p/cm³ · DSCOVR. right — Kp now / 24 h max · index · NOAA; Dst · nT · Kyoto/NOAA; G-scale · G0-G5 · NOAA; proton flux ≥ 10 MeV · pfu · GOES; aurora oval reach · lowest latitude · OVATION.
- **Chart:** `WIND` tab `Bz AND SPEED — 24 H · DSCOVR` (Bz on the left axis with a zero rule, speed on the right); `GEOMAGNETIC` tab `Kp AND Dst — 3 D · NOAA`; `EVENTS` tab lists CME analyses and proton events with arrival estimates, no chart.
- **Interactions:** pointer reads the minute across both series; `SHOW AURORA ON MAP` enables the OVATION layer behind the dialog; selecting a CME row shows its speed, half-angle and estimated arrival.
- **Data:**
  - Bz, Bt, speed, density history — `SolarPulse.tsx:339,351,354` resources — existing, current values only on the wall
  - Kp history — existing on the wall; Dst — `useDstIndex` — existing, not on the wall
  - proton flux ≥ 10 MeV — `useProtonFlux` — existing, not on the wall
  - aurora oval OVATION + imagery — `src/lib/solar/mediaProducts.ts` — existing, not on the wall
  - CME analyses — NASA DONKI (`SolarPulse.tsx:308`) — existing, not on the wall
- **Empty / stale:** DSCOVR gap → the series shows the gap and the hero falls back to Kp alone with `SOLAR WIND WAITING`. No CMEs → `NONE ANALYSED IN 7 DAYS`.

### 26.8 Sun

- **Tabs:** none.
- **Hero:** `SUNSET 19:42 MDT / 01:42 UTC — 2 H 11 M OF DAYLIGHT LEFT`
- **Fact columns:** left — sunrise · local + UTC · computed; solar noon · local + UTC · computed; sunset · local + UTC · computed; day length · h m · computed. right — change since yesterday · signed m s · computed; civil twilight · start/end · computed; nautical twilight · start/end · computed; sun elevation now · deg · computed; azimuth now · deg · computed.
- **Chart:** `SUN ELEVATION — 24 H · COMPUTED AT QTH`, with the horizon at zero, the three twilight bands shaded and a now marker.
- **Interactions:** pointer reads the time, elevation and azimuth; no map link. The grey-line window is named in one line with a `SEE GREY LINE` link that opens that report.
- **Data:**
  - sunrise, sunset, solar noon, day length — existing (`SunMoonReport.tsx`)
  - solar zenith and local solar hour over the day — `src/lib/utils/ionosphere.ts:520,545` — existing, new computation to sample it hourly for the curve
  - civil / nautical / astronomical twilight instants — new computation in the sun helper alongside the existing rise/set solver
  - day-length delta vs yesterday — new computation (one extra solver call)
- **Empty / stale:** polar day or night → `SUN DOES NOT SET` / `SUN DOES NOT RISE` with the next transition date, and the elevation curve still renders.

### 26.9 Grey line

- **Tabs:** none.
- **Hero:** `GREY LINE PEAK · 160 M ENHANCED · 22 MIN LEFT`
- **Fact columns:** left — window start · local + UTC · computed; window end · local + UTC · computed; state · approaching/active/peak/fading · `greyline.ts`; time left · countdown · `formatCountdown`. right — 160 m · tier · `isGreylineActiveForBand`; 80 m · tier · same; 40 m · tier · same; target overlap · yes/no + minutes · new computation; next window · local + UTC · computed.
- **Chart:** `GREY-LINE INTENSITY — 24 H · COMPUTED AT QTH`, intensity 0-1 over the day with the current window highlighted and the per-band tier steps drawn as three stacked bands.
- **Interactions:** pointer reads the minute and tier per band; `SHOW TERMINATOR` focuses the map on the terminator behind the dialog; when a DX target is set, the mutual grey-line overlap window is a second highlighted region on the same chart.
- **Data:**
  - grey-line window, state, countdown — `src/lib/utils/greyline.ts` — existing
  - low-band beneficiaries 160/80/40 and tiers normal/enhanced/peak — `greyline.ts:19,50,215` — existing, active/inactive only on the wall
  - intensity over 24 h — `getGreylineVisualParams` — new computation (sample the existing function hourly)
  - mutual overlap with the target QTH — new computation in `greyline.ts` (both terminator windows intersected)
- **Empty / stale:** no window today (high latitude in summer) → `NO GREY LINE TODAY` with the next date. No target → the overlap row reads `NO TARGET SET`.

### 26.10 Moon and EME

EME is the reason this report exists; the moon phase graphic is the garnish, not
the point. The computations below do not exist anywhere in the app today and
land as one new module `src/lib/utils/eme.ts` with its own unit tests.

- **Tabs:** `MOON` · `EME`
- **Hero:** `MOON UP 4 H 12 M · EME DEGRADATION -1.8 dB · WINDOW WITH JA IN 2 H 40 M`
- **Fact columns:** left (MOON) — phase · name + percent · `moon.ts`; illumination · percent · `moon.ts`; altitude / azimuth · deg · `moon.ts`; moonrise / moonset · local + UTC · `moon.ts`; next full / new · date · `getMoonSnapshot`. right (EME) — distance · km · `moon.ts` topocentric; path loss · dB at the chosen band · new; degradation vs perigee · dB · new; declination · deg + high/low word · new; sky noise · K + word · new; Doppler · Hz at the chosen band · new; mutual window with target · start/end + duration · new.
- **Chart:** `MOON` tab `MOON ELEVATION — 24 H · COMPUTED AT QTH`; `EME` tab `EME DEGRADATION — 28 D · COMPUTED`, one line combining distance loss and sky noise so the operator can see the good nights of the month at a glance, with a now marker and the perigee and apogee days labelled.
- **Interactions:** a band selector (2 m / 70 cm / 23 cm) as segmented big buttons changes path loss, Doppler and sky noise; pointer on the 28-day chart reads the date and degradation; `SHOW SUB-LUNAR POINT` marks it on the map behind the dialog.
- **Data:**
  - phase, illumination, altitude, azimuth, moonrise / moonset — `src/lib/utils/moon.ts` — existing
  - topocentric distance, sub-lunar point, next full / new — `moon.ts:30,163,325` — existing, not surfaced
  - Earth-Moon path loss at band, degradation vs perigee — new computation (`eme.ts`, free-space loss over twice the topocentric range plus reflection efficiency)
  - moon declination and sky-noise temperature, cold-sky vs galactic-plane penalty — new computation (`eme.ts`)
  - Doppler shift at band from the topocentric range rate — new computation (`eme.ts`; the satellite `doppler.ts` is a different geometry and is not reused)
  - mutual visibility window between QTH and target grid — new computation (`eme.ts`, intersection of the two moonrise/moonset windows)
- **Empty / stale:** moon below the horizon → the hero gives the time to moonrise instead of the up-time and the EME facts stay visible with a `MOON DOWN` tone. No target grid → the mutual window row reads `NO TARGET SET`, never a fabricated window.

### 26.11 Weather

Delivers HW-41, which moves out of B13 into B22 together with the fetch
extension it depends on.

- **Tabs:** `NOW` · `HOURLY` · `7-DAY`
- **Hero:** `52 °F · WIND 14 mph NW · RAIN 20% TODAY`
- **Fact columns:** left — temperature · unit-resolved · Open-Meteo; feels like · unit-resolved · Open-Meteo; wind speed + direction · unit-resolved · Open-Meteo; gusts · unit-resolved · Open-Meteo. right — humidity · percent · Open-Meteo; pressure · hPa / inHg · Open-Meteo; precipitation today · unit-resolved · Open-Meteo; max rain chance today · percent · Open-Meteo; observation time · local + UTC · Open-Meteo.
- **Chart:** `NOW` tab `TEMPERATURE AND WIND — 24 H · OPEN-METEO`; `HOURLY` tab `HOURLY FORECAST — 48 H · OPEN-METEO` (temperature line, precipitation probability bars); `7-DAY` tab `DAILY HIGH AND LOW — 7 D · OPEN-METEO` with a condition glyph per day.
- **Interactions:** pointer on any chart reads that hour or day into a details line under the chart (no tooltip that follows the cursor — a fixed readout row). The gear opens the weather config dialog from B13; the alerts count line links to the Alerts report.
- **Data:**
  - current temp, wind, humidity, pressure, precipitation — `src/lib/api/openMeteo.ts` `fetchLocalWeather` — existing
  - hourly and 7-day series — `openMeteo.ts:49-96` — **new fetch**: the request is `forecast_days=1`, current + `precipitation_probability_max` only. Extend it to `forecast_days=7` with an `hourly` block (temperature_2m, precipitation_probability, wind_speed_10m, pressure_msl) and the daily block (temperature_2m_max/min, weather_code, precipitation_sum). Keep the existing return shape as a superset so `WeatherTile` and `useLocalWeather` callers are unchanged.
  - observation timestamp — added in B9 for the footer — existing after B9
- **Empty / stale:** no location → `SET HOME IN SETTINGS`. Fetch failure → the last good payload with its real age in the footer and a `hc-warn` tone; never a zero.

### 26.12 Alerts

- **Tabs:** none. The alert list is the left column, the selected alert fills the right.
- **Hero:** `2 ACTIVE · SEVERE THUNDERSTORM WARNING UNTIL 21:15 MDT`
- **Fact columns:** left — one row per active alert (severity chip · event name · expiry countdown), at most eight, `+N MORE` as the ninth row. right (selected alert) — severity · Extreme/Severe/Moderate/Minor · NWS; urgency · word · NWS; certainty · word · NWS; area · county / zone list · NWS; effective · local + UTC · NWS; expires · local + UTC + countdown · NWS; sender · office · NWS.
- **Chart:** `ALERTS IN AREA — 24 H · NWS`, a per-hour count bar coloured by the highest severity in that hour, so a wall viewer sees whether the situation is building or clearing.
- **Interactions:** selecting a row fills the right column and, if the alert has geometry, `SHOW ON MAP` frames it behind the dialog. Rows are ≥ 44 px and keyboard selectable.
- **Data:**
  - active alerts, severity, area, expiry, geometry — existing alerts feed (`AlertsTile.tsx`, `src/lib/utils/alertMatcher.ts`)
  - alert area scoping (home county / state / radius) and severity floor — delivered by HW-18 in B11 — existing after B11
  - severity, urgency, certainty, area, effective, expires, sender — `WeatherAlert` after the B22 parser extension (the current type carries none of the timing fields)
  - 24 h alert count history — `src/lib/weather/alertHistory.ts` rolling snapshot store from B22; the active-only NWS query cannot reconstruct history on its own, so the chart is honest about how much of the 24 h it has actually observed
- **Empty / stale:** no alerts → `NO MAPPED ALERTS` with the covered area named underneath, never `ALL CLEAR`. Feed stale → the count is kept with its age and the chart's trailing hours are dimmed.

### 26.13 Radio Impact Model

A new wall tile plus its report, and the same report is reachable from the
weather page. It closes HW-47, which moves out of B16 into B23.

- **Tabs:** `SCORE` · `REGIONS`
- **Hero:** `RIM 62 · DEGRADED — LIGHTNING AND FLOODING NEAR HOME`
- **Fact columns:** left — composite · 0-100 + word · `computeRIM`; HF impact · 0-100 · `computeRIM`; VHF/UHF impact · 0-100 · `computeRIM`; infrastructure risk · 0-100 · `computeRIM`; EmComm readiness · 0-100 · `computeRIM`. right — NVIS viability · word + band · `analyzeNVIS`; lightning · strikes / 15 min within radius · `useLightning`; flooding · gauges at or above action stage · `useRiverGauges`; repeaters · operational ratio · `useRepeaters`; tropo ducting · probability word · `useDuctingForecast`.
- **Chart:** `SCORE` tab `RIM COMPOSITE — 12 H · COMPUTED`, the composite line with the four sub-scores as thin lines behind it; `REGIONS` tab is the monitored-region list with a score per region and no chart.
- **Interactions:** selecting a sub-score explains it in one sentence with the inputs that moved it; selecting a region re-scopes the whole report to that region; `SHOW LIGHTNING` / `SHOW RIVER GAUGES` toggle those layers behind the dialog. The tile hero is the composite with the worst sub-score as the sub line.
- **Data:**
  - composite and four sub-scores — `src/lib/atmos/rim.ts` `computeRIM`, `src/hooks/useRIM.ts` — existing, not on the wall
  - NVIS viability — `src/lib/utils/nvis.ts` `analyzeNVIS` — existing
  - lightning strikes — `src/hooks/useLightning.ts` — existing
  - river gauge flood status — `src/hooks/useRiverGauges.ts` — existing
  - repeater operational ratio — `useRIM.ts:198-204`, `src/hooks/useRepeaters.ts` — existing
  - tropo ducting probability, TEC — `src/hooks/useDuctingForecast.ts`, `src/hooks/useTEC.ts` — existing
  - monitored regions and their RIM cards — `MonitoredRegionManager`, `RegionRIMCard` — existing
  - 12 h composite history — new computation (retain the rolling series in the hook; no new feed)
- **Empty / stale:** an input feed missing → that sub-score reads `NO DATA` and is excluded from the composite, with the composite labelled `PARTIAL` and the missing inputs named. The composite is never computed from defaults.

### 26.14 Band activity

This report is the OBSERVED engine's own page, so it carries no comparison
strip; it is what the strip's third column reads from.

- **Tabs:** `BANDS` · `TOP DX`
- **Hero:** `20 M LEADS · 412 SPOTS IN 30 MIN · 68 REPORTERS`
- **Fact columns:** left — leading band · label · `BAND_ORDER`; spots in window · count · spot feeds; unique reporters · count · spot feeds; window · minutes · config. right — CW / SSB / digital split · three counts · mode normalisation; furthest spot · km + call · computed; new band in the last hour · label or `NONE` · computed; feeds contributing · RBN / DX / PSK · source list.
- **Chart:** `BANDS` tab `SPOTS PER BAND — 6 H · RBN + DX CLUSTER`, stacked per band over time; `TOP DX` tab has no chart, it is the ranked call / band / distance / age list with its `sr-only` twin.
- **Interactions:** selecting a band row sets the band focus on the map behind the dialog; selecting a top-DX row centres that spot. The gear opens the band-list config from B11.
- **Data:**
  - per-band spot counts, reporters, hysteresis states — `src/hooks/useBandVerdicts.ts`, `src/components/map/bandHealthPresentation.ts` — existing
  - band ladder rows with `updatedAt` — `src/hooks/useBandLadder.ts` — existing
  - mode split and distance — `src/lib/utils/bandActivity.ts`, `modeNormalize.ts` — existing
  - 6 h per-band history — `api/spots/band-history` over `band_hourly_stats` (hourly buckets) joined with the client's own 10-minute live counts for the current hour — new in B24; the live spot window is only 2 h and the verdict log records state flips, not counts, so neither can back-fill the chart on a fresh load
- **Empty / stale:** no spots → `NO SPOTS IN WINDOW` with the window length named, and the feed list still shown so the operator can see which feed is quiet. Cluster disconnected → that feed row reads `WAITING`.

### 26.15 Recent contacts

- **Tabs:** none.
- **Hero:** `18 QSOS TODAY · LAST W1AW ON 20 M, 12 MIN AGO`
- **Fact columns:** left — today · count · logbook; this week · count · logbook; this month · count · logbook; unique DXCC this month · count · `dxccStore`. right — best DX this month · km + call · computed; top band · label + count · computed; top mode · label + count · computed; longest gap · h m · computed.
- **Chart:** `QSOS — 30 D · LOGBOOK`, a daily bar with the current day marked; bars are coloured by the dominant band of that day using the band tokens.
- **Interactions:** selecting a day fills the fact columns with that day; selecting the last-contact line opens that QSO's location on the map behind the dialog. No editing from the wall.
- **Data:**
  - recent contacts and counts — `src/lib/hamclock/recentContacts.ts` — existing
  - QSO records — `src/lib/db/logStore` — existing
  - DXCC resolution — `dxccStore` — existing
  - 30-day daily aggregation and best-DX computation — new computation in `recentContacts.ts`
- **Empty / stale:** empty log → `NO CONTACTS LOGGED` with a one-line pointer to the logbook, never a zero-filled chart. Not signed in / no local log → `NO LOGBOOK`.

### 26.16 DX cluster

The cluster already has its own detail modal (`ClusterDetailPopover`). It does
not get a new report. It gets the report chrome only: the `WallReport` shell,
the pin control, focus return to the tile, and the standard footer
`DATA: <cluster> · UPDATED hh:mm UTC · <age>` built with `reportFooter`. No
layout change, no new data, no engine strip.

### 26.17 Weather in the propagation model (backlog)

Weather is an input the model does not have. Once every panel above is live,
the model track adds weather-derived features to NowCast: precipitation and
lightning near the path (rain scatter and QRN), surface pressure gradients and
the ducting index for VHF/UHF, and soil moisture as a ground-conductivity proxy
for NVIS. This is training and serving work on the Railway model, not wall
work: new columns in the feature contract, a retrained base model, and a
`feature_contract` bump so `modelClient` rejects a mismatched serving version.
It is explicitly last and is not started until the panels are done, because
until then we cannot tell a model improvement from a display change.
