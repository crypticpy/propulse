import type { ComponentType } from "react";
import type { WallTileProps } from "../HamClockTile";
import { BestBandTile } from "./BestBandTile";
import { ClusterTile } from "./ClusterTile";
import { PlaceholderTile } from "./PlaceholderTile";

/**
 * Every tile the wall pages can reference. Pages are data, so adding a tile is
 * one file plus one line here. Slots whose real implementation lands in a
 * later phase point at `PlaceholderTile`, which renders the registered title
 * and says what it is waiting for.
 */
export type TileId =
  | "bestBand"
  | "cluster"
  | "bandActivity"
  | "greyLine"
  | "xray"
  | "solarWind"
  | "spaceWx"
  | "sun"
  | "weather"
  | "moon"
  | "forecastMatrix"
  | "reliability"
  | "muf"
  | "alerts"
  | "emcomm"
  | "sdrScope"
  | "sdrDecodes"
  | "recentContacts";

export interface WallTile {
  title: string;
  Component: ComponentType<WallTileProps>;
}

export const WALL_TILES: Record<TileId, WallTile> = {
  bestBand: { title: "Best band now", Component: BestBandTile },
  cluster: { title: "DX cluster", Component: ClusterTile },
  bandActivity: { title: "Band activity", Component: PlaceholderTile },
  greyLine: { title: "Grey line", Component: PlaceholderTile },
  xray: { title: "X-ray flux", Component: PlaceholderTile },
  solarWind: { title: "Solar wind", Component: PlaceholderTile },
  spaceWx: { title: "Space weather", Component: PlaceholderTile },
  sun: { title: "Sunrise / sunset", Component: PlaceholderTile },
  weather: { title: "Local weather", Component: PlaceholderTile },
  moon: { title: "Moon", Component: PlaceholderTile },
  forecastMatrix: { title: "3-day band forecast", Component: PlaceholderTile },
  reliability: { title: "24h reliability", Component: PlaceholderTile },
  muf: { title: "MUF", Component: PlaceholderTile },
  alerts: { title: "Weather alerts", Component: PlaceholderTile },
  emcomm: { title: "Emcomm", Component: PlaceholderTile },
  sdrScope: { title: "Band scope", Component: PlaceholderTile },
  sdrDecodes: { title: "Decodes", Component: PlaceholderTile },
  recentContacts: { title: "Recent contacts", Component: PlaceholderTile },
};
