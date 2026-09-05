# HamClock Tile System — Style Guide

> Rules for tiles, reports and settings rows in the HamClock view. These rules
> are the review checklist for any PR that touches `src/components/map/hamclock/`
> and the reference when the same patterns are adopted elsewhere in the app.
> Specification: `docs/designs/hamclock-wall-spec.md`.

Each rule has a one-line why. When a rule and a screenshot disagree, the rule
wins until the rule is changed here.

---

## 1. Tile anatomy

A tile is title, hero, sub line. Three lines, in that order, and nothing else.
A tile with one clear value beats a tile with six. When in doubt, show less.

**Why:** the wall is read from ten feet. A fourth line is unreadable there and
turns the tile into a list.

```
BEST BAND NOW              ← title, small caps, dim
30m  HOT                   ← hero, one value plus optional one-word state
36 obs · 30 rx             ← sub line, context or freshness
```

- Do: `BestBandTile` (`src/components/map/hamclock/wall/tiles/BestBandTile.tsx`).
- Don't: a label-left / value-right row list with mixed number formats (the retired `HamClockLocationConditions` layout).
- A tile may replace the sub line with one small graphic (moon phase, sun arc, four-dot ladder). Never both.
- The tile is one `<button>`; `onOpen` opens its report and `openLabel` names it. See `HamClockTile.tsx`.

## 2. Type scale

| Token            | Use                    | Face                         |
| ---------------- | ---------------------- | ---------------------------- |
| `--hc-t-title`   | tile titles            | `--hc-font-body`, small caps |
| `--hc-t-small`   | captions, footers      | `--hc-font-mono`             |
| `--hc-t-body`    | sub lines, table cells | `--hc-font-mono` for values  |
| `--hc-t-mid`     | secondary values       | `--hc-font-mono`             |
| `--hc-t-hero`    | tile hero              | `--hc-font-display`          |
| `--hc-t-hero-lg` | one-word verdicts      | `--hc-font-display`          |

Declared in `src/styles/hamclock-wall.css` in vh units, multiplied by the
density scale token. Pulse maps display to Orbitron, values to JetBrains Mono and
body to Inter; classic and brass swap the display and mono faces through the
theme, not through the component.

**Why:** one scale means wall and desk differ by one number, and a theme can
change the voice without touching a tile.

- Do: `font-size: var(--hc-t-hero)`.
- Don't: `text-4xl`, `text-[2.5rem]`, or any px size inside a tile.

## 3. Tone tokens

State colour comes from five classes: `hc-good`, `hc-warn`, `hc-bad`,
`hc-info-text`, `hc-accent-text`, plus `hc-dim-text` for de-emphasis.

`--hc-good-rgb`, `--hc-warn-rgb` and `--hc-bad-rgb` derive from
`--color-excellent-rgb`, `--color-caution-rgb` and `--color-alert-rgb` in
`src/styles/design-tokens.css`, so the colour-blind palettes compose with every
theme.

**Why:** a hard-coded green is invisible to a deuteranopic operator and wrong
on the brass theme.

- Do: `className={kpTone(kp).tone}` (helpers in `wall/tokens.ts`).
- Don't: `text-signal-green`, `#00ff88`, or `style={{ color }}` in a tile or report.
- Tone helpers return both the class and a state word (`TONE_STATE`) so the state can be spoken as well as coloured.

## 4. Theme token contract

Every theme block in `src/styles/hamclock-themes.css` declares these and only
these. A tile may consume any of them; a tile may not invent a new one without
adding it to all three themes.

| Token                            | Meaning                              |
| -------------------------------- | ------------------------------------ |
| `--hc-bg`                        | page background                      |
| `--hc-panel`                     | opaque rail / dialog surface         |
| `--hc-glass`                     | translucent rail surface (wall)      |
| `--hc-blur`                      | backdrop blur radius for glass       |
| `--hc-line`                      | hairline separators and borders      |
| `--hc-fg`                        | primary text                         |
| `--hc-dim`, `--hc-dim2`          | secondary and tertiary text          |
| `--hc-accent-rgb`                | brand accent triple                  |
| `--hc-info-rgb`                  | informational triple                 |
| `--hc-good-rgb` / `warn` / `bad` | state triples (inherit from palette) |
| `--hc-font-display`              | hero face                            |
| `--hc-font-mono`                 | value face                           |
| `--hc-font-body`                 | title and prose face                 |
| `--hc-display-weight`            | hero weight                          |
| `--hc-radius`                    | corner radius                        |
| `--hc-glow`                      | 0 or 1, multiplies every glow        |
| `--hc-state-bar`                 | thickness of the tile state bar      |

Resolved colours (`--hc-accent`, `--hc-info`, `--hc-good`, `--hc-warn`,
`--hc-bad`) are computed once from the triples and never redeclared per theme.

**Why:** a closed contract is what makes a fourth theme a one-file change.

## 5. Spacing and hit targets

- Rail gap `--hc-gap`, tile padding `--hc-pad`, both vh-based.
- The whole tile is clickable. Minimum tile height is 44 px at desk scale, and buttons inside dialogs are at least 44 × 44 px.
- No element inside a tile, rail or report scrolls. If content does not fit, the tile shows less and the report shows the rest.

**Why:** small targets and nested scroll regions are the two things the wall's
audience cannot use from a couch or with a remote.

- Do: `ForecastMatrixTile` shows the next four hours; `ForecastReport` shows all 24.
- Don't: `overflow-y-auto` inside a tile (the retired `BandConditionsPanel` pattern).

**Hero text must fit its container.** The hero size is `clamp()`ed on the vh
token, the tile is a size container (`container-type: inline-size`) so long
values scale in `cqw`, and `HamClockTile` picks a size class from the string
length: short (≤ 4 chars) `--hc-t-hero-lg`, medium (≤ 8) `--hc-t-hero`, long
`--hc-t-hero-long`. A value that still overflows after layout is measured and
shrunk one step. Every tile test asserts the class for its longest real value.

**Why:** at wall scale "NO MAPPED ALERTS" is wider than the rail, and clipped
text on a TV reads as broken.

- Do: `heroSizeClass("NO MAPPED ALERTS")` returning the long class, and a test that asserts it.
- Don't: `overflow: hidden`, `text-overflow: ellipsis`, or a smaller hard-coded size on one tile. Clipping is a bug; hiding it is not a fix.

## 6. Data formatting

- Temperatures and speeds go through `resolveUnits`, `formatTemperature` and `formatSpeed` in `src/lib/hamclock/units.ts`. The operator's unit choice is read from `hamclockDisplayStore.units`.
- Clocks go through `formatClock(date, zone)` in `wall/tokens.ts`. Show local and UTC together, never one alone, in headers and sun/moon times.
- Countdowns go through `formatCountdown(minutes)`.
- Every report ends with a footer: `DATA: <source> · UPDATED hh:mm UTC · <age>`. The age comes from the feed being displayed, not from a neighbouring feed.
- Empty states name the gap: `NONE MAPPED`, `NO MAPPED ALERTS`, `WAITING`, `NO RECEIVER`. Never `ALL CLEAR` for a feed whose coverage does not support the claim. See `WeatherReport.tsx` and `EmcommReport.tsx`.
- Numbers keep one format per column: one decimal place for scores, integers for counts, signed with a sign for deltas.

**Why:** the wall is a trust instrument. A stale or over-claiming value costs more than a blank one (see `docs/decisions/ADR-SOLAR-DATA-TRUTH.md`).

## 7. Reports

Built on `WallReport` (`wall/reports/WallReport.tsx`), which wraps
`AccessibleDialog` with `chrome="bare"`.

- Anatomy: title with pin and close; verdict strip or scale bars; graphic on the left; two-column label/value table on the right; one trend chart; footer.
- The dialog never exceeds 90 vw × 88 vh and never scrolls. More content means a second tab inside the report.
- Charts reuse `src/components/solar/SolarMiniChart.tsx`, `SolarSeriesChart.tsx` and the `MetricCard` sparkline. They must take their colours from `--hc-*` tokens, not Tailwind classes.
- Every visual grid has an `sr-only` `<table>` twin (`ForecastReport.tsx` sets the pattern).
- Close returns focus to the opening tile.
- Styles live in `src/styles/hamclock-wall-report.css` under the `hcr-` prefix.

## 8. Settings rows

- A row is icon · name · provenance line · optional caveat · one large `ON` / `OFF` button that spells the state.
- Rows with options carry a gear that expands the row inline. No second popover.
- Row height is at least 56 px at desk scale. Text is `--hc-t-body`, never caption size.
- Tabs never scroll; split the tab instead.
- Dialogs open on click and close on close, Escape or backdrop. Never on pointer leave.

**Why:** hover-opened menus close when the hand drifts, and small switches read as decoration.

## 9. Configuration dialogs

Any widget with options gets a gear that opens a centered configuration dialog
on the report shell (`WallReport`). Spec: `docs/designs/hamclock-wall-spec.md`
section 13.

**Row anatomy:** category chip (tone colour) · name · one-line description ·
status line (`— · NOT YET FETCHED` or `UPDATED hh:mm · n ago`) · big `ON` /
`OFF` · optional `REFRESH`. Same row as the Layers tab.

**Segmented choices.** A setting with a fixed set of values is a row of big
buttons with one lit. Never a `<select>`.

**Why:** a dropdown needs a precise click and hides the other choices; a
segmented row is readable and clickable from the couch.

**Verify before save.** A user-entered URL is fetched server-side through the
edge proxy (`api/feeds/rss.ts`) and must return a parsed title before the ADD
button enables. The browser never fetches the URL itself.

**Why:** CORS, mixed content and private-network probes all disappear when the
proxy is the only fetcher, and the user sees a real title before committing.

**No scroll.** More than eight rows paginates by category tab. The dialog never
grows past the report size limits.

**Contract.** Declare `config: { schema, defaults, ConfigPanel }` on the tile's
`WALL_TILES` entry; values persist per tile id in `hamclockWidgetConfigStore`
and are validated through `schema` on read. Widgets that already own a store
(`feedStore`, `dxStore`) wrap it instead of copying it.

- Do: a `Fetch every` row with 15 / 30 / 60 / 120 as four buttons.
- Don't: a text input for minutes, a native select, or a form that saves an unverified URL.

## 10. How to add a tile

1. Create `wall/tiles/<Name>Tile.tsx` rendering `HamClockTile` with title, hero, sub line, and `onOpen` if it has a report.
2. Add the id to `TileId` and a `WALL_TILES` entry in `wall/tiles/index.ts`.
3. Add it to a page in `wall/pages.ts` (and to the shipped `railLayout` default once HW-27 lands).
4. Write `wall/tiles/tiles.test.tsx` cases: renders with data, renders its empty state, opens its report.
   If the tile has options, add `config` to its registry entry (section 9) and a test that the panel round-trips through the store.
5. If it has a report, add `wall/reports/<Name>Report.tsx` on `WallReport` with the footer and an `sr-only` table for any grid, plus a case in `reports/reports.test.tsx`.
6. Confirm the tile reads no hard-coded colour or size: `grep -n "#\|text-\[" <file>` should return nothing.

## 11. How to add a page

1. Add an entry to `HAMCLOCK_WALL_PAGES` with a title and both rail compositions within the slot limits.
2. Add a kiosk default scene in `src/stores/kioskStore.ts` only if the page should be part of the shipped playlist.
3. Update the page taxonomy table in the spec.

## 12. How to add a theme

1. Add the theme id to `HAMCLOCK_THEMES` in `src/stores/hamclockDisplayStore.ts`.
2. Add a `[data-hamclock-theme="<id>"]` block in `src/styles/hamclock-themes.css` declaring every token in section 4. Do not redeclare the state triples.
3. If the theme uses a web font, add its stylesheet href to `HAMCLOCK_THEME_FONT_HREF` in `src/lib/hamclock/themeFonts.ts`.
4. Add the miniature preview label in `HamClockThemePicker.tsx` and a test case.
5. Check contrast: dim text on the glass surface must stay at or above 7:1 over the brightest basemap.

## 13. What not to do

- Flyouts or side panels of any kind (see CLAUDE.md UX rules).
- Menus that open on hover or close on pointer leave.
- Scrolling inside a tile, a rail, a report or a settings tab.
- Hard-coded colours, hex values or Tailwind colour classes in HamClock components.
- Label-left / value-right rows with mixed formats in place of title, hero, sub line.
- Duplicating header facts (callsign, grid, coordinates) inside a tile.
- Claiming a clear state for a feed that does not cover the question.
- Adding a fourth line to a tile because the data is interesting. Put it in the report.
- Dropdowns or native selects in a configuration dialog. Use segmented buttons.
- Saving a user-entered URL without a server-side verify.
- Hiding clipped hero text with `overflow: hidden` or an ellipsis.
- Placing the same tile on both rails of a page.
