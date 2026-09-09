import { lazy, type ComponentType } from "react";
import type { WallTileProps } from "@/components/map/hamclock/wall/HamClockTile";
import type { WidgetDensity } from "@/lib/workspace/types";
import "@/styles/hamclock-wall.css";
// `ClusterTile`'s report dialog draws `.hcr-*` chrome, which otherwise loads
// only via the separately lazy `HamClockView`, so a cold `/workspace` load
// needs it imported on this path too (#670 review).
import "@/styles/hamclock-wall-report.css";

type WidgetComponent = ComponentType<WallTileProps>;

/**
 * Registry widget id -> lazily loaded live component, one map per workspace
 * density (#670).
 *
 * Each wall-tile entry dynamically imports the SPECIFIC tile file, never the
 * `wall/tiles/index.ts` barrel (#656 postmortem): that barrel's facade
 * module is literally named `index.ts`, and a second reachable path into it
 * makes Rollup name the resulting shared chunk `index-*.js`, which collides
 * with the PWA precache's `assets/index-*.{js,css}` glob and pushed the
 * precache from 17 to 18 entries. Importing one tile file at a time still
 * makes that file's module a shared chunk between the wall route and this
 * one (both statically-in-the-wall-chunk and dynamically-imported-here), but
 * its facade is `<TileName>.tsx`, so the resulting chunk is named after the
 * tile and never matches the `index-*` glob. `HeatMapStrip`/`HeatMapPanel`
 * are workspace-native (`components/workspace/widgets/`) and never touch
 * this barrel-avoidance concern at all.
 *
 * `heatMap`'s "work" entry was `HeatMapTile` (the wall's tile, reused as a
 * shim) through #670; #661 replaces it with `HeatMapPanel`, the
 * workspace-native "work" density implementation (a rail/hero panel sized by
 * its CSS grid container, not the wall's fixed vh-scaled hero+sub layout).
 * `glance` gains its first entry here too: `HeatMapStrip`, mounted directly
 * by `OpsConsole` and available to any future glance surface. `wall` stays
 * empty — no canvas reads "wall" density widgets outside the wall itself,
 * which has its own tile tree.
 *
 * `BestBandTile` and `ClusterTile` ignore the `title` prop (they source their
 * own headline), and so do `HeatMapStrip`/`HeatMapPanel`. The loaders render
 * these with no props, matching the wall's title-less read.
 */
const WORK_LOADERS: Readonly<Partial<Record<string, WidgetComponent>>> = {
  bestBand: lazy(() =>
    import("@/components/map/hamclock/wall/tiles/BestBandTile").then((m) => ({ default: m.BestBandTile })),
  ),
  cluster: lazy(() =>
    import("@/components/map/hamclock/wall/tiles/ClusterTile").then((m) => ({ default: m.ClusterTile })),
  ),
  heatMap: lazy(() =>
    import("./widgets/HeatMapPanel").then((m) => ({ default: m.HeatMapPanel })),
  ),
};

const GLANCE_LOADERS: Readonly<Partial<Record<string, WidgetComponent>>> = {
  heatMap: lazy(() => import("./widgets/HeatMapStrip").then((m) => ({ default: m.HeatMapStrip }))),
};

const LOADERS_BY_DENSITY: Readonly<Record<WidgetDensity, Readonly<Partial<Record<string, WidgetComponent>>>>> = {
  wall: {},
  glance: GLANCE_LOADERS,
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

/**
 * Widget ids whose live tile reads the shared `useDXStore` cluster feed
 * (`ClusterTile`, `HeatMapTile`) instead of sourcing their own data. Neither
 * tile starts the feed itself, so whoever mounts them must also mount a
 * `useDXCluster()` consumer while one of these ids is placed (#670 review).
 */
export const DX_SOURCED_WIDGET_IDS: ReadonlySet<string> = new Set(["cluster", "heatMap"]);
