/**
 * Vercel Edge Function: SST (Sea Surface Temperature) Proxy
 * Fetches NOAA OISST daily composite data via ERDDAP to avoid CORS.
 *
 * Source: NOAA NCDC OISST v2.1 (daily optimum interpolation)
 * Grid: 5-degree bins (~72x36 equirectangular) — suitable for heatmap overlay
 * Cache: 6 hours with 1 hour stale-while-revalidate (daily composite)
 */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

/**
 * Get the allowed CORS origin based on environment.
 * Never returns wildcard "*" to prevent security issues.
 */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

/** NOAA OISST is a 0.25-degree grid; every 20th source cell yields 5 degrees. */
const SST_SOURCE_GRID_DEGREES = 0.25;
const SST_OUTPUT_GRID_DEGREES = 5;
const SST_INDEX_STRIDE = SST_OUTPUT_GRID_DEGREES / SST_SOURCE_GRID_DEGREES;
const SST_URL =
  `https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21Agg.json?sst[(last)][(0.0)][(-90):${SST_INDEX_STRIDE}:(90)][(0):${SST_INDEX_STRIDE}:(360)]`;

interface CompactSSTRow {
  lat: number;
  lon: number;
  sst: number;
}

interface CompactSSTPayload {
  rows: CompactSSTRow[];
  timestamp: string | null;
}

export function compactSSTPayload(data: unknown): CompactSSTPayload {
  if (!data || typeof data !== "object") {
    return { rows: [], timestamp: null };
  }

  const table = (data as Record<string, unknown>).table;
  if (!table || typeof table !== "object") {
    return { rows: [], timestamp: null };
  }

  const { columnNames, rows } = table as {
    columnNames?: unknown;
    rows?: unknown;
  };
  if (!Array.isArray(columnNames) || !Array.isArray(rows)) {
    return { rows: [], timestamp: null };
  }

  const timeIndex = columnNames.indexOf("time");
  const latIndex = columnNames.indexOf("latitude");
  const lonIndex = columnNames.indexOf("longitude");
  const sstIndex = columnNames.indexOf("sst");
  if (latIndex < 0 || lonIndex < 0 || sstIndex < 0) {
    return { rows: [], timestamp: null };
  }

  const compactRows: CompactSSTRow[] = [];
  let timestamp: string | null = null;
  for (const candidate of rows) {
    if (!Array.isArray(candidate)) continue;
    const lat = Number(candidate[latIndex]);
    const rawLon = Number(candidate[lonIndex]);
    const sst = Number(candidate[sstIndex]);
    if (!Number.isFinite(lat) || !Number.isFinite(rawLon)) continue;
    if (candidate[sstIndex] == null || !Number.isFinite(sst)) continue;
    if (!timestamp && timeIndex >= 0 && candidate[timeIndex] != null) {
      timestamp = String(candidate[timeIndex]);
    }
    compactRows.push({
      lat,
      lon: rawLon > 180 ? rawLon - 360 : rawLon,
      sst,
    });
  }

  return { rows: compactRows, timestamp };
}

/** Fallback response when upstream data is unavailable */
function fallbackResponse(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ rows: [] }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
    },
  });
}

export default async function handler(request: Request): Promise<Response> {
  const origin = getAllowedOrigin();
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const limited = applyRateLimit(request, "atmos/sst", 5, 60);
  if (limited) return limited;

  try {
    const response = await fetch(SST_URL, {
      signal: AbortSignal.timeout(30_000),
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Solar Dashboard)",
      },
    });

    if (!response.ok) {
      console.error(`SST upstream returned ${response.status}`);
      return fallbackResponse(corsHeaders);
    }

    const data = compactSSTPayload(await response.json());

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=21600, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`SST fetch failed: ${message}`);
    return fallbackResponse(corsHeaders);
  }
}
