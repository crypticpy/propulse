/**
 * Vercel Edge Function: APRS.fi Proxy
 * Fetches nearby APRS stations from aprs.fi API to avoid CORS.
 *
 * Source: https://aprs.fi/page/api
 * Cache: 5 minutes with 1-minute stale-while-revalidate
 */

/**
 * Vercel Edge Function: River Gauge Proxy
 * Fetches USGS NWIS instantaneous gauge height data to avoid CORS.
 *
 * Source: https://waterservices.usgs.gov/nwis/iv/
 * parameterCd=00065 = gage height (ft)
 * Cache: 15 minutes with 5 minute stale-while-revalidate
 */

/**
 * Vercel Edge Function: RepeaterBook Proxy
 * Fetches nearby repeaters from RepeaterBook.com API to avoid CORS.
 *
 * Source: https://www.repeaterbook.com/api/export.php
 * RepeaterBook requires approved-client token auth (X-RB-App-Token) as of
 * March 2026 — set REPEATERBOOK_APP_TOKEN once access is granted. Until
 * then upstream returns 401 and this endpoint degrades to empty results.
 * Cache: 1 hour with 10-minute stale-while-revalidate
 */

/**
 * Vercel Edge Function: SST (Sea Surface Temperature) Proxy
 * Fetches NOAA OISST daily composite data via ERDDAP to avoid CORS.
 *
 * Source: NOAA NCDC OISST v2.1 (daily optimum interpolation)
 * Grid: 5-degree bins (~72x36 equirectangular) — suitable for heatmap overlay
 * Cache: 6 hours with 1 hour stale-while-revalidate (daily composite)
 */

import { applyRateLimit } from "../rateLimit";

/**
 * Get the allowed CORS origin based on environment.
 * Never returns wildcard "*" to prevent security issues.
 */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

// ─── GET /api/atmos/aprs ────────────────────────────────────────────────────

const APRS_FI_URL = "https://api.aprs.fi/api/get";

/** Fallback response when upstream data is unavailable */
function fallbackAprsResponse(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ stations: [] }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
    },
  });
}

export async function handleAtmosAprs(request: Request): Promise<Response> {
  const origin = getAllowedOrigin();
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const limited = applyRateLimit(request, "atmos/aprs", 2, 60);
  if (limited) return limited;

  const url = new URL(request.url);
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");
  const range = url.searchParams.get("range") || "100";

  if (!lat || !lon) {
    return fallbackAprsResponse(corsHeaders);
  }

  const apiKey = process.env.APRS_FI_API_KEY;
  if (!apiKey) {
    return fallbackAprsResponse(corsHeaders);
  }

  const apiUrl = `${APRS_FI_URL}?what=loc&lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lon)}&range=${encodeURIComponent(range)}&apikey=${encodeURIComponent(apiKey)}&format=json`;

  try {
    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Dashboard)",
      },
    });

    if (!response.ok) {
      return fallbackAprsResponse(corsHeaders);
    }

    const data = await response.text();

    return new Response(data, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`APRS.fi fetch failed: ${message}`);
    return fallbackAprsResponse(corsHeaders);
  }
}

// ─── GET /api/atmos/gauges ──────────────────────────────────────────────────

const USGS_URL = "https://waterservices.usgs.gov/nwis/iv/";

/** Fallback response when upstream data is unavailable */
function fallbackGaugesResponse(
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ gauges: [] }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
    },
  });
}

export async function handleAtmosGauges(request: Request): Promise<Response> {
  const origin = getAllowedOrigin();
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const limited = applyRateLimit(request, "atmos/gauges", 5, 60);
  if (limited) return limited;

  const url = new URL(request.url);
  const west = url.searchParams.get("west");
  const south = url.searchParams.get("south");
  const east = url.searchParams.get("east");
  const north = url.searchParams.get("north");

  if (!west || !south || !east || !north) {
    return fallbackGaugesResponse(corsHeaders);
  }

  const apiUrl = `${USGS_URL}?format=json&bBox=${west},${south},${east},${north}&parameterCd=00065&siteStatus=active`;

  try {
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Weather Dashboard)",
      },
    });

    if (!res.ok) {
      return fallbackGaugesResponse(corsHeaders);
    }

    const data = await res.text();

    return new Response(data, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=900, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Gauge fetch failed: ${message}`);
    return fallbackGaugesResponse(corsHeaders);
  }
}

// ─── GET /api/atmos/repeaters ───────────────────────────────────────────────

const REPEATERBOOK_URL = "https://www.repeaterbook.com/api/export.php";

/** Fallback response when upstream data is unavailable */
function fallbackRepeatersResponse(
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ count: 0, results: [] }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
    },
  });
}

export async function handleAtmosRepeaters(
  request: Request,
): Promise<Response> {
  const origin = getAllowedOrigin();
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const limited = applyRateLimit(request, "atmos/repeaters", 5, 60);
  if (limited) return limited;

  const url = new URL(request.url);
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");
  const dist = url.searchParams.get("dist") || "50";

  if (!lat || !lon) {
    return fallbackRepeatersResponse(corsHeaders);
  }

  const apiUrl = `${REPEATERBOOK_URL}?callsign=&city=&state=&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&dist=${encodeURIComponent(dist)}`;

  try {
    const token = process.env.REPEATERBOOK_APP_TOKEN;
    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Dashboard)",
        ...(token ? { "X-RB-App-Token": token } : {}),
      },
    });

    if (!response.ok) {
      return fallbackRepeatersResponse(corsHeaders);
    }

    const data = await response.text();

    return new Response(data, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`RepeaterBook fetch failed: ${message}`);
    return fallbackRepeatersResponse(corsHeaders);
  }
}

// ─── GET /api/atmos/sst ─────────────────────────────────────────────────────

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
    const latitudeValue = candidate[latIndex];
    const longitudeValue = candidate[lonIndex];
    const latitudeMissing =
      latitudeValue == null ||
      (typeof latitudeValue === "string" && latitudeValue.trim() === "");
    const longitudeMissing =
      longitudeValue == null ||
      (typeof longitudeValue === "string" && longitudeValue.trim() === "");
    if (latitudeMissing || longitudeMissing) continue;

    const lat = Number(latitudeValue);
    const rawLon = Number(longitudeValue);
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
function fallbackSstResponse(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ rows: [], timestamp: null }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
    },
  });
}

export async function handleAtmosSst(request: Request): Promise<Response> {
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
      return fallbackSstResponse(corsHeaders);
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
    return fallbackSstResponse(corsHeaders);
  }
}
