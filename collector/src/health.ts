import http from "node:http";
import type { CollectorConfig, PollIntervals } from "./types.js";
import { log } from "./logger.js";
import {
  getBufferedStrikes,
  getLightningStats,
} from "./collectors/lightning.js";

interface SourceStatus {
  at: string;
  status: string;
  spotsIngested: number;
}

const lastRuns: Record<string, SourceStatus> = {};
const lastSuccessTimes: Record<string, number> = {};
let activeConfig: Pick<
  CollectorConfig,
  "pollIntervals" | "retention" | "archive"
> | null = null;

const STREAM_STALE_MS = 10 * 60_000;
const POLL_INTERVAL_SOURCES: Partial<Record<string, keyof PollIntervals>> = {
  dxcluster: "dxcluster",
  solar: "solar",
  forecasts: "forecasts",
  satellites: "satellites",
  aggregator: "aggregator",
  "path-aggregator": "aggregator",
  "forecast-snapshot": "forecastSnapshot",
  "db-size": "dbSizeGuard",
  "path-archive": "pathArchive",
  "band-climatology": "bandClimatology",
  "region-aggregator": "aggregator",
  "verdict-ladder": "verdictLadder",
};

export function getSourceStaleMs(
  source: string,
  pollIntervals: PollIntervals,
): number {
  const intervalKey = POLL_INTERVAL_SOURCES[source];
  if (!intervalKey) return STREAM_STALE_MS;

  return Math.max(STREAM_STALE_MS, pollIntervals[intervalKey] * 2);
}

export function isSourceStale(
  source: string,
  lastSuccess: number | undefined,
  now: number,
  pollIntervals: PollIntervals,
): boolean {
  return (
    lastSuccess === undefined ||
    now - lastSuccess > getSourceStaleMs(source, pollIntervals)
  );
}

export function reportHealth(
  source: string,
  status: string,
  spotsIngested: number,
): void {
  lastRuns[source] = { at: new Date().toISOString(), status, spotsIngested };
  if (status === "ok") {
    lastSuccessTimes[source] = Date.now();
  }
}

export function setActiveConfig(
  config: Pick<CollectorConfig, "pollIntervals" | "retention" | "archive">,
): void {
  activeConfig = config;
}

export function startHealthServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    const url = req.url?.split("?")[0] || "/";

    // ── Lightning strike data endpoint ────────────────────────────────
    if (url === "/lightning") {
      const strikes = getBufferedStrikes();
      const stats = getLightningStats();

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=5, stale-while-revalidate=5",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      });
      res.end(
        JSON.stringify({
          strikes,
          meta: {
            connected: stats.connected,
            bufferSize: stats.bufferSize,
            totalReceived: stats.strikesReceived,
          },
        }),
      );
      return;
    }

    // ── Health check endpoint (default) ───────────────────────────────
    const now = Date.now();
    const degradedSources: string[] = [];

    for (const source of Object.keys(lastRuns)) {
      const lastSuccess = lastSuccessTimes[source];
      const stale = activeConfig
        ? isSourceStale(source, lastSuccess, now, activeConfig.pollIntervals)
        : lastSuccess === undefined || now - lastSuccess > STREAM_STALE_MS;
      if (stale) {
        degradedSources.push(source);
      }
    }

    const isDegraded = degradedSources.length > 0;
    const statusCode = isDegraded ? 503 : 200;

    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: isDegraded ? "degraded" : "ok",
        service: "propulse-collector",
        uptime: Math.floor(process.uptime()),
        lastRuns,
        ...(isDegraded ? { degraded_sources: degradedSources } : {}),
        ...(activeConfig
          ? {
              config: {
                pollIntervals: activeConfig.pollIntervals,
                retention: activeConfig.retention,
                archive: activeConfig.archive,
              },
            }
          : {}),
      }),
    );
  });
  server.listen(port, "0.0.0.0", () => {
    log("info", `Health check on :${port}`);
  });
  return server;
}
