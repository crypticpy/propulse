/**
 * Vercel Edge Function: Tropical Cyclone Proxy
 * Fetches NHC (National Hurricane Center) active storm data to avoid CORS.
 *
 * Source: https://www.nhc.noaa.gov/CurrentSummaries.json
 * Cache: 15 minutes with 5 minute stale-while-revalidate
 */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

const NHC_URL = "https://www.nhc.noaa.gov/CurrentSummaries.json";

function fallbackResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      activeStorms: [],
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

  const limited = applyRateLimit(request, "atmos/tropical", 10, 60);
  if (limited) return limited;

  try {
    const response = await fetch(NHC_URL, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Solar Dashboard)",
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
        "Cache-Control": "s-maxage=900, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Tropical cyclone fetch failed: ${message}`);
    return fallbackResponse(corsHeaders);
  }
}
