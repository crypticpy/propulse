/**
 * Vercel Edge Function: Club Log DXCC Status Proxy
 *
 * Proxies requests to Club Log's DXCC lookup API to avoid CORS issues.
 *
 * GET: Query DXCC entity information for a callsign
 *   - Query params: callsign, api_key
 *   - Fetches from https://clublog.org/getdxcc.php
 *
 * Cached for 5 minutes (DXCC entity data changes infrequently).
 */

export const config = {
  runtime: "edge",
};

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": getAllowedOrigin(),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...extraHeaders,
    },
  });
}

/**
 * Validate a callsign format.
 * Basic check: 3-15 alphanumeric characters plus "/" for portable designators.
 */
function isValidCallsign(callsign: string): boolean {
  return /^[A-Z0-9/]{3,15}$/i.test(callsign);
}

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Only allow GET
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(request.url);
  const callsign = url.searchParams.get("callsign");
  const apiKey = url.searchParams.get("api_key");

  // Validate required params
  if (!callsign) {
    return jsonResponse({ error: "Callsign is required" }, 400);
  }

  if (!isValidCallsign(callsign)) {
    return jsonResponse({ error: "Invalid callsign format" }, 400);
  }

  if (!apiKey) {
    return jsonResponse({ error: "Club Log API key is required" }, 400);
  }

  try {
    // Build Club Log query URL
    const params = new URLSearchParams({
      call: callsign.toUpperCase(),
      api: apiKey,
      full: "1",
    });

    const clublogUrl = `https://clublog.org/getdxcc.php?${params.toString()}`;

    const response = await fetch(clublogUrl, {
      headers: {
        "User-Agent": "PropUlse/1.0 (Ham Radio DXCC Lookup)",
      },
    });

    if (!response.ok) {
      return jsonResponse(
        { error: `Club Log server returned ${response.status}` },
        502,
      );
    }

    const text = await response.text();

    // Club Log returns JSON for the full DXCC data
    // Try to parse it; if it fails, the response is an error string
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      // Club Log may return plain text error messages
      return jsonResponse(
        { error: text.trim() || "Unknown Club Log error" },
        400,
      );
    }

    return jsonResponse(data, 200, {
      "Cache-Control": "public, max-age=300, s-maxage=300",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(
      { error: `Failed to connect to Club Log: ${message}` },
      502,
    );
  }
}
