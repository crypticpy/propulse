/**
 * WSPR Spots API Proxy - Vercel Edge Function
 *
 * Proxies requests to wspr.live ClickHouse HTTP API to avoid CORS issues
 * Returns recent WSPR spots from the past 30 minutes
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

/**
 * Raw row shape from wspr.live ClickHouse JSONEachRow format
 */
interface WsprRawRow {
  tx_sign: string;
  tx_lat: number;
  tx_lon: number;
  rx_sign: string;
  rx_lat: number;
  rx_lon: number;
  band: number;
  frequency: number;
  snr: number;
  power: number;
  time: string;
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

  const limited = applyRateLimit(req, "wspr/spots", 10, 60);
  if (limited) return limited;

  try {
    const query = `SELECT tx_sign, tx_lat, tx_lon, rx_sign, rx_lat, rx_lon, band, frequency, snr, power, time FROM wspr.rx WHERE time > subtractMinutes(now(), 30) ORDER BY time DESC LIMIT 200 FORMAT JSONEachRow`;

    const apiUrl = `https://db1.wspr.live/?query=${encodeURIComponent(query)}`;

    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Toolset)",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "WSPR API error", spots: [] }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": getAllowedOrigin(),
          },
        },
      );
    }

    const text = await response.text();

    // JSONEachRow format: one JSON object per line
    // Use flatMap with per-line try/catch so one malformed line doesn't nuke all spots
    const spots = text
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .flatMap((line) => {
        try {
          const row: WsprRawRow = JSON.parse(line);
          return [
            {
              txCallsign: row.tx_sign,
              txLat: row.tx_lat,
              txLon: row.tx_lon,
              rxCallsign: row.rx_sign,
              rxLat: row.rx_lat,
              rxLon: row.rx_lon,
              band: row.band,
              frequency: row.frequency,
              snr: row.snr,
              power: row.power,
              time: row.time,
            },
          ];
        } catch {
          return [];
        }
      });

    return new Response(JSON.stringify({ spots }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=120, stale-while-revalidate=60",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
      },
    });
  } catch (error) {
    console.error("WSPR proxy error:", error);
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
