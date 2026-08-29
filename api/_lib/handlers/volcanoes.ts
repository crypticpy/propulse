/**
 * Vercel Edge Function: USGS Volcano Alerts Proxy
 * Fetches the current list of US volcanoes at an elevated alert level from
 * USGS HANS to avoid CORS.
 *
 * `getElevatedVolcanoes` is the authoritative elevated-alert list but does
 * not carry coordinates. `getCAPElevated` is a CAP-formatted subset of the
 * same alerts (only volcanoes with an active CAP message) that does carry
 * `latitude`/`longitude`. Both are fetched: the primary list drives which
 * volcanoes are reported, enriched with coordinates from the CAP feed by
 * `vnum` where available (`lat`/`lon` are `null` otherwise). If the primary
 * list is unavailable, the CAP feed is used directly as a fallback list.
 *
 * Source: https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes
 *         https://volcanoes.usgs.gov/hans-public/api/volcano/getCAPElevated
 * Cache: 1 hour with 10-minute stale-while-revalidate
 */

import { applyRateLimit } from "../rateLimit";

/**
 * Get the allowed CORS origin based on environment.
 * Never returns wildcard "*" to prevent security issues.
 */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

const ELEVATED_URL =
  "https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes";
const CAP_ELEVATED_URL =
  "https://volcanoes.usgs.gov/hans-public/api/volcano/getCAPElevated";

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

// ─── Normalization ──────────────────────────────────────────────────────────

interface RawElevatedVolcano {
  obs_abbr?: string;
  volcano_name?: string;
  vnum?: string;
  sent_unixtime?: number;
  sent_utc?: string;
  color_code?: string;
  alert_level?: string;
}

interface RawCapVolcano {
  volcano_name_appended?: string;
  latitude?: number;
  longitude?: number;
  vnum?: string;
  obs_abbr?: string;
  alert_level?: string;
  color_code?: string;
  sent_date_cap?: string;
}

export interface NormalizedVolcano {
  volcanoName: string;
  obsAbbr: string;
  alertLevel: string;
  colorCode: string;
  lat: number | null;
  lon: number | null;
  lastUpdate: string | null;
}

/** Build a `vnum -> {lat, lon}` lookup from the CAP feed for enrichment. */
export function buildCapCoordinateMap(
  capList: unknown,
): Map<string, { lat: number; lon: number }> {
  const map = new Map<string, { lat: number; lon: number }>();
  if (!Array.isArray(capList)) return map;

  for (const entry of capList) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as RawCapVolcano;
    if (
      typeof raw.vnum !== "string" ||
      typeof raw.latitude !== "number" ||
      typeof raw.longitude !== "number"
    ) {
      continue;
    }
    map.set(raw.vnum, { lat: raw.latitude, lon: raw.longitude });
  }
  return map;
}

/**
 * Normalize the primary elevated-volcano list, enriching each entry with
 * coordinates from `coordMap` (built via `buildCapCoordinateMap`) when the
 * volcano's `vnum` is present there.
 */
export function normalizeElevatedVolcanoes(
  raw: unknown,
  coordMap: Map<string, { lat: number; lon: number }> = new Map(),
): NormalizedVolcano[] {
  if (!Array.isArray(raw)) return [];

  const results: NormalizedVolcano[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const v = entry as RawElevatedVolcano;
    if (typeof v.volcano_name !== "string") continue;

    const coords = typeof v.vnum === "string" ? coordMap.get(v.vnum) : undefined;
    const lastUpdate =
      typeof v.sent_unixtime === "number"
        ? new Date(v.sent_unixtime * 1000).toISOString()
        : typeof v.sent_utc === "string"
          ? v.sent_utc
          : null;

    results.push({
      volcanoName: v.volcano_name,
      obsAbbr: v.obs_abbr ?? "",
      alertLevel: v.alert_level ?? "NORMAL",
      colorCode: v.color_code ?? "GREEN",
      lat: coords?.lat ?? null,
      lon: coords?.lon ?? null,
      lastUpdate,
    });
  }
  return results;
}

/** Normalize the CAP feed directly, used as a fallback list when the primary is unavailable. */
export function normalizeCapVolcanoes(raw: unknown): NormalizedVolcano[] {
  if (!Array.isArray(raw)) return [];

  const results: NormalizedVolcano[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const v = entry as RawCapVolcano;
    if (typeof v.volcano_name_appended !== "string") continue;

    results.push({
      volcanoName: v.volcano_name_appended,
      obsAbbr: v.obs_abbr ?? "",
      alertLevel: v.alert_level ?? "NORMAL",
      colorCode: v.color_code ?? "GREEN",
      lat: typeof v.latitude === "number" ? v.latitude : null,
      lon: typeof v.longitude === "number" ? v.longitude : null,
      lastUpdate: v.sent_date_cap ?? null,
    });
  }
  return results;
}

// ─── Handler ────────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Volcano Alerts)",
      },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Volcano fetch failed for ${url}: ${message}`);
    return null;
  }
}

export async function handleAtmosVolcanoes(
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

  const limited = applyRateLimit(request, "atmos/volcanoes", 10, 60);
  if (limited) return limited;

  const cacheControl = "s-maxage=3600, stale-while-revalidate=600";

  const [elevated, cap] = await Promise.all([
    fetchJson(ELEVATED_URL),
    fetchJson(CAP_ELEVATED_URL),
  ]);

  if (elevated !== null) {
    const coordMap = buildCapCoordinateMap(cap);
    const volcanoes = normalizeElevatedVolcanoes(elevated, coordMap);
    return jsonResponse({ volcanoes }, 200, corsHeaders, cacheControl);
  }

  if (cap !== null) {
    const volcanoes = normalizeCapVolcanoes(cap);
    return jsonResponse({ volcanoes }, 200, corsHeaders, cacheControl);
  }

  // Both upstreams unavailable: degrade to an empty list rather than error.
  return jsonResponse(
    { volcanoes: [], note: "USGS HANS volcano data unavailable" },
    200,
    corsHeaders,
    "s-maxage=60, stale-while-revalidate=60",
  );
}
