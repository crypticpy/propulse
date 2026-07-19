import { loadConfig } from "./config.js";
import { setLogLevel, log } from "./logger.js";
import { getDb } from "./db.js";
import { register, startAll, stopAll } from "./scheduler.js";
import {
  reportHealth,
  startHealthServer,
  setActiveConfig,
} from "./health.js";
import {
  startPskReporter,
  stopPskReporter,
} from "./collectors/pskreporter.js";
import { startRbn, stopRbn } from "./collectors/rbn.js";
import { collectDxCluster } from "./collectors/dxcluster.js";
import { collectSolar } from "./collectors/solar.js";
import { collectForecasts } from "./collectors/forecast.js";
import { computeHourlyStats } from "./aggregator/hourly.js";
import { computePathHourlyStats } from "./aggregator/pathHourly.js";
import { pruneOldData } from "./aggregator/prune.js";
import { startLightning, stopLightning } from "./collectors/lightning.js";
import { collectSatellites } from "./collectors/satellites.js";
import { reportToDb } from "./lib/db-helpers.js";
import type { SupabaseClient } from "@supabase/supabase-js";

async function runTrackedAggregation(
  db: SupabaseClient,
  source: "aggregator" | "path-aggregator",
  fn: () => Promise<number>,
): Promise<void> {
  const started = Date.now();
  try {
    const rows = await fn();
    reportHealth(source, "ok", rows);
    await reportToDb(db, source, "ok", rows, Date.now() - started);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reportHealth(source, "error", 0);
    try {
      await reportToDb(
        db,
        source,
        "error",
        0,
        Date.now() - started,
        message,
      );
    } catch (statusError) {
      log("error", "Failed to persist aggregation failure", {
        source,
        error:
          statusError instanceof Error ? statusError.message : String(statusError),
      });
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);

  log("info", "Propulse Collector starting", {
    sources: [...config.enabledSources],
    logLevel: config.logLevel,
    pollIntervals: config.pollIntervals,
    retention: config.retention,
    aggregationSettleMinutes: config.aggregationSettleMinutes,
  });

  const db = getDb(config);
  const { pollIntervals } = config;

  // Start durable spot streams. Both consumers reconnect and flush bounded
  // batches to Supabase, so provider latency cannot block the scheduler.
  if (config.enabledSources.has("pskreporter")) {
    startPskReporter(db);
  }
  if (config.enabledSources.has("rbn")) {
    startRbn(db);
  }

  // The generic DX Cluster source requires a legitimate receive-only cluster
  // identity. It remains opt-in via COLLECTOR_ENABLED_SOURCES.
  if (config.enabledSources.has("dxcluster")) {
    register("dxcluster", pollIntervals.dxcluster, () => collectDxCluster(db));
  }

  // Solar collector
  if (config.enabledSources.has("solar")) {
    register("solar", pollIntervals.solar, () => collectSolar(db));
  }
  if (config.enabledSources.has("forecasts")) {
    register("forecasts", pollIntervals.forecasts, () => collectForecasts(db));
  }

  // Lightning WebSocket consumer (always-on, not poll-based)
  if (config.enabledSources.has("lightning")) {
    startLightning();
  }

  // Satellite TLE collector
  if (config.enabledSources.has("satellites")) {
    register("satellites", pollIntervals.satellites, () =>
      collectSatellites(db),
    );
  }

  // Hourly aggregator (checks on interval, only runs on new hour boundary)
  register("aggregator", pollIntervals.aggregator, () =>
    runTrackedAggregation(db, "aggregator", () =>
      computeHourlyStats(db, config),
    ),
  );

  // Path-level hourly aggregator (ML training flywheel — never pruned)
  register("path-aggregator", pollIntervals.aggregator, () =>
    runTrackedAggregation(db, "path-aggregator", () =>
      computePathHourlyStats(db, config),
    ),
  );

  // Auto-prune: retention periods configurable via RETENTION_* env vars
  // band_hourly_stats is never pruned — aggregates preserved forever for ML
  register("prune", pollIntervals.prune, () => pruneOldData(db, config));

  // Start all scheduled tasks
  startAll();

  // Start health check HTTP server (exposes active config for ops visibility)
  setActiveConfig(config);
  startHealthServer(config.healthPort);

  // Graceful shutdown
  const shutdown = (): void => {
    log("info", "Shutting down...");
    stopPskReporter();
    stopRbn();
    stopLightning();
    stopAll();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
