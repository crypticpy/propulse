/**
 * Vercel Edge Function: eQSL Inbox Download Proxy
 *
 * Proxies requests to eQSL.cc inbox download to avoid CORS issues.
 *
 * GET: Download incoming eQSL confirmations
 *   - Query params: username, password, since (YYYY-MM-DD)
 *   - Fetches from https://www.eqsl.cc/qslcard/DownloadInBox.cfm
 *
 * No caching — requests contain user credentials.
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
      "Cache-Control": "no-store, no-cache",
      "Access-Control-Allow-Origin": getAllowedOrigin(),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...extraHeaders,
    },
  });
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
      },
    });
  }

  // Only allow GET
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(request.url);
  const username = url.searchParams.get("username");
  const password = url.searchParams.get("password");
  const since = url.searchParams.get("since");

  // Validate required params
  if (!username) {
    return jsonResponse({ error: "eQSL username is required" }, 400);
  }

  if (!password) {
    return jsonResponse({ error: "eQSL password is required" }, 400);
  }

  try {
    // Build eQSL inbox download URL
    const params = new URLSearchParams({
      UserName: username,
      Password: password,
    });

    if (since) {
      // eQSL expects date in YYYYMMDD format
      // Accept YYYY-MM-DD and strip dashes
      params.set("RcvdSince", since.replace(/-/g, ""));
    }

    const eqslUrl = `https://www.eqsl.cc/qslcard/DownloadInBox.cfm?${params.toString()}`;

    const response = await fetch(eqslUrl, {
      headers: {
        "User-Agent": "PropUlse/1.0 (Ham Radio eQSL Download)",
      },
    });

    if (!response.ok) {
      return jsonResponse(
        {
          error: `eQSL server returned ${response.status}: ${response.statusText}`,
        },
        502,
      );
    }

    const text = await response.text();
    const lowerText = text.toLowerCase();

    // Check for authentication errors in the response body
    if (
      lowerText.includes("invalid user") ||
      lowerText.includes("login failed") ||
      lowerText.includes("password incorrect")
    ) {
      return jsonResponse({ error: "Invalid eQSL username or password" }, 401);
    }

    // Check for "no records" response (not an error, just empty)
    if (
      lowerText.includes("no records found") ||
      lowerText.includes("your inbox is empty")
    ) {
      return jsonResponse({ adif: "", message: "No new eQSL records" }, 200);
    }

    // Check if it looks like an error page (HTML) rather than ADIF
    if (
      lowerText.includes("<html") &&
      !lowerText.includes("<eoh>") &&
      !lowerText.includes("<eor>")
    ) {
      // Try to extract an error message from the HTML
      const errorMatch = text.match(/error[:\s]*([^<\n]+)/i);
      return jsonResponse(
        {
          error: errorMatch
            ? errorMatch[1].trim()
            : "Unexpected response from eQSL",
        },
        502,
      );
    }

    // Return the ADIF text
    return jsonResponse({ adif: text }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(
      { error: `Failed to connect to eQSL: ${message}` },
      502,
    );
  }
}
