/**
 * NASA FIRMS Fire Hotspot API Proxy - Vercel Edge Function
 *
 * Proxies requests to NASA FIRMS VIIRS fire detection data to avoid CORS issues.
 * Returns active fire hotspots worldwide as a clean JSON array.
 */

import { applyRateLimit } from "../rateLimit";

/**
 * Get the allowed CORS origin based on environment
 * Never returns wildcard "*" to prevent security issues
 */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

/**
 * Maximum number of hotspots to return. The world CSV arrives grouped by
 * satellite orbit, so the cap must be applied AFTER a full parse — taking
 * the first N file rows silently drops whole continents (North America
 * was entirely absent). Keep the highest-FRP fires globally instead.
 */
const MAX_HOTSPOTS = 5000;

export async function handleFiresHotspots(req: Request) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const limited = applyRateLimit(req, "fires/hotspots", 10, 60);
  if (limited) return limited;

  const mapKey = process.env.FIRMS_MAP_KEY;

  // Graceful degradation when no API key is configured
  if (!mapKey) {
    return new Response(
      JSON.stringify({
        hotspots: [],
        note: "FIRMS_MAP_KEY not configured. Fire data unavailable.",
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
          "Access-Control-Allow-Origin": getAllowedOrigin(),
        },
      },
    );
  }

  try {
    const apiUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/VIIRS_SNPP_NRT/world/1`;

    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Propulse/1.0 (Ham Radio Toolset)",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "FIRMS API error", hotspots: [] }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": getAllowedOrigin(),
          },
        },
      );
    }

    const csvText = await response.text();
    const hotspots = parseCsv(csvText);

    return new Response(JSON.stringify({ hotspots }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
      },
    });
  } catch (error) {
    console.error("FIRMS proxy error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", hotspots: [] }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": getAllowedOrigin(),
        },
      },
    );
  }
}

/**
 * Parse FIRMS CSV data into structured hotspot objects
 *
 * Expected CSV columns:
 * latitude, longitude, bright_ti4, scan, track, acq_date, acq_time,
 * satellite, confidence, version, bright_ti5, frp, daynight
 */
function parseCsv(csv: string): {
  lat: number;
  lon: number;
  brightness: number;
  confidence: string;
  frp: number;
}[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  // Parse header to find column indices
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const latIdx = header.indexOf("latitude");
  const lonIdx = header.indexOf("longitude");
  const brightIdx = header.indexOf("bright_ti4");
  const confIdx = header.indexOf("confidence");
  const frpIdx = header.indexOf("frp");

  // Validate that required columns exist
  if (latIdx === -1 || lonIdx === -1) return [];

  const hotspots: {
    lat: number;
    lon: number;
    brightness: number;
    confidence: string;
    frp: number;
  }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < header.length) continue;

    const lat = parseFloat(cols[latIdx]);
    const lon = parseFloat(cols[lonIdx]);

    if (isNaN(lat) || isNaN(lon)) continue;

    hotspots.push({
      lat,
      lon,
      brightness: brightIdx !== -1 ? parseFloat(cols[brightIdx]) || 0 : 0,
      confidence: confIdx !== -1 ? cols[confIdx].trim() : "nominal",
      frp: frpIdx !== -1 ? parseFloat(cols[frpIdx]) || 0 : 0,
    });
  }

  if (hotspots.length > MAX_HOTSPOTS) {
    hotspots.sort((a, b) => b.frp - a.frp);
    hotspots.length = MAX_HOTSPOTS;
  }

  return hotspots;
}
