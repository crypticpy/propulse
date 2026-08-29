/**
 * Vercel Edge Function: METAR Proxy
 * Fetches aviation surface observations from aviationweather.gov to avoid
 * CORS. No local airport/station database is shipped — the caller supplies
 * either an explicit ICAO id list or a small bounding box, and aviationweather
 * resolves stations server-side.
 *
 * Source: https://aviationweather.gov/api/data/metar
 * Cache: 5 minutes with 1-minute stale-while-revalidate
 */

import { applyRateLimit } from "../rateLimit";

/**
 * Get the allowed CORS origin based on environment.
 * Never returns wildcard "*" to prevent security issues.
 */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

const METAR_URL = "https://aviationweather.gov/api/data/metar";

/** Maximum ICAO ids accepted in `ids` mode. */
const MAX_IDS = 10;
/** Maximum bounding-box side length (degrees) accepted in `bbox` mode, so a
 * dense region can't blow up the upstream response. */
const MAX_BBOX_DEGREES = 4;
/** Hard cap on stations returned, applied after parsing so a truncated
 * response still describes the widest possible spread of stations. */
const MAX_STATIONS = 200;
/** Upstream response byte-size guard; text bodies larger than this are
 * treated as needing truncation even if the station count comes in low. */
const MAX_RESPONSE_BYTES = 1_000_000;

const ICAO_PATTERN = /^[A-Z0-9]{3,4}$/;

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
  cacheControl = "no-cache",
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": cacheControl,
    },
  });
}

// ─── Query validation ───────────────────────────────────────────────────────

export interface BboxParams {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export type IdsValidationResult =
  | { ok: true; ids: string[] }
  | { ok: false; error: string };

/**
 * Parse and validate a comma-separated `ids` query param: at most
 * `MAX_IDS` ICAO codes, each 3-4 uppercase alphanumeric characters.
 */
export function parseIds(raw: string): IdsValidationResult {
  const ids = raw
    .split(",")
    .map((id) => id.trim().toUpperCase())
    .filter((id) => id.length > 0);

  if (ids.length === 0) {
    return { ok: false, error: "'ids' must contain at least one ICAO code" };
  }
  if (ids.length > MAX_IDS) {
    return { ok: false, error: `'ids' accepts at most ${MAX_IDS} ICAO codes` };
  }
  for (const id of ids) {
    if (!ICAO_PATTERN.test(id)) {
      return { ok: false, error: `Invalid ICAO code: ${id}` };
    }
  }
  return { ok: true, ids };
}

export type BboxValidationResult =
  | { ok: true; bbox: BboxParams }
  | { ok: false; error: string };

/**
 * Parse and validate a `minLat,minLon,maxLat,maxLon` bounding box: valid
 * lat/lon ranges, min < max, and a box no larger than
 * `MAX_BBOX_DEGREES` on either axis.
 */
export function parseBbox(raw: string): BboxValidationResult {
  const parts = raw.split(",").map((p) => p.trim());
  if (parts.length !== 4) {
    return {
      ok: false,
      error: "'bbox' must be 'minLat,minLon,maxLat,maxLon'",
    };
  }

  const [minLat, minLon, maxLat, maxLon] = parts.map(Number);
  if ([minLat, minLon, maxLat, maxLon].some((n) => !Number.isFinite(n))) {
    return { ok: false, error: "'bbox' values must be numbers" };
  }
  if (minLat < -90 || maxLat > 90 || minLat >= maxLat) {
    return { ok: false, error: "'bbox' latitude range is invalid" };
  }
  if (minLon < -180 || maxLon > 180 || minLon >= maxLon) {
    return { ok: false, error: "'bbox' longitude range is invalid" };
  }
  if (maxLat - minLat > MAX_BBOX_DEGREES || maxLon - minLon > MAX_BBOX_DEGREES) {
    return {
      ok: false,
      error: `'bbox' must not exceed ${MAX_BBOX_DEGREES}° on either axis`,
    };
  }

  return { ok: true, bbox: { minLat, minLon, maxLat, maxLon } };
}

// ─── Normalization ──────────────────────────────────────────────────────────

interface RawCloudLayer {
  cover?: string;
  base?: number;
}

interface RawMetarStation {
  icaoId?: string;
  name?: string;
  lat?: number;
  lon?: number;
  obsTime?: number;
  temp?: number;
  dewp?: number;
  wdir?: number | string;
  wspd?: number;
  wgst?: number;
  visib?: number | string;
  altim?: number;
  wxString?: string;
  cover?: string;
  clouds?: RawCloudLayer[];
  fltCat?: string;
  rawOb?: string;
}

export interface NormalizedMetarStation {
  icaoId: string | null;
  name: string | null;
  lat: number | null;
  lon: number | null;
  obsTime: number | null;
  temp: number | null;
  dewp: number | null;
  wdir: number | string | null;
  wspd: number | null;
  wgst: number | null;
  visib: number | string | null;
  altim: number | null;
  wxString: string | null;
  cldCvg: string | null;
  clouds: RawCloudLayer[];
  fltCat: string | null;
  rawOb: string | null;
}

/** Trim an upstream METAR station record to the fields a panel/map layer needs. */
export function normalizeMetarStation(
  raw: RawMetarStation,
): NormalizedMetarStation {
  return {
    icaoId: raw.icaoId ?? null,
    name: raw.name ?? null,
    lat: typeof raw.lat === "number" ? raw.lat : null,
    lon: typeof raw.lon === "number" ? raw.lon : null,
    obsTime: typeof raw.obsTime === "number" ? raw.obsTime : null,
    temp: typeof raw.temp === "number" ? raw.temp : null,
    dewp: typeof raw.dewp === "number" ? raw.dewp : null,
    wdir: raw.wdir ?? null,
    wspd: typeof raw.wspd === "number" ? raw.wspd : null,
    wgst: typeof raw.wgst === "number" ? raw.wgst : null,
    visib: raw.visib ?? null,
    altim: typeof raw.altim === "number" ? raw.altim : null,
    wxString: raw.wxString ?? null,
    cldCvg: raw.cover ?? null,
    clouds: Array.isArray(raw.clouds) ? raw.clouds : [],
    fltCat: raw.fltCat ?? null,
    rawOb: raw.rawOb ?? null,
  };
}

export interface CompactedMetarPayload {
  stations: NormalizedMetarStation[];
  truncated: boolean;
}

/**
 * Normalize a raw METAR array and apply the station-count cap. `oversizedBytes`
 * lets the caller force truncation based on upstream response size even when
 * the parsed station count alone is under the cap.
 */
export function compactMetarPayload(
  raw: unknown,
  oversizedBytes = false,
): CompactedMetarPayload {
  if (!Array.isArray(raw)) {
    return { stations: [], truncated: false };
  }

  const stations = raw.map((entry) =>
    normalizeMetarStation((entry ?? {}) as RawMetarStation),
  );

  if (stations.length > MAX_STATIONS || (oversizedBytes && stations.length > 0)) {
    return { stations: stations.slice(0, MAX_STATIONS), truncated: true };
  }

  return { stations, truncated: false };
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function handleAtmosMetar(request: Request): Promise<Response> {
  const origin = getAllowedOrigin();
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const limited = applyRateLimit(request, "atmos/metar", 20, 60);
  if (limited) return limited;

  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids");
  const bboxParam = url.searchParams.get("bbox");

  if (!idsParam && !bboxParam) {
    return jsonResponse(
      { error: "Provide either 'ids' or 'bbox' query parameter" },
      400,
      corsHeaders,
    );
  }
  if (idsParam && bboxParam) {
    return jsonResponse(
      { error: "Provide only one of 'ids' or 'bbox', not both" },
      400,
      corsHeaders,
    );
  }

  const upstreamUrl = new URL(METAR_URL);
  upstreamUrl.searchParams.set("format", "json");

  if (idsParam) {
    const result = parseIds(idsParam);
    if (!result.ok) {
      return jsonResponse({ error: result.error }, 400, corsHeaders);
    }
    upstreamUrl.searchParams.set("ids", result.ids.join(","));
  } else {
    const result = parseBbox(bboxParam as string);
    if (!result.ok) {
      return jsonResponse({ error: result.error }, 400, corsHeaders);
    }
    const { minLat, minLon, maxLat, maxLon } = result.bbox;
    upstreamUrl.searchParams.set(
      "bbox",
      `${minLat},${minLon},${maxLat},${maxLon}`,
    );
  }

  try {
    const response = await fetch(upstreamUrl.toString(), {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Aviation Weather)",
      },
    });

    if (!response.ok) {
      return jsonResponse(
        { error: `METAR upstream returned ${response.status}`, stations: [] },
        502,
        corsHeaders,
      );
    }

    const text = await response.text();
    const oversized = text.length > MAX_RESPONSE_BYTES;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return jsonResponse(
        { error: "METAR upstream returned invalid JSON", stations: [] },
        502,
        corsHeaders,
      );
    }

    const { stations, truncated } = compactMetarPayload(parsed, oversized);

    return jsonResponse(
      { stations, truncated },
      200,
      corsHeaders,
      "s-maxage=300, stale-while-revalidate=60",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`METAR fetch failed: ${message}`);
    return jsonResponse(
      { error: "METAR fetch failed", stations: [] },
      502,
      corsHeaders,
    );
  }
}
