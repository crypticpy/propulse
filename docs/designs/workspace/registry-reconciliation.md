# Workspace registry reconciliation

Paper inventory for [#904](https://github.com/crypticpy/propulse/issues/904) (W-A3). What the widget registry claims versus what actually renders. **No code in this document's PR.** Counts were taken from `origin/main` at `6887f842` (2026-09-10) and are restated in the PR body with the same `grep` commands.

This is not a merge of catalogs. Implementation of "one widget registry" stays on [#715](https://github.com/crypticpy/propulse/issues/715) under epic [#623](https://github.com/crypticpy/propulse/issues/623). See [Decision on #715](#decision-on-715).

## Catalogs in play

| Catalog | File | What it is | Count |
| --- | --- | --- | --- |
| Workspace registry | `src/lib/workspace/registry.ts` `WIDGET_REGISTRY` | Densities, rail rules, bindings. No React. | **41** keys |
| Wall-seeded subset | `WALL_SEEDED_IDS` | Registry ids type-checked against `TileId` (`satisfies`) | **22** |
| Home-only ids | `HOME_ONLY_IDS` | Home dashboard widgets with no wall counterpart, per the comment | **17** |
| Wall tile map | `src/components/map/hamclock/wall/tiles/index.ts` `TileId` / `WALL_TILES` | Every tile a wall page can name, plus its React component | **26** |
| Home layout | `src/lib/home/layout.ts` `HOME_LAYOUT_ITEMS` | Home dashboard order, titles, summaries | **19** |
| Solar Pulse widgets | `src/lib/solar/widgetRegistry.ts` `SOLAR_WIDGETS` | Source dependencies and placement for Solar Pulse | **24** |
| Workspace live loaders | `src/components/workspace/widgetLoaders.ts` | Which registry ids have a real `/workspace` component at a density | work **3**, glance **1**, wall **0** |

Arithmetic that produces 41:

```
WALL_SEEDED_IDS (22)
+ HOME_ONLY_IDS (17)
+ mapHero (no wall tile; wall background, not a pickable widget)
+ heatMap (in TileId and WIDGET_REGISTRY, not in WALL_SEEDED_IDS)
= 41
```

`launches` is the 26th `TileId` and is **not** in that 41.

## Discrepancy table

Each row is a fact on `main` plus a proposed resolution for a later **code** PR. This paper does not apply them.

| ID | Fact | Proposed resolution |
| --- | --- | --- |
| D1 `launches` | `TileId` and `WALL_TILES` include `launches` (`LaunchesTile`, title "Launches"). `WIDGET_REGISTRY` has no `launches` key. `WALL_SEEDED_IDS` therefore cannot type-check it. | Add a registry entry: `id: "launches"`, title `"Launches"`, `densities: ["wall"]`, `phoneSize: "none"`, same wall-only shape as `pskStation` / `emcomm`. Append `"launches"` to `WALL_SEEDED_IDS`. Do not invent glance/work forms until a page asks. **Live registry count becomes 42.** |
| D2 `contests` | In `HOME_ONLY_IDS` with `densities: ["glance"]` only. Also a wall tile (`ContestsTile`). Wall title `"Contests"`; registry title `"Contest details"`. Home does **not** read the registry title: `src/lib/home/layout.ts` stores its own `title: "Contest details"` and `src/pages/Home.tsx` renders it through `homeItemTitle()`. | Dual-canvas, not home-only. Add `"wall"` to `densities`, add `"contests"` to `WALL_SEEDED_IDS`, remove it from `HOME_ONLY_IDS`. Keep glance for Home. Pick one title in the code PR; wall `"Contests"` vs Home `"Contest details"` is an owner call (this paper does not pick). Whichever title wins must be written to **both** catalogs — `WIDGET_REGISTRY` and `HOME_LAYOUT_ITEMS` — until #715 folds Home into the registry and removes the duplicate; changing only the registry leaves Home on the old title. |
| D3 `dxpeditions` | Same pattern as contests: `HOME_ONLY_IDS`, glance-only densities, and a wall tile (`DxpeditionsTile`). Titles already match (`"DXpeditions"`). | Dual-canvas. Add `"wall"` to `densities`, add `"dxpeditions"` to `WALL_SEEDED_IDS`, remove it from `HOME_ONLY_IDS`. Keep glance for Home. |
| D4 `heatMap` | In `TileId` / `WALL_TILES` (`HeatMapTile`, title `"Band heat map"`). In `WIDGET_REGISTRY` with `ALL_DENSITIES` (wall/glance/work) and title `"Band x continent heat map"`. **Not** in `WALL_SEEDED_IDS`, so a renamed/retired wall tile would not fail the `satisfies` check. Workspace loaders: work → `HeatMapPanel`, glance → `HeatMapStrip`, wall → empty (wall keeps its own tree; that empty map is intentional). | Add `"heatMap"` to `WALL_SEEDED_IDS`. Leave densities as `ALL_DENSITIES`. Leave `widgetLoaders` `wall: {}` alone. Title mismatch (wall short name vs registry long name) is an owner call in the same code PR as D2's title, or a one-line follow-up; do not treat it as a missing module. |
| D5 38 vs 41 | Epic [#892](https://github.com/crypticpy/propulse/issues/892) still says "3 of 38 registry widgets" and "picker offers all 38". `WIDGET_REGISTRY` has **41** keys. [#903](https://github.com/crypticpy/propulse/issues/903) already says "all 41 registry modules". There are no three phantom modules to invent or delete. | Treat **41** as the count of record. The "38" in #892's field-survey table is stale copy, not a catalog hole. Update that epic table when someone next edits #892 (not this paper). After D1, the count is **42**; #903's matrix should follow the live key list, not a frozen number. |
| D6 Home vs registry titles | All 19 `HOME_LAYOUT_ITEMS` ids exist in `WIDGET_REGISTRY`. `weather` and `moon` are on Home **and** wall-seeded (not in `HOME_ONLY_IDS`). Home still stores its own `title` / `summary`; registry has `title` only. | Expected until #715 folds Home into the registry. Not a missing id. Keep summaries on Home (or a `summary` field on the registry) when that merge runs. |
| D7 Solar Pulse catalog | `SOLAR_WIDGETS` is 24 widgets with hyphenated ids (`xray-current`, `kp-current`, …). None of those ids appear in `WIDGET_REGISTRY`. Conceptual overlap with wall tiles (`xray`, `solarWind`, `spaceWx`, `sun`) is not an id-level match. | Do **not** copy-paste Solar ids into the workspace registry from this paper. Folding Solar is #715 PR 1 and needs an id map (Solar Pulse widget ≠ wall tile). Keep #715 open for that work. |
| D8 What `/workspace` renders | The picker cannot offer all 41 ids on every canvas: `EmptyRailButton` and `settings/WidgetsTab` both filter entries through `canvasRulesFor(canvasType)`, so on workstation/tablet (`railDensities: ["work","glance"]`, `heroDensity: "work"`) the seven wall-only entries (`pskStation`, `reliability`, `muf`, `emcomm`, `wsjtx`, `sdrScope`, `sdrDecodes`) are excluded — at most 34 offerable before already-placed widgets are removed. Live loaders: `bestBand`, `cluster`, `heatMap` at `work`; `heatMap` at `glance`; nothing at `wall` density (the HamClock wall is a separate tree). `SpaceSlot` prints "Coming soon" for every other id/density. | Expected for the design-first epic. Not a registry bug. A `status: "planned"` field is still absent (`WidgetStatus` exists on the type but no entry uses it) — that is #892's field-survey row, not a #904 hole. |

`TileId` minus `WALL_SEEDED_IDS` is exactly `{contests, dxpeditions, heatMap, launches}` — D1–D4.

## Decision on #715

**Keep [#715](https://github.com/crypticpy/propulse/issues/715) open with [#623](https://github.com/crypticpy/propulse/issues/623).** Do not close it into #904.

Reasons:

- #715 is the **code** merge of three catalogs (Home, Solar, wall) into `registry.ts`. This issue is **paper**. Closing 715 would delete the implementation ticket.
- #715 is `blocked`, `size:L`, and still depends on #519 (SP-08) and #521 (SP-10). Wave B on #623 starts only after both are on `main`.
- #715's split still holds: (1) Solar catalog into the registry, (2) Home catalog into the registry, (3) delete dead catalog shims. D1–D4 above are small registry-row fixes that can ride with those PRs or land as a tiny follow-up; they do not replace the merge.
- Bundle rule in #715 still stands: do not import the wall tile barrel from the workspace route.

Findings from #715 that this paper records so the merge does not rediscover them:

1. Four catalogs still exist (registry data, wall `WALL_TILES`, Home layout, Solar Pulse). A fifth map (`widgetLoaders`) pairs ids to workspace components.
2. The registry comment still says it is seeded from "the 22 existing wall tiles" while `TileId` has 26.
3. Home, Solar, and the wall do **not** all read `WIDGET_REGISTRY` today. Home reads `HOME_LAYOUT_ITEMS`. Solar Pulse reads `SOLAR_WIDGETS`. The wall reads `WALL_TILES`.
4. Per-widget canvas eligibility already lives on registry `densities` / `canvasRules.ts` for workspace auto-dock. Wall pages do not consult that list; they name `TileId`s directly. That split is why D1–D3 can render on the wall while the registry calls them missing or home-only.

## Out of scope here

- Any edit under `src/`.
- Visual redesign, new widgets, or loader implementations.
- Closing or retitling #715 / #623 / #892.
- Choosing the contested display titles (D2, D4).
