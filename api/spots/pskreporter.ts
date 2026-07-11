/**
 * PSKReporter API Proxy - Vercel Edge Function
 *
 * Proxies requests to PSKReporter.info to avoid CORS issues
 * Transforms response to unified spot format
 *
 * Security features:
 * - CORS restricted to allowed origin (no wildcards)
 * - Request timeout handling (10 seconds)
 * - Input validation for grid, limit, and mode parameters
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

// Maidenhead grid locator regex: 2-8 alphanumeric characters
// Format: AA00 or AA00aa or AA00aa00
const GRID_REGEX = /^[A-Ra-r]{2}[0-9]{2}([A-Xa-x]{2}([0-9]{2})?)?$/;

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

  // Validate grid format if provided (Maidenhead: 2-8 alphanumeric)
  const grid = url.searchParams.get("grid") || "";
  if (grid && !GRID_REGEX.test(grid)) {
    return createErrorResponse(
      "Invalid grid locator format",
      "INVALID_GRID_FORMAT",
      400,
    );
  }

  // Mode is passed through but should be alphanumeric only
  const mode = url.searchParams.get("mode") || "";
  if (mode && !/^[A-Za-z0-9]+$/.test(mode)) {
    return createErrorResponse(
      "Invalid mode format",
      "INVALID_MODE_FORMAT",
      400,
    );
  }

  // Set up request timeout with AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // PSKReporter API query parameters
    const params = new URLSearchParams();
    params.set("flowStartSeconds", "-900"); // Last 15 minutes
    params.set("rronly", "1"); // Receiver reports only
    params.set("noactive", "1"); // No active check
    if (grid) {
      // Query by receiver locator (4 char grid)
      params.set("receiverLocator", grid.substring(0, 4));
    }
    if (mode) {
      params.set("mode", mode);
    }

    const apiUrl = `https://retrieve.pskreporter.info/query?${params}`;

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
        "PSKReporter API error",
        "UPSTREAM_ERROR",
        response.status,
        "public, max-age=60",
      );
    }

    // PSKReporter returns XML by default, but we requested JSON
    const text = await response.text();

    // Try to parse as JSON first
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // If not JSON, return empty (XML parsing would be complex)
      return new Response(JSON.stringify({ spots: [] }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
          ...getCorsHeaders(),
        },
      });
    }

    // Transform spots
    const spots = (data.receptionReport || [])
      .slice(0, limit)
      .map(
        (report: {
          senderCallsign?: string;
          senderLocator?: string;
          receiverCallsign?: string;
          receiverLocator?: string;
          frequency?: number;
          flowStartSeconds?: number;
          mode?: string;
          sNR?: number;
        }) => ({
          senderCallsign: report.senderCallsign || "",
          senderLocator: report.senderLocator,
          receiverCallsign: report.receiverCallsign || "",
          receiverLocator: report.receiverLocator,
          frequency: report.frequency || 0,
          flowStartSeconds: report.flowStartSeconds || 0,
          mode: report.mode || "FT8",
          sNR: report.sNR,
        }),
      );

    return new Response(JSON.stringify({ spots }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
        ...getCorsHeaders(),
      },
    });
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle timeout specifically
    if (error instanceof Error && error.name === "AbortError") {
      return createErrorResponse(
        "Request to PSKReporter API timed out",
        "REQUEST_TIMEOUT",
        504,
      );
    }

    console.error("PSKReporter proxy error:", error);
    return createErrorResponse(
      "Internal error",
      "INTERNAL_ERROR",
      500,
      "no-store",
    );
  }
}
