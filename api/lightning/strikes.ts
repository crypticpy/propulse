/**
 * Lightning Strike API - Vercel Edge Function
 *
 * Fetches buffered lightning strikes from the Propulse collector service,
 * which maintains a persistent WebSocket connection to Blitzortung.
 *
 * Requires COLLECTOR_URL environment variable pointing to the collector's
 * HTTP endpoint on Railway (e.g., https://collector-xyz.up.railway.app).
 *
 * Cache: 10 seconds with 5 second stale-while-revalidate
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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": getAllowedOrigin(),
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(req: Request) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const limited = applyRateLimit(req, "lightning/strikes", 20, 60);
  if (limited) return limited;

  const collectorUrl = process.env.COLLECTOR_URL;

  if (!collectorUrl) {
    return new Response(
      JSON.stringify({
        strikes: [],
        error: "COLLECTOR_URL not configured. Lightning data unavailable.",
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "s-maxage=60",
          ...CORS_HEADERS,
        },
      },
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const response = await fetch(`${collectorUrl}/lightning`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Edge Function)",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `Collector returned ${response.status}`,
          strikes: [],
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            ...CORS_HEADERS,
          },
        },
      );
    }

    const data = await response.json();

    // Validate response shape
    if (!data || !Array.isArray(data.strikes)) {
      return new Response(
        JSON.stringify({ error: "Invalid collector response", strikes: [] }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            ...CORS_HEADERS,
          },
        },
      );
    }

    // Cap strikes to prevent canvas performance issues
    const strikes = data.strikes.slice(0, 5000);

    return new Response(JSON.stringify({ strikes }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=10, stale-while-revalidate=5",
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isTimeout = message.includes("abort");

    return new Response(
      JSON.stringify({
        error: isTimeout
          ? "Collector request timed out"
          : `Failed to fetch lightning data: ${message}`,
        strikes: [],
      }),
      {
        status: isTimeout ? 504 : 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          ...CORS_HEADERS,
        },
      },
    );
  }
}
