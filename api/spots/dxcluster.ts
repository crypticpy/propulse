/** DX Cluster UI feed backed by the central collector store. */

import { applyRateLimit } from "../_lib/rateLimit";
import { readStoredSpots, spotCacheHeaders } from "../_lib/spotStore";

export const config = {
  runtime: "edge",
};

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.cloud";
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": getAllowedOrigin(),
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed", spots: [] }, 405, {
      Allow: "GET, OPTIONS",
      "Cache-Control": "no-store",
    });
  }

  const limited = applyRateLimit(req, "spots/dxcluster", 30, 60);
  if (limited) return limited;

  const url = new URL(req.url);
  const rawLimit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Math.min(Math.max(1, Number.isNaN(rawLimit) ? 50 : rawLimit), 200);
  const result = await readStoredSpots("dxcluster", { limit });
  const spots = result.rows.map((row, index) => ({
    id: `dxc-${row.tx_callsign}-${row.rx_callsign}-${Date.parse(row.spotted_at)}-${index}`,
    spotter: row.rx_callsign,
    dx: row.tx_callsign,
    frequency: row.frequency_khz,
    mode: row.mode || undefined,
    comment: row.comment || "",
    time: row.spotted_at,
    band: row.band.toUpperCase(),
    continent: row.continent || undefined,
    dxcc: row.dxcc ?? undefined,
  }));

  return jsonResponse(
    {
      spots,
      meta: {
        schemaVersion: 1,
        source: "dxcluster",
        status: result.status,
        observedAt: result.observedAt,
        fetchedAt: result.fetchedAt,
        staleAfterSeconds: result.staleAfterSeconds,
      },
    },
    200,
    spotCacheHeaders(result),
  );
}
