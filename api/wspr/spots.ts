/** Real recent WSPR observations from the public WSPR.live ClickHouse API. */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = { runtime: "edge" };

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}
interface WsprRawRow {
  tx_sign: string;
  tx_lat: number;
  tx_lon: number;
  tx_loc: string;
  rx_sign: string;
  rx_lat: number;
  rx_lon: number;
  rx_loc: string;
  band: number;
  frequency: number;
  snr: number;
  power: number;
  drift: number;
  distance: number;
  time: string;
}

const WSPR_BAND_CODES: Record<string, number> = {
  "160m": 1,
  "80m": 3,
  "60m": 5,
  "40m": 7,
  "30m": 10,
  "20m": 14,
  "17m": 18,
  "15m": 21,
  "12m": 24,
  "10m": 28,
  "6m": 50,
};

function json(body: unknown, status: number, cacheControl: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheControl,
      "Access-Control-Allow-Origin": getAllowedOrigin(),
    },
  });
}

export default async function handler(req: Request) {
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
    const requestUrl = new URL(req.url);
    const requestedBand = requestUrl.searchParams.get("band") ?? "all";
    const bandCode = WSPR_BAND_CODES[requestedBand];
    if (requestedBand !== "all" && bandCode == null) {
      return json(
        { error: "Unsupported WSPR band", source: "wspr.live", spots: [] },
        400,
        "no-store",
      );
    }

    const bandPredicate = bandCode == null ? "" : ` AND band = ${bandCode}`;
    const query =
      "SELECT tx_sign, tx_lat, tx_lon, tx_loc, " +
      "rx_sign, rx_lat, rx_lon, rx_loc, band, frequency, snr, power, " +
      "drift, distance, time FROM wspr.rx " +
      `WHERE time > subtractMinutes(now(), 30)${bandPredicate} ` +
      "ORDER BY time DESC LIMIT 300 FORMAT JSONEachRow";
    const apiUrl = `https://db1.wspr.live/?query=${encodeURIComponent(query)}`;
    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Toolset)",
      },
    });

    if (!response.ok) {
      return json(
        {
          error: "Live WSPR source unavailable",
          source: "wspr.live",
          live: false,
          spots: [],
        },
        502,
        "no-store",
      );
    }

    const text = await response.text();
    const spots = text
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .flatMap((line) => {
        try {
          const row: WsprRawRow = JSON.parse(line);
          return [
            {
              txCallsign: row.tx_sign,
              txGrid: row.tx_loc,
              txLat: row.tx_lat,
              txLon: row.tx_lon,
              rxCallsign: row.rx_sign,
              rxGrid: row.rx_loc,
              rxLat: row.rx_lat,
              rxLon: row.rx_lon,
              band: row.band,
              frequency: row.frequency,
              snr: row.snr,
              power: row.power,
              drift: row.drift,
              distance: row.distance,
              time: row.time,
            },
          ];
        } catch {
          return [];
        }
      });
    const fetchedAt = new Date().toISOString();

    return json(
      {
        source: "wspr.live",
        live: true,
        band: requestedBand,
        count: spots.length,
        fetchedAt,
        spots,
      },
      200,
      "s-maxage=120, stale-while-revalidate=60",
    );
  } catch (error) {
    console.error("WSPR proxy error:", error);
    return json(
      {
        error: "Live WSPR data unavailable",
        source: "wspr.live",
        live: false,
        spots: [],
      },
      500,
      "no-store",
    );
  }
}
