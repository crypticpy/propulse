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
 * The rails page independently (mock behaviour), so every page carries a
 * composition for each side: the left column is the tighter summary and the
 * right column carries one more tile, matching the approved mock where the
 * left rail runs four tiles and the right rail runs five.
 */
export const HAMCLOCK_WALL_PAGES: readonly WallPage[] = [
  {
    id: "spots",
    title: "Spots & Activity",
    left: ["bestBand", "cluster", "bandActivity", "greyLine"],
    right: ["bestBand", "cluster", "bandActivity", "recentContacts"],
  },
  {
    id: "solar",
    title: "Solar & Space Wx",
    left: ["xray", "solarWind", "spaceWx", "sun"],
    right: ["xray", "solarWind", "spaceWx", "sun", "weather"],
  },
  {
    id: "forecast",
    title: "Forecast",
    left: ["forecastMatrix", "muf", "reliability"],
    right: ["forecastMatrix", "reliability", "muf", "bandActivity"],
  },
  {
    id: "weather",
    title: "Weather & Emergency",
    left: ["weather", "alerts", "emcomm"],
    right: ["weather", "alerts", "emcomm", "moon"],
  },
  {
    id: "sdr",
    title: "SDR",
    left: ["sdrScope", "sdrDecodes"],
    right: ["sdrScope", "sdrDecodes", "bandActivity"],
  },
];

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
