/** Layer IDs for AtmosPulse overlays */
export type AtmosLayerId =
  | "radar"
  | "lightning"
  | "alerts"
  | "fires"
  | "goesCloud"
  | "tec"
  | "repeaters"
  | "riverGauges"
  | "rim"
  | "sst"
  | "aprs"
  | "shadowZones";

/** View mode for AtmosPulse */
export type AtmosViewMode = "2d" | "3d";

/** User-defined monitoring region */
export interface MonitoredRegion {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
}

/** RIM configuration preferences */
export interface RIMConfig {
  autoRefreshMs: number;
  showHfScore: boolean;
  showVhfScore: boolean;
  showInfraRisk: boolean;
  showEmcommScore: boolean;
}

/** RIM sub-score */
export interface RIMSubScore {
  value: number; // 0-100
  label: string;
  trend: "up" | "down" | "stable";
  dataAvailable: boolean;
}

/** RIM result for a monitored region */
export interface RIMResult {
  regionId: string;
  composite: number; // 0-100 weighted average
  hfBand: RIMSubScore;
  vhfUhf: RIMSubScore;
  infraRisk: RIMSubScore;
  emcommReadiness: RIMSubScore;
  updatedAt: number; // Date.now()
}

/** Default layer visibility */
export const DEFAULT_LAYER_VISIBILITY: Record<AtmosLayerId, boolean> = {
  radar: true,
  lightning: true,
  alerts: true,
  fires: false,
  goesCloud: false,
  tec: false,
  repeaters: false,
  riverGauges: false,
  rim: true,
  sst: false,
  aprs: false,
  shadowZones: false,
};

/** Default RIM config */
export const DEFAULT_RIM_CONFIG: RIMConfig = {
  autoRefreshMs: 5 * 60 * 1000, // 5 minutes
  showHfScore: true,
  showVhfScore: true,
  showInfraRisk: true,
  showEmcommScore: true,
};
