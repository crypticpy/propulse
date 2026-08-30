import type { CollectorConfig } from "./types.js";

/** Parse an env var as milliseconds. Accepts seconds (e.g. "300") and returns ms. */
function parseIntervalMs(
  envVar: string | undefined,
  defaultMs: number,
): number {
  if (!envVar) return defaultMs;
  const seconds = parseInt(envVar, 10);
  if (isNaN(seconds) || seconds < 10) return defaultMs;
  return seconds * 1000;
}

function parseDays(envVar: string | undefined, defaultDays: number): number {
  if (!envVar) return defaultDays;
  const days = parseInt(envVar, 10);
  if (isNaN(days) || days < 1) return defaultDays;
  return days;
}

function parseMinutes(envVar: string | undefined, defaultMinutes: number): number {
  if (!envVar) return defaultMinutes;
  const minutes = parseInt(envVar, 10);
  if (isNaN(minutes) || minutes < 0 || minutes > 59) return defaultMinutes;
  return minutes;
}

function parseBoolean(envVar: string | undefined, defaultValue: boolean): boolean {
  if (envVar === undefined) return defaultValue;
  const normalized = envVar.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return defaultValue;
}

function parseBatchSize(envVar: string | undefined, defaultSize: number): number {
  if (!envVar) return defaultSize;
  const size = parseInt(envVar, 10);
  if (isNaN(size) || size < 1 || size > 50_000) return defaultSize;
  return size;
}

/** Positive integer without parseBatchSize's 50k cap (budgets can exceed it). */
function parsePositiveInt(
  envVar: string | undefined,
  defaultValue: number,
): number {
  if (!envVar) return defaultValue;
  const value = parseInt(envVar, 10);
  if (isNaN(value) || value < 1) return defaultValue;
  return value;
}

export function loadConfig(): CollectorConfig {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const sourcesRaw =
    process.env.COLLECTOR_ENABLED_SOURCES ||
    "pskreporter,rbn,dxcluster,solar,forecasts,lightning,satellites";

  return {
    supabaseUrl,
    supabaseServiceKey,
    logLevel:
      (process.env.COLLECTOR_LOG_LEVEL as CollectorConfig["logLevel"]) ||
      "info",
    enabledSources: new Set(sourcesRaw.split(",").map((s) => s.trim())),
    healthPort: parseInt(process.env.PORT || "8080", 10),
    aggregationSettleMinutes: parseMinutes(
      process.env.AGGREGATION_SETTLE_MINUTES,
      20,
    ),

    // Polling intervals (env vars in SECONDS, defaults in ms)
    // Free tier defaults: conservative polling to keep costs down
    // Pro tier: set POLL_PSKREPORTER=60, POLL_RBN=60 etc. on Railway
    pollIntervals: {
      pskreporter: parseIntervalMs(process.env.POLL_PSKREPORTER, 5 * 60_000),
      rbn: parseIntervalMs(process.env.POLL_RBN, 5 * 60_000),
      dxcluster: parseIntervalMs(process.env.POLL_DXCLUSTER, 2 * 60_000),
      solar: parseIntervalMs(process.env.POLL_SOLAR, 15 * 60_000),
      forecasts: parseIntervalMs(process.env.POLL_FORECASTS, 6 * 60 * 60_000),
      satellites: parseIntervalMs(process.env.POLL_SATELLITES, 2 * 60 * 60_000),
      aggregator: parseIntervalMs(process.env.POLL_AGGREGATOR, 5 * 60_000),
      forecastSnapshot: parseIntervalMs(
        process.env.POLL_FORECAST_SNAPSHOT,
        5 * 60_000,
      ),
      prune: parseIntervalMs(process.env.POLL_PRUNE, 60 * 60_000),
      dbSizeGuard: parseIntervalMs(
        process.env.POLL_DB_SIZE_GUARD,
        6 * 60 * 60_000,
      ),
      pathArchive: parseIntervalMs(process.env.POLL_PATH_ARCHIVE, 60 * 60_000),
      bandClimatology: parseIntervalMs(
        process.env.POLL_BAND_CLIMATOLOGY,
        24 * 60 * 60_000,
      ),
    },

    // Data retention (env vars in DAYS)
    // Shorter window = less DB cost. band_hourly_stats is never pruned.
    retention: {
      spots: parseDays(process.env.RETENTION_SPOTS, 7),
      health: parseDays(process.env.RETENTION_HEALTH, 7),
      solar: parseDays(process.env.RETENTION_SOLAR, 120),
      tle: parseDays(process.env.RETENTION_TLE, 7),
    },
    archive: {
      // This flag is deliberately false by default. The database has a second,
      // independently disabled control and sealed-manifest/restore gates.
      pruningEnabled: parseBoolean(
        process.env.ARCHIVE_PRUNING_ENABLED,
        false,
      ),
      forecastCompactionEnabled: parseBoolean(
        process.env.ARCHIVE_FORECAST_COMPACTION_ENABLED,
        false,
      ),
      pruneBatchSize: parseBatchSize(
        process.env.ARCHIVE_PRUNE_BATCH_SIZE,
        10_000,
      ),
      pathStats: {
        hotDays: parseDays(process.env.ARCHIVE_PATH_STATS_HOT_DAYS, 90),
        // Fail closed: day exports to storage always run, but archived days
        // are deleted from the hot table only when this is explicitly true.
        pruneEnabled: parseBoolean(
          process.env.ARCHIVE_PATH_STATS_PRUNE,
          false,
        ),
        maxDaysPerRun: parseBatchSize(
          process.env.ARCHIVE_PATH_STATS_MAX_DAYS_PER_RUN,
          2,
        ),
      },
    },
    dbSizeBudgetMb: parsePositiveInt(process.env.DB_SIZE_BUDGET_MB, 3072),
  };
}
