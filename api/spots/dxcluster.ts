/** DX Cluster UI feed backed by the central collector store. */

import { applyRateLimit } from "../_lib/rateLimit.js";
import {
  spotCacheHeaders,
  spotJsonResponse,
  spotOptionsResponse,
} from "../_lib/spotResponse.js";
import { readStoredSpots } from "../_lib/spotStore.js";

async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return spotOptionsResponse();
  }
  if (req.method !== "GET") {
    return spotJsonResponse({ error: "Method not allowed", spots: [] }, 405, {
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

  return spotJsonResponse(
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

export default { fetch: handler };
