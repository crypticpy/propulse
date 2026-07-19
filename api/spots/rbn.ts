/** Reverse Beacon Network UI feed backed by the central collector store. */

import { applyRateLimit } from "../_lib/rateLimit";
import {
  spotCacheHeaders,
  spotJsonResponse,
  spotOptionsResponse,
} from "../_lib/spotResponse";
import { meterBandNumber, readStoredSpots } from "../_lib/spotStore";

function requestedBands(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const bands = value.split(",");
  const allowedBands = new Set([
    "160",
    "80",
    "60",
    "40",
    "30",
    "20",
    "17",
    "15",
    "12",
    "10",
    "6",
    "2",
  ]);
  if (bands.some((band) => !allowedBands.has(band))) return [];
  return bands.map((band) => `${band}m`);
}

function requestedModes(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const modes = value.split(",");
  if (modes.some((mode) => !/^[A-Za-z0-9]+$/.test(mode))) return [];
  return modes.map((mode) => mode.toUpperCase());
}

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

  const limited = applyRateLimit(req, "spots/rbn", 30, 60);
  if (limited) return limited;

  const url = new URL(req.url);
  const rawLimit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Math.min(Math.max(1, Number.isNaN(rawLimit) ? 50 : rawLimit), 200);
  const bands = requestedBands(url.searchParams.get("band"));
  const modes = requestedModes(url.searchParams.get("mode"));
  if (bands?.length === 0 || modes?.length === 0) {
    return spotJsonResponse({ error: "Invalid filter format", spots: [] }, 400, {
      "Cache-Control": "no-store",
    });
  }

  const result = await readStoredSpots("rbn", { limit, bands, modes });
  const spots = result.rows.map((row) => ({
    callsign: row.tx_callsign,
    de_pfx: row.rx_callsign,
    de_cont: "",
    dx_pfx: "",
    dx_cont: row.continent || "",
    freq: row.frequency_khz,
    band: meterBandNumber(row.band) ?? 0,
    mode: row.mode || "CW",
    db: row.snr ?? 0,
    wpm: row.wpm ?? 0,
    time: Math.floor(Date.parse(row.spotted_at) / 1_000),
    spotted_time: row.spotted_at,
  }));

  return spotJsonResponse(
    {
      spots,
      meta: {
        schemaVersion: 1,
        source: "rbn",
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
