/**
 * Vercel Edge Function: K-Index Proxy
 * Fetches planetary K-index data from NOAA SWPC to avoid CORS restrictions
 *
 * Source: https://services.swpc.noaa.gov/json/planetary_k_index_1m.json
 * Cache: 60 seconds with 5 minute stale-while-revalidate
 *
 * Security features:
 * - CORS restricted to allowed origin (no wildcards)
 * - Request timeout handling (10 seconds)
 * - Standardized error responses with error codes
 */

export const config = {
  runtime: "edge",
};

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Get the allowed CORS origin based on environment
 * Never returns wildcard "*" to prevent security issues
 */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.app";
}

/**
 * Standard CORS headers for all responses
 */
function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/**
 * Create a standardized error response with error code
 */
function createErrorResponse(
  error: string,
  code: string,
  status: number,
  cacheControl: string = "no-cache",
): Response {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheControl,
      ...getCorsHeaders(),
    },
  });
}

const NOAA_URL =
  "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json";

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...getCorsHeaders(),
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Set up request timeout with AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(NOAA_URL, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Solar Dashboard)",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return createErrorResponse(
        `NOAA API returned ${response.status}: ${response.statusText}`,
        "UPSTREAM_ERROR",
        response.status,
      );
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
        ...getCorsHeaders(),
      },
    });
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle timeout specifically
    if (error instanceof Error && error.name === "AbortError") {
      return createErrorResponse(
        "Request to NOAA API timed out",
        "REQUEST_TIMEOUT",
        504,
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return createErrorResponse(
      `Failed to fetch K-index data: ${message}`,
      "INTERNAL_ERROR",
      500,
    );
  }
}
