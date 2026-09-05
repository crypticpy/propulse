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
| HW-21 | Layer registry with provenance text                                                         | Not started |                                       | feeds settings, help, status line                                                                                                                                                                                                                                   |
| HW-22 | Header parity: WALL/DESK toggle and reduced top rail                                        | Not started |                                       | owner bug: no way back to wall from desk                                                                                                                                                                                                                            |
| HW-23 | Layers popover viewport clamp and trigger move (interim)                                    | Not started |                                       | owner bug: menu renders off screen                                                                                                                                                                                                                                  |
| HW-24 | Desk on wall tiles, paged, scale token                                                      | Not started |                                       | retires accordion sidebar                                                                                                                                                                                                                                           |
| HW-25 | Desk cleanup: DE station block, duplicate weather, DX target                                | Not started |                                       |                                                                                                                                                                                                                                                                     |
| HW-26 | Centered settings panel with tabs                                                           | Not started |                                       | replaces all header popouts                                                                                                                                                                                                                                         |
| HW-27 | User-selected rails (Pages & Tiles tab, `railLayout`)                                       | Not started |                                       |                                                                                                                                                                                                                                                                     |
| HW-28 | World clocks bar                                                                            | Not started |                                       | open decision D1                                                                                                                                                                                                                                                    |
| HW-29 | Trend charts in reports, chart components read theme tokens                                 | Not started |                                       | reuse `SolarMiniChart`, `SolarSeriesChart`, `MetricCard`                                                                                                                                                                                                            |
| HW-30 | Report pin                                                                                  | Not started |                                       |                                                                                                                                                                                                                                                                     |
| HW-31 | Best Band Now ranked table report                                                           | Not started |                                       |                                                                                                                                                                                                                                                                     |
| HW-32 | Lightning bolt glyph (2D and 3D)                                                            | Not started |                                       | owner bug: white bloom dots                                                                                                                                                                                                                                         |
| HW-33 | Earthquakes tile and report (USGS)                                                          | Not started |                                       | open decision D4                                                                                                                                                                                                                                                    |
| HW-34 | Volcanoes tile and report (Smithsonian GVP)                                                 | Not started |                                       | open decision D4                                                                                                                                                                                                                                                    |
| HW-35 | Page taxonomy v2 (six pages, new tiles)                                                     | Not started |                                       | depends on HW-27, HW-33, HW-34                                                                                                                                                                                                                                      |
| HW-36 | Widget config contract and `hamclockWidgetConfigStore`                                      | Not started |                                       | section 13                                                                                                                                                                                                                                                          |
| HW-37 | News feeds config dialog (first configurable widget)                                        | Not started |                                       | over `feedStore`; verify-before-save via `api/feeds/rss.ts`                                                                                                                                                                                                         |
| HW-38 | Config dialogs: cluster, weather, band list, clocks, alerts                                 | Not started |                                       | one PR per widget                                                                                                                                                                                                                                                   |
| HW-39 | Map style chooser on the Map tab                                                            | Not started |                                       | section 14                                                                                                                                                                                                                                                          |
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
| HW-50 | Duplicate guard: store validation and picker grey-out                                       | Not started |                                       | owner: duplicate panels on screen                                                                                                                                                                                                                                   |
| HW-51 | Hero text fit: clamp, container units, length classes, tests                                | Not started |                                       | owner: text clips outside the widget                                                                                                                                                                                                                                |
| HW-52 | Use presets: five shipped, user-saved                                                       | Not started |                                       | section 7                                                                                                                                                                                                                                                           |
| HW-53 | No radio dependency: station tiles degrade to a neutral state                               | Not started |                                       | section 7                                                                                                                                                                                                                                                           |
| HW-54 | Both rails follow the page; remove fixed band-activity slot; de-duplicated shipped pages    | Not started |                                       | owner: right rail locked                                                                                                                                                                                                                                            |
| HW-55 | Persist a tile provider id in `mapStore` so Esri / Mapbox and OSM / CARTO become selectable | Not started |                                       | migration derives it from `mapStyle` + tier; section 14                                                                                                                                                                                                             |

Totals: 15 delivered, 4 partial, 36 not started.

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

## 24. Development breakdown

Each batch is one PR of at most 15 files and one self-contained brief. Batches
ship in this order: the production bug list first (B1 to B3), then rails
unlock and presets (B4), the settings panel (B5, B6), auto-page (B7), desk on
tiles (B8), charts, pin and table (B9), config dialogs (B10, B11), earth
events (B12), and weather consolidation (B13 to B16). `§` references point to
`docs/guides/hamclock-tile-system.md`.

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
  - Pages & Tiles picker (large cards, per-page per-rail slots, up/down order, greyed placed tiles, reset, save as preset) rendered inside `HamClockDisplaySettings` until B5
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
  - `HamClockSettingsDialog` on `AccessibleDialog`, opened by SETTINGS, closed by close/Escape/backdrop, ≤ 70 vw
  - Display, Pages & Tiles (moved from B4), Theme, Kiosk tabs
  - Layers and Map tabs as placeholders that say what is coming
  - Remove `HamClockDisplaySettings` and the wall controls popout
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
  - `wall/controls/*` primitives and `hamclockWidgetConfigStore` (B0, PR #B0)
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
  - `wall/controls/*` primitives and `hamclockWidgetConfigStore` (B0, PR #B0)
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
  - `wall/controls/*` primitives and `hamclockWidgetConfigStore` (B0, PR #B0)
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
  - `wall/controls/*` primitives and `hamclockWidgetConfigStore` (B0, PR #B0)
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

### B13 — Weather page, report and config (#209)

- **Covers:** HW-40, HW-41, HW-44
- **Intent:** Weather becomes a first-class page in the wall. Build the local-now, hourly, 7-day, tides, radar and lightning tiles, the Weather report with trend charts and a 7-day strip, and the weather config dialog.
- **In scope:**
  - Tiles: local now (existing `WeatherTile` upgraded), hourly, 7-day, tides where coastal, radar status, lightning status
  - Weather report: hero, temperature / wind / pressure 24 h charts, 7-day strip, pointer-over details
  - `WeatherConfig` panel: location, units override, radar cadence, alert area link
- **Out of scope:**
  - Radar and lightning reports (B14)
  - AtmosPulse layer ports (B15)
- **Files to touch:**
  - `wall/tiles/WeatherTile.tsx` and new weather tiles
  - `wall/reports/WeatherReport.tsx`
  - new `wall/config/WeatherConfig.tsx`
  - `src/hooks/useLocalWeather.ts`, `src/lib/api/openMeteo.ts` (extend, keep signatures)
  - `wall/pages.ts`, `wall/presets.ts`
- **Do not touch:** `src/components/atmos/*`, `wall/settings/*`
- **Style guide rules that apply:** §1 Tile anatomy (one graphic in place of the sub line, never both); §7 Reports; §6 Data formatting (`formatTemperature`, `formatSpeed`)
- **Already available:**
  - `useLocalWeather`, `src/lib/api/openMeteo.ts`, `src/lib/api/weather.ts`
  - `useActiveLocation`
  - `SolarSeriesChart` after B9 for trend charts
- **Verification:** `npm run verify` and `npx vitest run src/components/map/hamclock/wall src/hooks/useLocalWeather.test.ts`
- **Acceptance:**
  - [ ] The Weather page shows current conditions, hourly, 7-day, radar and lightning as tiles.
  - [ ] The weather report shows trend charts and a 7-day strip, and hovering a point shows its details.
  - [ ] Weather location and units can be changed from the tile's gear.
- **PR:** ≤ 15 files, title `feat(hamclock): weather page, report and config [B13: HW-40, HW-41, HW-44]`, branch `feat/hamclock-b13-<slug>`
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

### B16 — Regions, EmComm, `/atmos` retirement (#212)

- **Covers:** HW-47, HW-48, HW-49
- **Intent:** Finish parity: monitored regions and RIM scores become a report, EmComm forms open from the Emcomm tile, and `/atmos` redirects or aliases per D7.
- **In scope:**
  - `RegionsReport` from the alerts tile wrapping `MonitoredRegionManager` and the RIM cards
  - Emcomm report gains ICS-213, SitRep and activation entry points
  - `/atmos` route change in `App.tsx`; register rows HW-40 to HW-49 flipped to Delivered
- **Out of scope:**
  - Deleting `src/components/atmos/*` (a later cleanup once nothing imports it)
- **Files to touch:**
  - new `wall/reports/RegionsReport.tsx`
  - `wall/reports/EmcommReport.tsx`
  - `src/components/atmos/emcomm/*` (props only)
  - `src/App.tsx`, `src/pages/AtmosPulse.tsx`
- **Do not touch:** `src/components/atmos/layers/*`, `wall/settings/*`
- **Style guide rules that apply:** §7 Reports; §13 What not to do
- **Already available:**
  - `useRIM`, `MonitoredRegionManager`, `RegionRIMCard`, `RIMScoreCard`
  - `src/components/atmos/emcomm/*`
- **Verification:** `npm run verify` and `npx vitest run src/components/map/hamclock/wall/reports src/App.test.tsx`
- **Acceptance:**
  - [ ] Monitored regions and their RIM scores are reachable from the alerts tile.
  - [ ] ICS-213, SitRep and activation open from the Emcomm tile.
  - [ ] Visiting /atmos lands on the map Weather page (or the alias, per D7).
- **PR:** ≤ 15 files, title `feat(hamclock): regions, emcomm, `/atmos` retirement [B16: HW-47, HW-48, HW-49]`, branch `feat/hamclock-b16-<slug>`
- **Do not:** add flyouts or side panels; open anything on hover; put a scroll region inside a tile, rail, report or settings tab; hard-code colours, hex values or Tailwind colour classes; relax bundle budgets, lint rules or thresholds; force push. Work in a worktree branched from `origin/main`.

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
| HW-41 | B13                      |
| HW-42 | B14                      |
| HW-43 | B14                      |
| HW-44 | B13                      |
| HW-45 | B14                      |
| HW-46 | B15                      |
| HW-47 | B16                      |
| HW-48 | B16                      |
| HW-49 | B16                      |
| HW-50 | B2                       |
| HW-51 | B2                       |
| HW-52 | B4                       |
| HW-53 | B4                       |
| HW-54 | B2                       |
| HW-55 | B6                       |
