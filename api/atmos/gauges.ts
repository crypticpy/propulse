/**
 * Vercel Edge Function: River Gauge Proxy
 * Fetches USGS NWIS instantaneous gauge height data to avoid CORS.
 *
 * Source: https://waterservices.usgs.gov/nwis/iv/
 * parameterCd=00065 = gage height (ft)
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

const USGS_URL = "https://waterservices.usgs.gov/nwis/iv/";

/** Fallback response when upstream data is unavailable */
function fallbackResponse(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ gauges: [] }), {
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

  const limited = applyRateLimit(request, "atmos/gauges", 5, 60);
  if (limited) return limited;

  const url = new URL(request.url);
  const west = url.searchParams.get("west");
  const south = url.searchParams.get("south");
  const east = url.searchParams.get("east");
  const north = url.searchParams.get("north");

  if (!west || !south || !east || !north) {
    return fallbackResponse(corsHeaders);
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
      return fallbackResponse(corsHeaders);
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
    return fallbackResponse(corsHeaders);
  }
}
