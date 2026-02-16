/**
 * Vercel Edge Function: SatNOGS Transmitter Proxy
 * Fetches transmitter data from SatNOGS DB for a given NORAD catalog ID.
 *
 * Source: https://db.satnogs.org/api/transmitters/?format=json&satellite__norad_cat_id=<id>
 * Cache: 6 hours with 1 hour stale-while-revalidate (transmitter data changes rarely)
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

  const limited = applyRateLimit(request, "satellites/satnogs", 20, 60);
  if (limited) return limited;

  // Validate required norad query param
  const url = new URL(request.url);
  const norad = url.searchParams.get("norad");

  if (!norad || !/^\d+$/.test(norad)) {
    return new Response(
      JSON.stringify({
        error:
          "Missing or invalid 'norad' query parameter. Must be a numeric NORAD catalog ID.",
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
    const upstream = `https://db.satnogs.org/api/transmitters/?format=json&satellite__norad_cat_id=${norad}`;
    const response = await fetch(upstream, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Satellite Tracker)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `SatNOGS API returned ${response.status}`,
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
        "Cache-Control": "s-maxage=21600, stale-while-revalidate=3600",
        ...corsHeaders(),
      },
    });
  } catch {
    return new Response(
      JSON.stringify({
        error: "Failed to fetch transmitter data from SatNOGS",
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
