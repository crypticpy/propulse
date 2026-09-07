import type { ComponentType } from "react";
import { registerWidgetConfig } from "@/stores/hamclockWidgetConfigStore";
import type { RegisteredWidgetConfig } from "@/stores/hamclockWidgetConfigStore";
import type { WallTileProps } from "../HamClockTile";
import { recentContactsConfig } from "../config/recentContactsConfig";
import { PskStationTile } from "./PskStationTile";
import { WsjtxTile } from "./WsjtxTile";
import { ActivationsTile } from "./ActivationsTile";
import { AlertsTile } from "./AlertsTile";
import { BandActivityTile } from "./BandActivityTile";
import { BestBandTile } from "./BestBandTile";
import { ClusterTile } from "./ClusterTile";
import { DxTargetTile } from "./DxTargetTile";
import { EmcommTile } from "./EmcommTile";
import { ForecastMatrixTile } from "./ForecastMatrixTile";
import { GreyLineTile } from "./GreyLineTile";
import { MoonTile } from "./MoonTile";
import { MufTile } from "./MufTile";
import { RecentContactsTile } from "./RecentContactsTile";
import { ReliabilityTile } from "./ReliabilityTile";
import { SdrDecodesTile } from "./SdrDecodesTile";
import { SdrScopeTile } from "./SdrScopeTile";
import { SolarWindTile } from "./SolarWindTile";
import { SpaceWxTile } from "./SpaceWxTile";
import { SunTile } from "./SunTile";
import { WeatherTile } from "./WeatherTile";
import { XrayTile } from "./XrayTile";

/**
 * Every tile the wall pages can reference. Pages are data, so adding a tile is
 * one file plus one line here.
 */
export type TileId =
  | "pskStation"
  | "activations"
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
  | "wsjtx"
  | "sdrDecodes"
  | "recentContacts"
  | "dxTarget";

export interface WallTile {
  title: string;
  Component: ComponentType<WallTileProps>;
  /** Set once a tile grows a gear and a configuration dialog (guide §9). `recentContacts` is the reference registration (B5). */
  config?: RegisteredWidgetConfig;
}

export const WALL_TILES: Record<TileId, WallTile> = {
  pskStation: { title: "PSK Reporter", Component: PskStationTile },
  activations: { title: "Activations", Component: ActivationsTile },
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
  forecastMatrix: { title: "24h band forecast", Component: ForecastMatrixTile },
  reliability: { title: "24h reliability", Component: ReliabilityTile },
  muf: { title: "MUF", Component: MufTile },
  alerts: { title: "Weather alerts", Component: AlertsTile },
  emcomm: { title: "Emcomm", Component: EmcommTile },
  wsjtx: { title: "WSJT-X", Component: WsjtxTile },
  sdrScope: { title: "Band scope", Component: SdrScopeTile },
  sdrDecodes: { title: "Decodes", Component: SdrDecodesTile },
  recentContacts: {
    title: "Recent contacts",
    Component: RecentContactsTile,
    config: registerWidgetConfig(recentContactsConfig),
  },
  dxTarget: { title: "DX target", Component: DxTargetTile },
};
