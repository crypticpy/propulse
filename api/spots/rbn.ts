/**
 * Reverse Beacon Network API Proxy - Vercel Edge Function
 *
 * Proxies requests to RBN to avoid CORS issues
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

  try {
    // RBN provides a JSON feed
    const apiUrl = `https://www.reversebeacon.net/spots.php?s=1&r=${limit}`;

    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Toolset)",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "RBN API error", spots: [] }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=30",
            "Access-Control-Allow-Origin": getAllowedOrigin(),
          },
        },
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
        "Access-Control-Allow-Origin": getAllowedOrigin(),
      },
    });
  } catch (error) {
    console.error("RBN proxy error:", error);
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
