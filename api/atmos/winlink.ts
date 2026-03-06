/**
 * Vercel Edge Function: Winlink CMS Proxy
 * Fetches public RMS gateway listings from Winlink API to avoid CORS.
 *
 * Source: https://api.winlink.org
 * Cache: 1 hour with 10-minute stale-while-revalidate
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

const WINLINK_URL =
  "https://api.winlink.org/channel/get?format=json&service=PUBLIC&mode=Packet,Winmor,ARDOP,VARA&key=public";

/** Fallback response when upstream data is unavailable */
function fallbackResponse(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ gateways: [] }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate=600",
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
      return fallbackResponse(corsHeaders);
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
    return fallbackResponse(corsHeaders);
  }
}
