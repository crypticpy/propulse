/**
 * PSK Reporter UI feed.
 *
 * Browser requests read the centrally collected spot store. Only the collector
 * talks to PSK Reporter, which keeps polling within the provider's guidance and
 * prevents a slow public service from consuming an entire edge invocation.
 */

import { applyRateLimit } from "../_lib/rateLimit";
import {
  spotCacheHeaders,
  spotJsonResponse,
  spotOptionsResponse,
} from "../_lib/spotResponse";
import { readStoredSpots } from "../_lib/spotStore";

export const config = {
  runtime: "edge",
};

const GRID_REGEX = /^[A-Ra-r]{2}[0-9]{2}([A-Xa-x]{2}([0-9]{2})?)?$/;

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return spotOptionsResponse();
  }
  if (req.method !== "GET") {
    return spotJsonResponse({ error: "Method not allowed", spots: [] }, 405, {
      Allow: "GET, OPTIONS",
      "Cache-Control": "no-store",
    });
  }

  const limited = applyRateLimit(req, "spots/pskreporter", 30, 60);
  if (limited) return limited;

  const url = new URL(req.url);
  const rawLimit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Math.min(Math.max(1, Number.isNaN(rawLimit) ? 50 : rawLimit), 200);
  const grid = url.searchParams.get("grid") || "";
  if (grid && !GRID_REGEX.test(grid)) {
    return spotJsonResponse({ error: "Invalid grid format", spots: [] }, 400, {
      "Cache-Control": "no-store",
    });
  }
  const mode = url.searchParams.get("mode") || "";
  if (mode && !/^[A-Za-z0-9]+$/.test(mode)) {
    return spotJsonResponse({ error: "Invalid mode format", spots: [] }, 400, {
      "Cache-Control": "no-store",
    });
  }

  const result = await readStoredSpots("pskreporter", {
    limit,
    grid: grid || undefined,
    modes: mode ? [mode.toUpperCase()] : undefined,
  });
  const spots = result.rows.map((row) => ({
    senderCallsign: row.tx_callsign,
    senderLocator: row.tx_grid || undefined,
    receiverCallsign: row.rx_callsign,
    receiverLocator: row.rx_grid || undefined,
    frequency: Math.round(row.frequency_khz * 1_000),
    flowStartSeconds: Math.floor(Date.parse(row.spotted_at) / 1_000),
    mode: row.mode || "FT8",
    sNR: row.snr ?? undefined,
  }));

  return spotJsonResponse(
    {
      spots,
      meta: {
        schemaVersion: 1,
        source: "pskreporter",
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
