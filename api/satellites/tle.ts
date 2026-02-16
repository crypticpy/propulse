/**
 * Vercel Edge Function: Satellite TLE Proxy
 * Fetches TLE (Two-Line Element) data from Celestrak for satellite groups,
 * with AMSAT as a fallback source when Celestrak is unavailable (amateur only).
 *
 * Query params:
 *   ?group=<name>  — Celestrak group name (default: "amateur")
 *
 * Sources:
 *   Primary: https://celestrak.org/NORAD/elements/gp.php?GROUP=<group>&FORMAT=tle
 *   Fallback (amateur only): https://www.amsat.org/tle/current/nasabare.txt
 *
 * Cache:
 *   amateur: 2h with 30min stale-while-revalidate
 *   others:  4h with 1h stale-while-revalidate (change less frequently)
 */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

const ALLOWED_GROUPS = new Set([
  "amateur",
  "stations",
  "weather",
  "noaa",
  "cubesat",
  "education",
  "engineering",
  "science",
  "tle-new",
]);

const AMSAT_URL = "https://www.amsat.org/tle/current/nasabare.txt";

function celestrakUrl(group: string): string {
  return `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`;
}

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

async function tryFetch(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/plain",
        "User-Agent": "Propulse/1.0 (Ham Radio Satellite Tracker)",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const text = await response.text();
      if (text.trim().length > 100) return text;
    }
  } catch {
    // Source unavailable
  }
  return null;
}

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(),
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const limited = applyRateLimit(request, "satellites/tle", 10, 60);
  if (limited) return limited;

  // Parse group from query string, default to "amateur"
  const url = new URL(request.url);
  const group = url.searchParams.get("group") || "amateur";

  // Validate against whitelist
  if (!ALLOWED_GROUPS.has(group)) {
    return new Response(JSON.stringify({ error: "Invalid group" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        ...corsHeaders(),
      },
    });
  }

  // Try Celestrak first; AMSAT fallback only available for amateur group
  let tleText = await tryFetch(celestrakUrl(group));
  if (!tleText && group === "amateur") {
    tleText = await tryFetch(AMSAT_URL);
  }

  if (tleText) {
    // Amateur group: 2h cache + 30min SWR (more consumers, fresher data preferred)
    // Other groups: 4h cache + 1h SWR (change less frequently)
    const cacheControl =
      group === "amateur"
        ? "s-maxage=7200, stale-while-revalidate=1800"
        : "s-maxage=14400, stale-while-revalidate=3600";

    return new Response(JSON.stringify({ tle: tleText }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": cacheControl,
        ...corsHeaders(),
      },
    });
  }

  return new Response(
    JSON.stringify({
      error: "Failed to fetch satellite TLE data from all sources",
    }),
    {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        ...corsHeaders(),
      },
    },
  );
}
