import type { ComponentType } from "react";
import type { WallTileProps } from "../HamClockTile";
import { BandActivityTile } from "./BandActivityTile";
import { BestBandTile } from "./BestBandTile";
import { ClusterTile } from "./ClusterTile";
import { GreyLineTile } from "./GreyLineTile";
import { MoonTile } from "./MoonTile";
import { PlaceholderTile } from "./PlaceholderTile";
import { RecentContactsTile } from "./RecentContactsTile";
import { SolarWindTile } from "./SolarWindTile";
import { SpaceWxTile } from "./SpaceWxTile";
import { SunTile } from "./SunTile";
import { WeatherTile } from "./WeatherTile";
import { XrayTile } from "./XrayTile";

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
  bandActivity: { title: "Band activity", Component: BandActivityTile },
  greyLine: { title: "Grey line", Component: GreyLineTile },
  xray: { title: "X-ray flux", Component: XrayTile },
  solarWind: { title: "Solar wind", Component: SolarWindTile },
  spaceWx: { title: "Space weather", Component: SpaceWxTile },
  sun: { title: "Sunrise / sunset", Component: SunTile },
  weather: { title: "Local weather", Component: WeatherTile },
  moon: { title: "Moon", Component: MoonTile },
  forecastMatrix: { title: "3-day band forecast", Component: PlaceholderTile },
  reliability: { title: "24h reliability", Component: PlaceholderTile },
  muf: { title: "MUF", Component: PlaceholderTile },
  alerts: { title: "Weather alerts", Component: PlaceholderTile },
  emcomm: { title: "Emcomm", Component: PlaceholderTile },
  sdrScope: { title: "Band scope", Component: PlaceholderTile },
  sdrDecodes: { title: "Decodes", Component: PlaceholderTile },
  recentContacts: { title: "Recent contacts", Component: RecentContactsTile },
};
