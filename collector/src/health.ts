import http from "node:http";
import { log } from "./logger.js";

interface SourceStatus {
  at: string;
  status: string;
  spotsIngested: number;
}

const lastRuns: Record<string, SourceStatus> = {};

export function reportHealth(
  source: string,
  status: string,
  spotsIngested: number,
): void {
  lastRuns[source] = { at: new Date().toISOString(), status, spotsIngested };
}

export function startHealthServer(port: number): http.Server {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "propulse-collector",
        uptime: Math.floor(process.uptime()),
        lastRuns,
      }),
    );
  });
  server.listen(port, "0.0.0.0", () => {
    log("info", `Health check on :${port}`);
  });
  return server;
}
