import { loadConfig } from "./config.js";
import { setLogLevel, log } from "./logger.js";
import { getDb } from "./db.js";
import { register, startAll, stopAll } from "./scheduler.js";
import { startHealthServer } from "./health.js";
import { collectPskReporter } from "./collectors/pskreporter.js";
import { collectRbn } from "./collectors/rbn.js";
import { collectDxCluster } from "./collectors/dxcluster.js";
import { collectSolar } from "./collectors/solar.js";
import { computeHourlyStats } from "./aggregator/hourly.js";
import { pruneOldData } from "./aggregator/prune.js";
import { startLightning, stopLightning } from "./collectors/lightning.js";
import { collectSatellites } from "./collectors/satellites.js";

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);

  log("info", "Propulse Collector starting", {
    sources: [...config.enabledSources],
    logLevel: config.logLevel,
  });

  const db = getDb(config);

  // Register spot collectors
  if (config.enabledSources.has("pskreporter")) {
    register("pskreporter", 3 * 60_000, () => collectPskReporter(db));
  }
  if (config.enabledSources.has("rbn")) {
    register("rbn", 2 * 60_000, () => collectRbn(db));
  }
  if (config.enabledSources.has("dxcluster")) {
    register("dxcluster", 2 * 60_000, () => collectDxCluster(db));
  }

  // Solar collector
  if (config.enabledSources.has("solar")) {
    register("solar", 5 * 60_000, () => collectSolar(db));
  }

  // Lightning WebSocket consumer (always-on, not poll-based)
  if (config.enabledSources.has("lightning")) {
    startLightning();
  }

  // Satellite TLE collector (every 2 hours)
  if (config.enabledSources.has("satellites")) {
    register("satellites", 2 * 60 * 60_000, () => collectSatellites(db));
  }

  // Hourly aggregator (checks every 5 min, only runs on new hour boundary)
  register("aggregator", 5 * 60_000, () => computeHourlyStats(db));

  // Auto-prune: checks every hour, runs once per day
  // Keeps 14 days of spots, 90 days of solar, 7 days of health logs
  register("prune", 60 * 60_000, () => pruneOldData(db));

  // Start all scheduled tasks
  startAll();

  // Start health check HTTP server
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
