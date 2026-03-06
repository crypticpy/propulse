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

/** NOAA ERDDAP OISST v2.1 — latest SST at surface, 5-degree stride */
const SST_URL =
  "https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21Agg.json?sst[(last)][(0.0)][(-90):5:(90)][(0):5:(360)]";

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

    const data = await response.text();

    return new Response(data, {
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
