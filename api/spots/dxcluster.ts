/**
 * DX Cluster API Proxy - Vercel Edge Function
 *
 * Proxies requests to DXHeat.com to avoid CORS issues
 * Transforms response to unified DXSpot format
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

/**
 * Extract operating mode from DXHeat info/comment string
 * Examples: "FT8 -10 dB 1234 Hz", "CW 22 WPM", "SSB"
 */
function extractMode(info: string): string | undefined {
  if (!info) return undefined;
  const upper = info.toUpperCase();
  const modes = [
    "FT8",
    "FT4",
    "CW",
    "SSB",
    "RTTY",
    "PSK31",
    "PSK63",
    "JT65",
    "JT9",
    "JS8",
    "DATA",
    "AM",
    "FM",
  ];
  for (const mode of modes) {
    if (upper.includes(mode)) return mode;
  }
  return undefined;
}

/**
 * Parse DXHeat HHMM time string to ISO timestamp (today, UTC)
 */
function parseHHMMToISO(hhmm: string): string {
  const now = new Date();
  const h = parseInt(hhmm.substring(0, 2), 10);
  const m = parseInt(hhmm.substring(2, 4), 10);

  if (isNaN(h) || isNaN(m)) {
    return now.toISOString();
  }

  const date = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      h,
      m,
      0,
      0,
    ),
  );

  // If the parsed time is in the future (e.g., spot from yesterday near midnight),
  // roll back one day
  if (date.getTime() > now.getTime() + 60_000) {
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return date.toISOString();
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
    // DXHeat cluster data API
    const apiUrl = `https://dxheat.com/dxc/data/get?limit=${limit}`;

    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Toolset)",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "DXHeat API error", spots: [] }),
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

    // Transform DXHeat spots to DXSpot-compatible format
    const spots = (Array.isArray(data) ? data : []).slice(0, limit).map(
      (
        spot: {
          info?: string;
          de?: string;
          dx?: string;
          freq?: string;
          time?: string;
          band?: string;
        },
        index: number,
      ) => ({
        id: `dxc-${spot.time || "0"}-${spot.de || ""}-${spot.dx || ""}-${index}`,
        spotter: spot.de || "",
        dx: spot.dx || "",
        frequency: parseFloat(spot.freq || "0"),
        mode: extractMode(spot.info || ""),
        comment: spot.info || "",
        time: parseHHMMToISO(spot.time || "0000"),
        band: spot.band || undefined,
      }),
    );

    return new Response(JSON.stringify({ spots }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=30",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
      },
    });
  } catch (error) {
    console.error("DXCluster proxy error:", error);
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
