import http from "node:http";
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

const SOURCE_STALE_MS = 10 * 60_000; // 10 minutes

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
      if (lastSuccess === undefined || now - lastSuccess > SOURCE_STALE_MS) {
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
      }),
    );
  });
  server.listen(port, "0.0.0.0", () => {
    log("info", `Health check on :${port}`);
  });
  return server;
}
