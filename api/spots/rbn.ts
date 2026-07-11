/**
 * Reverse Beacon Network API Proxy - Vercel Edge Function
 *
 * Proxies requests to RBN to avoid CORS issues
 * Transforms response to unified spot format
 *
 * Security features:
 * - CORS restricted to allowed origin (no wildcards)
 * - Request timeout handling (10 seconds)
 * - Input validation for limit parameter
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
  return new Response(JSON.stringify({ error, code, spots: [] }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheControl,
      ...getCorsHeaders(),
    },
  });
}

export default async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...getCorsHeaders(),
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const url = new URL(req.url);

  // Validate and clamp limit parameter (1-500 as per security requirements)
  const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), 500);

  // Set up request timeout with AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // RBN provides a JSON feed
    const apiUrl = `https://www.reversebeacon.net/spots.php?s=1&r=${limit}`;

    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Toolset)",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return createErrorResponse(
        "RBN API error",
        "UPSTREAM_ERROR",
        response.status,
        "public, max-age=30",
      );
    }

    const data = await response.json();

    // Transform RBN spots
    const spots = (data || [])
      .slice(0, limit)
      .map(
        (spot: {
          callsign?: string;
          de_pfx?: string;
          de_cont?: string;
          dx_pfx?: string;
          dx_cont?: string;
          freq?: number;
          band?: number;
          mode?: string;
          db?: number;
          wpm?: number;
          time?: number;
          spotted_time?: string;
        }) => ({
          callsign: spot.callsign || "",
          de_pfx: spot.de_pfx || "",
          de_cont: spot.de_cont || "",
          dx_pfx: spot.dx_pfx || "",
          dx_cont: spot.dx_cont || "",
          freq: spot.freq || 0,
          band: spot.band || 0,
          mode: spot.mode || "CW",
          db: spot.db || 0,
          wpm: spot.wpm || 0,
          time: spot.time || Math.floor(Date.now() / 1000),
          spotted_time: spot.spotted_time || "",
        }),
      );

    return new Response(JSON.stringify({ spots }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
        ...getCorsHeaders(),
      },
    });
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle timeout specifically
    if (error instanceof Error && error.name === "AbortError") {
      return createErrorResponse(
        "Request to RBN API timed out",
        "REQUEST_TIMEOUT",
        504,
      );
    }

    console.error("RBN proxy error:", error);
    return createErrorResponse(
      "Internal error",
      "INTERNAL_ERROR",
      500,
      "no-store",
    );
  }
}
