import { loadConfig } from "./config.js";
import { setLogLevel, log } from "./logger.js";
import { getDb } from "./db.js";
import { register, startAll, stopAll } from "./scheduler.js";
import { startHealthServer, setActiveConfig } from "./health.js";
import { collectPskReporter } from "./collectors/pskreporter.js";
import { collectRbn } from "./collectors/rbn.js";
import { collectDxCluster } from "./collectors/dxcluster.js";
import { collectSolar } from "./collectors/solar.js";
import { computeHourlyStats } from "./aggregator/hourly.js";
import { computePathHourlyStats } from "./aggregator/pathHourly.js";
import { pruneOldData } from "./aggregator/prune.js";
import { startLightning, stopLightning } from "./collectors/lightning.js";
import { collectSatellites } from "./collectors/satellites.js";

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);

  log("info", "Propulse Collector starting", {
    sources: [...config.enabledSources],
    logLevel: config.logLevel,
    pollIntervals: config.pollIntervals,
    retention: config.retention,
  });

  const db = getDb(config);
  const { pollIntervals } = config;

  // Register spot collectors (intervals configurable via POLL_* env vars)
  if (config.enabledSources.has("pskreporter")) {
    register("pskreporter", pollIntervals.pskreporter, () =>
      collectPskReporter(db),
    );
  }
  if (config.enabledSources.has("rbn")) {
    register("rbn", pollIntervals.rbn, () => collectRbn(db));
  }
  if (config.enabledSources.has("dxcluster")) {
    register("dxcluster", pollIntervals.dxcluster, () => collectDxCluster(db));
  }

  // Solar collector
  if (config.enabledSources.has("solar")) {
    register("solar", pollIntervals.solar, () => collectSolar(db));
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
    computeHourlyStats(db, config),
  );

  // Path-level hourly aggregator (ML training flywheel — never pruned)
  register("path-aggregator", pollIntervals.aggregator, () =>
    computePathHourlyStats(db, config),
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
