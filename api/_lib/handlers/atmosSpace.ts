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

/**
 * Vercel Edge Function: Tropical Cyclone Proxy
 * Fetches NHC (National Hurricane Center) active storm data to avoid CORS.
 *
 * Source: https://www.nhc.noaa.gov/CurrentSummaries.json
 * Cache: 15 minutes with 5 minute stale-while-revalidate
 */

/**
 * Vercel Edge Function: Winlink CMS Proxy
 * Fetches public RMS gateway listings from Winlink API to avoid CORS.
 *
 * Source: https://api.winlink.org
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

// ─── GET /api/atmos/tec ─────────────────────────────────────────────────────

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
function fallbackTecResponse(corsHeaders: Record<string, string>): Response {
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

export async function handleAtmosTec(request: Request): Promise<Response> {
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
      return fallbackTecResponse(corsHeaders);
    }

    const gridUrl = resolveLatestTECGridUrl(await indexResponse.json());
    if (!gridUrl) {
      return fallbackTecResponse(corsHeaders);
    }

    const gridResponse = await fetch(gridUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/geo+json, application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Solar Dashboard)",
      },
    });

    if (!gridResponse.ok) {
      return fallbackTecResponse(corsHeaders);
    }

    const { grid, timestamp } = compactTECPayload(await gridResponse.json());
    if (grid.length === 0) {
      return fallbackTecResponse(corsHeaders);
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
    return fallbackTecResponse(corsHeaders);
  }
}

// ─── GET /api/atmos/tropical ────────────────────────────────────────────────
//
// Merges two independent upstreams into one payload:
//  - NHC CurrentSummaries.json: Atlantic/E.Pacific active storms, passed
//    through under the pre-existing `activeStorms` field (see
//    src/lib/api/tropical.ts, which short-circuits on `"activeStorms" in
//    data` and otherwise normalizes a raw NHC array itself).
//  - JTWC's RSS feed: West Pacific / Indian Ocean / Southern Hemisphere
//    active systems, added under a new `jtwc` field. JTWC failures degrade
//    to `jtwc: []` and never affect the NHC half of the response.

const NHC_URL = "https://www.nhc.noaa.gov/CurrentSummaries.json";
const JTWC_RSS_URL = "https://www.metoc.navy.mil/jtwc/rss/jtwc.rss";

export type JtwcBasin = "wpac" | "io" | "shem";

export interface JtwcCyclone {
  id: string;
  name: string;
  basin: JtwcBasin;
  category: string;
  warningNumber: number | null;
  lat: number | null;
  lon: number | null;
  maxWinds: number | null;
  link: string | null;
}

/**
 * JTWC's RSS groups systems into a handful of fixed regional <item>s keyed
 * by <guid>. NWPAC-NIO-WARNINGS mixes West Pacific and North Indian Ocean
 * systems in one item; basin is then resolved per-system below. The
 * EPAC/CPAC item is NHC's territory and the advisories item covers
 * pre-cyclone disturbances rather than active cyclones, so both are
 * ignored here.
 */
const JTWC_ITEM_BASIN: Partial<Record<string, JtwcBasin | "mixed">> = {
  "NWPAC-NIO-WARNINGS": "mixed",
  "SH-WARNINGS": "shem",
};

const JTWC_SYSTEM_RE =
  /<b>\s*(Super Typhoon|Typhoon|Tropical Storm|Tropical Depression|Tropical Cyclone)\s+(\d{2}[A-Za-z])\s*\(([^)]+)\)\s*Warning\s*#?\s*(\d+)\s*<\/b>/gi;
const JTWC_COORD_RE =
  /(\d{1,2}(?:\.\d+)?)\s*([NS])\s+(\d{1,3}(?:\.\d+)?)\s*([EW])/;
const JTWC_WIND_RE = /(?:winds?|intensity)[^.\d]{0,20}(\d{2,3})\s*(?:kt|knots)/i;
const JTWC_LINK_RE = /<a href=['"]([^'"]+web\.txt)['"]/i;

function jtwcBasinForId(id: string, itemBasin: JtwcBasin | "mixed"): JtwcBasin {
  if (itemBasin !== "mixed") return itemBasin;
  return id.toUpperCase().endsWith("W") ? "wpac" : "io";
}

/**
 * Parses JTWC's RSS listing into individual active systems. Only the
 * regional items covering wpac/io/shem are considered; each is scanned for
 * per-system "<b>Typhoon 20W (Name) Warning #14</b>" headers, with
 * lat/lon/winds extracted from the surrounding text when present. Malformed
 * items or systems are skipped rather than failing the whole parse.
 */
export function parseJtwcRss(xml: string): JtwcCyclone[] {
  if (typeof xml !== "string" || xml.length === 0) return [];

  const cyclones: JtwcCyclone[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemRe.exec(xml)) !== null) {
    try {
      const itemBlock = itemMatch[1];
      const guid = itemBlock.match(/<guid>([^<]+)<\/guid>/)?.[1]?.trim();
      const itemBasin = guid ? JTWC_ITEM_BASIN[guid] : undefined;
      if (!itemBasin) continue;

      const description = itemBlock.match(
        /<description>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/description>/,
      )?.[1];
      if (!description) continue;

      const headers = [...description.matchAll(JTWC_SYSTEM_RE)];
      for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        const [, category, id, name, warningNumRaw] = header;
        const start = header.index ?? 0;
        const end =
          i + 1 < headers.length
            ? (headers[i + 1].index ?? description.length)
            : description.length;
        const chunk = description.slice(start, end);

        let lat: number | null = null;
        let lon: number | null = null;
        const coordMatch = chunk.match(JTWC_COORD_RE);
        if (coordMatch) {
          const parsedLat =
            parseFloat(coordMatch[1]) *
            (coordMatch[2].toUpperCase() === "S" ? -1 : 1);
          const parsedLon =
            parseFloat(coordMatch[3]) *
            (coordMatch[4].toUpperCase() === "W" ? -1 : 1);
          if (Number.isFinite(parsedLat) && Number.isFinite(parsedLon)) {
            lat = parsedLat;
            lon = parsedLon;
          }
        }

        let maxWinds: number | null = null;
        const windMatch = chunk.match(JTWC_WIND_RE);
        if (windMatch) {
          const parsed = parseInt(windMatch[1], 10);
          if (Number.isFinite(parsed)) maxWinds = parsed;
        }

        const warningNumber = warningNumRaw ? parseInt(warningNumRaw, 10) : NaN;

        cyclones.push({
          id: id.toUpperCase(),
          name: name.trim(),
          basin: jtwcBasinForId(id, itemBasin),
          category,
          warningNumber: Number.isFinite(warningNumber) ? warningNumber : null,
          lat,
          lon,
          maxWinds,
          link: chunk.match(JTWC_LINK_RE)?.[1] ?? null,
        });
      }
    } catch {
      // Skip malformed items rather than failing the whole feed.
      continue;
    }
  }

  return cyclones;
}

async function fetchJtwcCyclones(): Promise<{
  jtwc: JtwcCyclone[];
  jtwcAvailable: boolean;
}> {
  try {
    const response = await fetch(JTWC_RSS_URL, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/rss+xml, text/xml",
        "User-Agent": "Propulse/1.0 (Ham Radio Solar Dashboard)",
      },
    });
    if (!response.ok) return { jtwc: [], jtwcAvailable: false };
    return { jtwc: parseJtwcRss(await response.text()), jtwcAvailable: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`JTWC RSS fetch failed: ${message}`);
    return { jtwc: [], jtwcAvailable: false };
  }
}

/**
 * Fetches and normalizes the NHC payload to an object shape carrying
 * `activeStorms` (wrapping a bare top-level array, if that's what NHC
 * returns, so the merged response is always a single JSON object). Returns
 * null on any failure so the caller can fall back to the pre-existing empty
 * `activeStorms: []` degraded shape.
 */
async function fetchNhcPayload(): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(NHC_URL, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Solar Dashboard)",
      },
    });
    if (!response.ok) return null;

    const parsed: unknown = JSON.parse(await response.text());
    if (Array.isArray(parsed)) return { activeStorms: parsed };
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Tropical cyclone fetch failed: ${message}`);
    return null;
  }
}

function fallbackTropicalResponse(
  corsHeaders: Record<string, string>,
  jtwc: JtwcCyclone[] = [],
  jtwcAvailable = false,
): Response {
  return new Response(
    JSON.stringify({
      activeStorms: [],
      jtwc,
      jtwcAvailable,
    }),
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

export async function handleAtmosTropical(
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

  const limited = applyRateLimit(request, "atmos/tropical", 10, 60);
  if (limited) return limited;

  const [nhcPayload, { jtwc, jtwcAvailable }] = await Promise.all([
    fetchNhcPayload(),
    fetchJtwcCyclones(),
  ]);

  if (!nhcPayload) {
    return fallbackTropicalResponse(corsHeaders, jtwc, jtwcAvailable);
  }

  return new Response(
    JSON.stringify({ ...nhcPayload, jtwc, jtwcAvailable }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=900, stale-while-revalidate=300",
      },
    },
  );
}

// ─── GET /api/atmos/winlink ─────────────────────────────────────────────────

const WINLINK_URL =
  "https://api.winlink.org/channel/get?format=json&service=PUBLIC&mode=Packet,Winmor,ARDOP,VARA&key=public";

/** Fallback response when upstream data is unavailable */
function fallbackWinlinkResponse(
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ gateways: [] }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate=600",
    },
  });
}

export async function handleAtmosWinlink(
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

  const limited = applyRateLimit(request, "atmos/winlink", 5, 60);
  if (limited) return limited;

  try {
    const response = await fetch(WINLINK_URL, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Dashboard)",
      },
    });

    if (!response.ok) {
      return fallbackWinlinkResponse(corsHeaders);
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
    console.error(`Winlink fetch failed: ${message}`);
    return fallbackWinlinkResponse(corsHeaders);
  }
}
