/**
 * Vercel Edge Function: AMSAT Satellite Status Proxy
 * Fetches operational status reports from AMSAT for a given satellite designator.
 *
 * Source: https://amsat.org/status/api/v1/sat_info.php?name=<name>&hours=24
 * Cache: 30 minutes with 10 minute stale-while-revalidate (status changes frequently)
 *
 * Note: The AMSAT status API is marked as "not stable" — extra defensive error handling applied.
 */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
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

  const limited = applyRateLimit(request, "satellites/status", 20, 60);
  if (limited) return limited;

  // Validate required name query param
  const url = new URL(request.url);
  const name = url.searchParams.get("name");

  if (!name) {
    return new Response(
      JSON.stringify({
        error:
          "Missing 'name' query parameter. Must be a satellite designator (e.g., 'SO-50', 'AO-91').",
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          ...corsHeaders(),
        },
      },
    );
  }

  try {
    const upstream = `https://amsat.org/status/api/v1/sat_info.php?name=${encodeURIComponent(name)}&hours=24`;
    const response = await fetch(upstream, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Satellite Tracker)",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `AMSAT status API returned ${response.status}`,
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

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=1800, stale-while-revalidate=600",
        ...corsHeaders(),
      },
    });
  } catch {
    // AMSAT API is marked as "not stable" — handle all failures gracefully
    return new Response(
      JSON.stringify({
        error: "Failed to fetch satellite status from AMSAT",
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
}
