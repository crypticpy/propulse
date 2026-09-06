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
  bx_gsm: number | null;
  by_gsm: number | null;
  bt: number | null;
  solar_wind_speed: number | null;
  solar_wind_temperature: number | null;
  sunspot_number: number | null;
  xray_flux: number | null;
  proton_flux_10mev: number | null;
  dst_index: number | null;
  solar_wind_density: number | null;
  hp60: number | null;
  source_observed_at: Record<string, string | null>;
  source_status: Record<string, unknown>;
}

export interface PollIntervals {
  pskreporter: number;
  rbn: number;
  dxcluster: number;
  solar: number;
  forecasts: number;
  satellites: number;
  aggregator: number;
  forecastSnapshot: number;
  prune: number;
  dbSizeGuard: number;
  pathArchive: number;
  bandClimatology: number;
  verdictLadder: number;
  inferenceMonitor: number;
  modelSnapshot: number;
  pathRecency: number;
}

export interface RetentionDays {
  spots: number;
  health: number;
  solar: number;
  tle: number;
}

export interface ArchiveControls {
  pruningEnabled: boolean;
  forecastCompactionEnabled: boolean;
  pruneBatchSize: number;
  pathStats: PathArchiveControls;
}

export interface PathArchiveControls {
  /** Days of path_hourly_stats kept hot in Postgres; older days archive */
  hotDays: number;
  /** Delete archived days from the hot table. Fail closed — default false */
  pruneEnabled: boolean;
  /** Bound on days exported/pruned per scheduler tick */
  maxDaysPerRun: number;
}

export interface CollectorConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
  logLevel: LogLevel;
  enabledSources: Set<string>;
  healthPort: number;
  aggregationSettleMinutes: number;
  pollIntervals: PollIntervals;
  retention: RetentionDays;
  archive: ArchiveControls;
  /** /health degrades when the database exceeds this size */
  dbSizeBudgetMb: number;
}

export type LogLevel = "debug" | "info" | "warn" | "error";
