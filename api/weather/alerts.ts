/**
 * Vercel Edge Function: NWS Weather Alerts Proxy
 * Fetches active US weather alerts from api.weather.gov, which drops
 * direct browser connections intermittently and wants an identifying
 * User-Agent (a forbidden header in browser fetch). Proxying lets the
 * CDN absorb NWS flakiness and share one upstream fetch across clients.
 *
 * Cache: 5 minutes with 10-minute stale-while-revalidate
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

const NWS_ALERTS_URL =
  "https://api.weather.gov/alerts/active?status=actual&message_type=alert";

/** Empty GeoJSON fallback so the client degrades to zero alerts */
function fallbackResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ type: "FeatureCollection", features: [] }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/geo+json",
        "Cache-Control": "s-maxage=60, stale-while-revalidate=120",
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

  const limited = applyRateLimit(request, "weather/alerts", 10, 60);
  if (limited) return limited;

  try {
    const response = await fetch(NWS_ALERTS_URL, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/geo+json",
        "User-Agent": "(Propulse, contact@propulse.app)",
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
        "Content-Type": "application/geo+json",
        "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`NWS alerts fetch failed: ${message}`);
    return fallbackResponse(corsHeaders);
  }
}
