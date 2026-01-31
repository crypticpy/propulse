/**
 * PSKReporter API Proxy - Vercel Edge Function
 *
 * Proxies requests to PSKReporter.info to avoid CORS issues
 * Transforms response to unified spot format
 */

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

// Maidenhead grid locator regex: 2-8 alphanumeric characters
// Format: AA00 or AA00aa or AA00aa00
const GRID_REGEX = /^[A-Ra-r]{2}[0-9]{2}([A-Xa-x]{2}([0-9]{2})?)?$/;

export default async function handler(req: Request) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
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

  const url = new URL(req.url);

  // Validate and clamp limit (1-200)
  const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), 200);

  // Validate grid format if provided (Maidenhead: 2-8 alphanumeric)
  const grid = url.searchParams.get("grid") || "";
  if (grid && !GRID_REGEX.test(grid)) {
    return new Response(
      JSON.stringify({ error: "Invalid grid format", spots: [] }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getAllowedOrigin(),
        },
      },
    );
  }

  // Mode is passed through but should be alphanumeric only
  const mode = url.searchParams.get("mode") || "";
  if (mode && !/^[A-Za-z0-9]+$/.test(mode)) {
    return new Response(
      JSON.stringify({ error: "Invalid mode format", spots: [] }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getAllowedOrigin(),
        },
      },
    );
  }

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
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Toolset)",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "PSKReporter API error", spots: [] }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60",
            "Access-Control-Allow-Origin": getAllowedOrigin(),
          },
        },
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
          "Access-Control-Allow-Origin": getAllowedOrigin(),
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
        "Access-Control-Allow-Origin": getAllowedOrigin(),
      },
    });
  } catch (error) {
    console.error("PSKReporter proxy error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", spots: [] }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": getAllowedOrigin(),
        },
      },
    );
  }
}
