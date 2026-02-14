/**
 * Vercel Edge Function: Satellite TLE Proxy
 * Fetches TLE (Two-Line Element) data from Celestrak for amateur radio satellites.
 * Eliminates CORS dependency — the client falls back to this proxy when direct
 * Celestrak access is blocked.
 *
 * Source: https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle
 * Cache: 2 hours with 30 min stale-while-revalidate (TLE data ages slowly)
 */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

const CELESTRAK_URL =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle";

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const limited = applyRateLimit(request, "satellites/tle", 10, 60);
  if (limited) return limited;

  try {
    const response = await fetch(CELESTRAK_URL, {
      headers: {
        Accept: "text/plain",
        "User-Agent": "Propulse/1.0 (Ham Radio Satellite Tracker)",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `Celestrak returned ${response.status}: ${response.statusText}`,
        }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": getAllowedOrigin(),
          },
        },
      );
    }

    const tleText = await response.text();

    // Return raw TLE text wrapped in JSON for consistent parsing
    return new Response(JSON.stringify({ tle: tleText }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=7200, stale-while-revalidate=1800",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        error: `Failed to fetch satellite TLE data: ${message}`,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": getAllowedOrigin(),
        },
      },
    );
  }
}
