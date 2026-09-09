import { lazy, type ComponentType } from "react";
import type { WallTileProps } from "@/components/map/hamclock/wall/HamClockTile";
import type { WidgetDensity } from "@/lib/workspace/types";
import "@/styles/hamclock-wall.css";

type WidgetComponent = ComponentType<WallTileProps>;

/**
 * Registry widget id -> lazily loaded live component, one map per workspace
 * density (#670).
 *
 * Each entry dynamically imports the SPECIFIC tile file, never the
 * `wall/tiles/index.ts` barrel (#656 postmortem): that barrel's facade
 * module is literally named `index.ts`, and a second reachable path into it
 * makes Rollup name the resulting shared chunk `index-*.js`, which collides
 * with the PWA precache's `assets/index-*.{js,css}` glob and pushed the
 * precache from 17 to 18 entries. Importing one tile file at a time still
 * makes that file's module a shared chunk between the wall route and this
 * one (both statically-in-the-wall-chunk and dynamically-imported-here), but
 * its facade is `<TileName>.tsx`, so the resulting chunk is named after the
 * tile and never matches the `index-*` glob.
 *
 * Only "work" is populated: `WorkspacePage` ships the workstation canvas
 * only today (phone is #659), and the workstation canvas's rails and hero
 * read the "work" density exclusively (`canvasRules.ts`). `wall` and
 * `glance` are declared so this map's shape matches `WidgetDensity` and a
 * later canvas can add to it without a type change.
 *
 * Every wall tile ignores the `title` prop it accepts (`WallTileProps`'s own
 * doc comment: "only the placeholder reads title; live tiles source their
 * own headline and ignore it"), so these are rendered with no props, same as
 * the wall itself would for a title-less read.
 */
const WORK_LOADERS: Readonly<Partial<Record<string, WidgetComponent>>> = {
  bestBand: lazy(() =>
    import("@/components/map/hamclock/wall/tiles/BestBandTile").then((m) => ({ default: m.BestBandTile })),
  ),
  cluster: lazy(() =>
    import("@/components/map/hamclock/wall/tiles/ClusterTile").then((m) => ({ default: m.ClusterTile })),
  ),
  heatMap: lazy(() =>
    import("@/components/map/hamclock/wall/tiles/HeatMapTile").then((m) => ({ default: m.HeatMapTile })),
  ),
};

const LOADERS_BY_DENSITY: Readonly<Record<WidgetDensity, Readonly<Partial<Record<string, WidgetComponent>>>>> = {
  wall: {},
  glance: {},
  work: WORK_LOADERS,
};

/**
 * The live component for a widget id at a density, or `undefined` when the
 * widget has no live form at that density yet — the caller keeps its
 * placeholder card in that case.
 */
export function getWidgetComponent(widgetId: string, density: WidgetDensity): WidgetComponent | undefined {
  return LOADERS_BY_DENSITY[density][widgetId];
}
