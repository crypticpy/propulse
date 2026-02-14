/**
 * Vercel Edge Function: X-Ray Flux Proxy
 * Fetches GOES primary X-ray flux data from NOAA SWPC to avoid CORS restrictions
 *
 * Source: https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json
 * Cache: 5 minutes with 1 minute stale-while-revalidate
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

const NOAA_URL =
  "https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json";

export default async function handler(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, "solar/xray", 30, 60);
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

    // Return last 60 entries (1 hour of 1-min data)
    const entries = Array.isArray(data) ? data.slice(-60) : data;

    return new Response(JSON.stringify(entries), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        error: `Failed to fetch X-ray flux data: ${message}`,
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
