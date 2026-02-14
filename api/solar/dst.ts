/**
 * Vercel Edge Function: Dst Index Proxy
 * Fetches Dst (Disturbance Storm Time) index from NOAA SWPC / Kyoto
 *
 * Source: https://services.swpc.noaa.gov/products/kyoto-dst.json
 * Cache: 30 minutes with 5 minute stale-while-revalidate
 */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

/**
 * Get the allowed CORS origin based on environment
 * Never returns wildcard "*" to prevent security issues
 */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

const NOAA_URL = "https://services.swpc.noaa.gov/products/kyoto-dst.json";

export default async function handler(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, "solar/dst", 30, 60);
  if (limited) return limited;

  try {
    const response = await fetch(NOAA_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Solar Dashboard)",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `NOAA API returned ${response.status}: ${response.statusText}`,
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

    const data = await response.json();

    // The Kyoto Dst JSON is an array of [time_tag, dst] pairs
    // First entry is the header row, skip it
    // Return last 24 entries (24 hours of hourly data)
    const entries = Array.isArray(data) ? data.slice(-25) : data;

    return new Response(JSON.stringify(entries), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=1800, stale-while-revalidate=300",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        error: `Failed to fetch Dst index data: ${message}`,
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
