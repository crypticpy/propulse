import { assertUniqueTilesPerPage } from "@/stores/hamclockDisplayStore";
import type { TileId } from "./tiles";

export interface WallPage {
  id: string;
  /** Shown in the footer pager, all caps. */
  title: string;
  /** Tiles the left rail shows on this page. */
  left: TileId[];
  /** Tiles the right rail shows on this page. */
  right: TileId[];
}

/**
 * Both rails follow the active page (wall spec §4): each page defines its
 * own left set and right set, no rail is fixed to one widget across pages,
 * and no tile appears twice on the same page. Composition below matches the
 * spec's page taxonomy table, using only tiles that ship today — tiles
 * marked _new_ there (Aurora, Watch matches, the weather/news tiles) are
 * left out until they land.
 */
export const HAMCLOCK_WALL_PAGES: readonly WallPage[] = [
  {
    id: "spots",
    title: "Spots & Activity",
    left: ["cluster", "bandActivity", "recentContacts"],
    right: ["bestBand", "greyLine", "muf", "reliability", "emcomm"],
  },
  {
    id: "solar",
    title: "Solar & Space Wx",
    left: ["xray", "solarWind", "spaceWx", "sun"],
    right: ["moon", "greyLine", "muf", "reliability"],
  },
  {
    id: "forecast",
    title: "Forecast",
    left: ["bestBand", "muf", "forecastMatrix", "reliability"],
    right: ["bandActivity", "cluster", "greyLine", "sun", "xray"],
  },
  {
    id: "weather",
    title: "Weather & Emergency",
    left: ["weather", "alerts"],
    right: ["emcomm", "moon"],
  },
  {
    id: "sdr",
    title: "SDR",
    left: ["sdrScope", "sdrDecodes"],
    right: ["bandActivity", "cluster", "bestBand"],
  },
];

// Fails at import time (and therefore in tests) if a future edit to the
// table above reintroduces a duplicate, rather than shipping it silently.
assertUniqueTilesPerPage(HAMCLOCK_WALL_PAGES);

export type WallRailSide = "left" | "right";

/** Tiles for one rail, clamping a stale persisted index back into range. */
export function wallPageTiles(index: number, side: WallRailSide): TileId[] {
  const page = HAMCLOCK_WALL_PAGES[wallPageIndex(index)];
  return page[side];
}

export function wallPageIndex(index: number): number {
  if (!Number.isInteger(index) || index < 0) return 0;
  return index % HAMCLOCK_WALL_PAGES.length;
}
