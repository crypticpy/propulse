/** DX Cluster UI feed backed by the central collector store. */

import { applyRateLimit } from "../rateLimit.js";
import {
  spotCacheHeaders,
  spotJsonResponse,
  spotOptionsResponse,
} from "../spotResponse.js";
import { meterBandNumber, readStoredSpots } from "../spotStore.js";

export async function handleSpotsDxcluster(req: Request): Promise<Response> {
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
    band: row.band.toLowerCase(),
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

/**
 * PSK Reporter UI feed.
 *
 * Browser requests read the centrally collected spot store. Only the collector
 * talks to PSK Reporter, which keeps polling within the provider's guidance and
 * prevents a slow public service from consuming an entire function invocation.
 */

const GRID_REGEX = /^[A-Ra-r]{2}[0-9]{2}([A-Xa-x]{2}([0-9]{2})?)?$/;

export async function handleSpotsPskreporter(req: Request): Promise<Response> {
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

/** Reverse Beacon Network UI feed backed by the central collector store. */

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

export async function handleSpotsRbn(req: Request): Promise<Response> {
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
