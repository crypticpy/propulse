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

export function loadConfig(): CollectorConfig {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const sourcesRaw =
    process.env.COLLECTOR_ENABLED_SOURCES ||
    "pskreporter,rbn,dxcluster,solar,lightning,satellites";

  return {
    supabaseUrl,
    supabaseServiceKey,
    logLevel:
      (process.env.COLLECTOR_LOG_LEVEL as CollectorConfig["logLevel"]) ||
      "info",
    enabledSources: new Set(sourcesRaw.split(",").map((s) => s.trim())),
    healthPort: parseInt(process.env.PORT || "8080", 10),

    // Polling intervals (env vars in SECONDS, defaults in ms)
    // Free tier defaults: conservative polling to keep costs down
    // Pro tier: set POLL_PSKREPORTER=60, POLL_RBN=60 etc. on Railway
    pollIntervals: {
      pskreporter: parseIntervalMs(process.env.POLL_PSKREPORTER, 5 * 60_000),
      rbn: parseIntervalMs(process.env.POLL_RBN, 5 * 60_000),
      dxcluster: parseIntervalMs(process.env.POLL_DXCLUSTER, 2 * 60_000),
      solar: parseIntervalMs(process.env.POLL_SOLAR, 15 * 60_000),
      satellites: parseIntervalMs(process.env.POLL_SATELLITES, 2 * 60 * 60_000),
      aggregator: parseIntervalMs(process.env.POLL_AGGREGATOR, 5 * 60_000),
      prune: parseIntervalMs(process.env.POLL_PRUNE, 60 * 60_000),
    },

    // Data retention (env vars in DAYS)
    // Shorter window = less DB cost. band_hourly_stats is never pruned.
    retention: {
      spots: parseDays(process.env.RETENTION_SPOTS, 7),
      health: parseDays(process.env.RETENTION_HEALTH, 7),
      solar: parseDays(process.env.RETENTION_SOLAR, 90),
      tle: parseDays(process.env.RETENTION_TLE, 30),
    },
  };
}
