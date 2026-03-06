/**
 * Vercel Edge Function: APRS.fi Proxy
 * Fetches nearby APRS stations from aprs.fi API to avoid CORS.
 *
 * Source: https://aprs.fi/page/api
 * Cache: 5 minutes with 1-minute stale-while-revalidate
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

const APRS_FI_URL = "https://api.aprs.fi/api/get";

/** Fallback response when upstream data is unavailable */
function fallbackResponse(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ stations: [] }), {
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

  const limited = applyRateLimit(request, "atmos/aprs", 2, 60);
  if (limited) return limited;

  const url = new URL(request.url);
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");
  const range = url.searchParams.get("range") || "100";

  if (!lat || !lon) {
    return fallbackResponse(corsHeaders);
  }

  const apiKey = process.env.APRS_FI_API_KEY;
  if (!apiKey) {
    return fallbackResponse(corsHeaders);
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
      return fallbackResponse(corsHeaders);
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
    return fallbackResponse(corsHeaders);
  }
}
