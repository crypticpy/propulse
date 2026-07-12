export interface NormalizedSpot {
  source: "pskreporter" | "rbn" | "dxcluster";
  spotted_at: string; // ISO 8601
  tx_callsign: string;
  tx_grid: string | null;
  tx_lat: number | null;
  tx_lon: number | null;
  rx_callsign: string;
  rx_grid: string | null;
  rx_lat: number | null;
  rx_lon: number | null;
  frequency_khz: number;
  band: string; // '160m'..'10m'
  mode: string | null;
  snr: number | null;
  wpm: number | null;
  comment: string | null;
  dxcc: number | null;
  continent: string | null;
}

export interface SolarSnapshot {
  captured_at: string;
  kp_index: number | null;
  sfi: number | null;
  bz_gsm: number | null;
  by_gsm: number | null;
  bt: number | null;
  solar_wind_speed: number | null;
  sunspot_number: number | null;
  xray_flux: number | null;
  proton_flux_10mev: number | null;
  dst_index: number | null;
  solar_wind_density: number | null;
}

export interface PollIntervals {
  pskreporter: number;
  rbn: number;
  dxcluster: number;
  solar: number;
  forecasts: number;
  satellites: number;
  aggregator: number;
  prune: number;
}

export interface RetentionDays {
  spots: number;
  health: number;
  solar: number;
  tle: number;
}

export interface CollectorConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
  logLevel: LogLevel;
  enabledSources: Set<string>;
  healthPort: number;
  pollIntervals: PollIntervals;
  retention: RetentionDays;
}

export type LogLevel = "debug" | "info" | "warn" | "error";
