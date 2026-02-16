/**
 * Vercel Edge Function: Satellite TLE Proxy
 * Fetches TLE (Two-Line Element) data from Supabase (collector-cached) first,
 * then falls back to Celestrak / AMSAT when the cache is empty.
 *
 * Query params:
 *   ?group=<name>  — Celestrak group name (default: "amateur")
 *
 * Sources (priority order):
 *   1. Supabase `satellite_tle` table (collector-cached, PostgREST)
 *   2. https://celestrak.org/NORAD/elements/gp.php?GROUP=<group>&FORMAT=tle
 *   3. https://www.amsat.org/tle/current/nasabare.txt (amateur only)
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

async function trySupabase(
  group: string,
): Promise<{ tleText: string; collectedAt: string } | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  try {
    // Use PostgREST directly (no SDK needed in edge function)
    const url = `${supabaseUrl}/rest/v1/satellite_tle?tle_group=eq.${encodeURIComponent(group)}&select=satellite_name,tle_line1,tle_line2,collected_at&order=satellite_name`;
    const res = await fetch(url, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const data: Array<{
      satellite_name: string;
      tle_line1: string;
      tle_line2: string;
      collected_at: string;
    }> = await res.json();

    if (!data || data.length === 0) return null;

    // Reconstruct three-line TLE text from DB rows
    const tleText = data
      .map((row) => `${row.satellite_name}\n${row.tle_line1}\n${row.tle_line2}`)
      .join("\n");

    // collected_at is the same for all rows in a batch
    const collectedAt = data[0].collected_at;

    return { tleText, collectedAt };
  } catch {
    return null;
  }
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

  // 1. Try Supabase first (collector-cached data)
  const cached = await trySupabase(group);
  if (cached) {
    const cacheControl =
      group === "amateur"
        ? "s-maxage=7200, stale-while-revalidate=1800"
        : "s-maxage=14400, stale-while-revalidate=3600";

    return new Response(
      JSON.stringify({
        tle: cached.tleText,
        _meta: { collectedAt: cached.collectedAt, source: "collector" },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": cacheControl,
          ...corsHeaders(),
        },
      },
    );
  }

  // 2. Fallback: fetch from Celestrak directly
  let tleText = await tryFetch(celestrakUrl(group));
  if (!tleText && group === "amateur") {
    tleText = await tryFetch(AMSAT_URL);
  }

  if (tleText) {
    const cacheControl =
      group === "amateur"
        ? "s-maxage=7200, stale-while-revalidate=1800"
        : "s-maxage=14400, stale-while-revalidate=3600";

    return new Response(
      JSON.stringify({
        tle: tleText,
        _meta: {
          collectedAt: new Date().toISOString(),
          source: "direct",
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": cacheControl,
          ...corsHeaders(),
        },
      },
    );
  }

  // 3. Complete failure
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
