/**
 * Vercel Edge Function: TEC (Total Electron Content) Proxy
 * Fetches global ionospheric TEC grid data from NOAA SWPC GloTEC to avoid CORS.
 *
 * The old `experimental/products/tec/tecmap-latest.json` endpoint was
 * retired (404). GloTEC instead publishes an index of per-timestamp GeoJSON
 * grid files (newest entry last); this proxy resolves the newest entry and
 * re-emits a lean `{ lat, lon, tec }` grid.
 *
 * Source: https://services.swpc.noaa.gov/products/glotec/geojson_2d_urt.json (index)
 *         -> newest entry's GeoJSON grid (~2.4 MB, 5184-point global grid,
 *            ~2.5°x5° spacing; properties include tec, anomaly, hmF2, NmF2)
 * Cache: 15 minutes with 5 minute stale-while-revalidate
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

const TEC_ORIGIN = "https://services.swpc.noaa.gov";
const TEC_INDEX_URL = `${TEC_ORIGIN}/products/glotec/geojson_2d_urt.json`;

export interface TECGridPoint {
  lat: number;
  lon: number;
  tec: number;
}

interface CompactTECPayload {
  grid: TECGridPoint[];
  timestamp: string | null;
}

/**
 * Resolve the newest GloTEC grid URL from the SWPC index. The index is a
 * JSON array of `{ url, time_tag }` entries with the newest entry last.
 * `url` has been observed as a path relative to services.swpc.noaa.gov;
 * an absolute URL is handled too in case NOAA changes the format.
 */
export function resolveLatestTECGridUrl(index: unknown): string | null {
  if (!Array.isArray(index) || index.length === 0) return null;
  const latest = index[index.length - 1] as Record<string, unknown> | null;
  const url = latest?.url;
  if (typeof url !== "string" || url.length === 0) return null;
  return url.startsWith("http") ? url : `${TEC_ORIGIN}${url}`;
}

/**
 * Compact a GloTEC GeoJSON FeatureCollection into the lean grid contract the
 * client expects: `{ lat, lon, tec }` per point. Drops anomaly/hmF2/NmF2/
 * quality_flag, which the client does not use.
 */
export function compactTECPayload(data: unknown): CompactTECPayload {
  if (!data || typeof data !== "object") {
    return { grid: [], timestamp: null };
  }

  const { features, time_tag: timeTag } = data as Record<string, unknown>;
  if (!Array.isArray(features)) {
    return { grid: [], timestamp: null };
  }

  const grid: TECGridPoint[] = [];
  for (const feature of features) {
    if (!feature || typeof feature !== "object") continue;
    const { geometry, properties } = feature as Record<string, unknown>;
    const coordinates = (geometry as Record<string, unknown> | null)
      ?.coordinates;
    const tec = (properties as Record<string, unknown> | null)?.tec;
    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      typeof tec !== "number" ||
      !Number.isFinite(tec)
    ) {
      continue;
    }
    const [lon, lat] = coordinates;
    if (typeof lon !== "number" || typeof lat !== "number") continue;
    grid.push({ lat, lon, tec });
  }

  return {
    grid,
    timestamp: typeof timeTag === "string" ? timeTag : null,
  };
}

/** Fallback response when upstream data is unavailable */
function fallbackResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ grid: [], timestamp: null, available: false }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
      },
    },
  );
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

  const limited = applyRateLimit(request, "atmos/tec", 10, 60);
  if (limited) return limited;

  try {
    const indexResponse = await fetch(TEC_INDEX_URL, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Solar Dashboard)",
      },
    });

    if (!indexResponse.ok) {
      return fallbackResponse(corsHeaders);
    }

    const gridUrl = resolveLatestTECGridUrl(await indexResponse.json());
    if (!gridUrl) {
      return fallbackResponse(corsHeaders);
    }

    const gridResponse = await fetch(gridUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/geo+json, application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Solar Dashboard)",
      },
    });

    if (!gridResponse.ok) {
      return fallbackResponse(corsHeaders);
    }

    const { grid, timestamp } = compactTECPayload(await gridResponse.json());
    if (grid.length === 0) {
      return fallbackResponse(corsHeaders);
    }

    return new Response(JSON.stringify({ grid, timestamp, available: true }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=900, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`TEC fetch failed: ${message}`);
    return fallbackResponse(corsHeaders);
  }
}
