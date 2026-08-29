/**
 * Lightning Strike API - Vercel Edge Function
 *
 * Fetches buffered lightning strikes from the Propulse collector service,
 * which maintains a persistent WebSocket connection to Blitzortung.
 *
 * COLLECTOR_URL overrides the default Railway collector deployment.
 * If the collector is unreachable, the endpoint returns a cacheable
 * unavailable state instead of an error.
 *
 * Cache: 10 seconds with 5 second stale-while-revalidate
 */

import { applyRateLimit } from "../rateLimit";

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

function unavailable(reason: string) {
  return new Response(
    JSON.stringify({
      strikes: [],
      available: false,
      reason,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
        ...CORS_HEADERS,
      },
    },
  );
}

export async function handleLightningStrikes(req: Request) {
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

  const collectorUrl =
    process.env.COLLECTOR_URL ||
    "https://collector-production-a966.up.railway.app";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(`${collectorUrl}/lightning`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Edge Function)",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return unavailable(`Lightning collector returned ${response.status}.`);
    }

    const data = await response.json();

    // Validate response shape
    if (!data || !Array.isArray(data.strikes)) {
      return unavailable("Lightning collector response was invalid.");
    }

    // Cap strikes to prevent canvas performance issues
    const strikes = data.strikes.slice(0, 5000);

    return new Response(JSON.stringify({ strikes, available: true }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=10, stale-while-revalidate=5",
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return unavailable(
      isTimeout
        ? "Lightning collector request timed out."
        : "Lightning collector is temporarily unavailable.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
