/**
 * Vercel Edge Function: SatNOGS Transponder Proxy
 * Fetches active transmitter/transponder data from the SatNOGS database.
 * Provides transponder information for satellite tracking UI.
 *
 * Source: https://db.satnogs.org/api/transmitters/?format=json&status=active
 * Cache: 24 hours with 4 hour stale-while-revalidate (transponder data changes rarely)
 */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

const SATNOGS_URL =
  "https://db.satnogs.org/api/transmitters/?format=json&status=active";

/** Simplified transmitter record sent to the frontend */
interface SimplifiedTransmitter {
  uuid: string;
  description: string;
  alive: boolean;
  type: string;
  uplink_low: number | null;
  uplink_high: number | null;
  downlink_low: number | null;
  downlink_high: number | null;
  mode: string | null;
  invert: boolean;
  baud: number | null;
  norad_cat_id: number;
  status: string;
  service: string;
}

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const limited = applyRateLimit(request, "satellites/transponders", 10, 60);
  if (limited) return limited;

  try {
    const response = await fetch(SATNOGS_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Satellite Tracker)",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `SatNOGS API returned ${response.status}: ${response.statusText}`,
        }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": getAllowedOrigin(),
          },
        },
      );
    }

    const rawData: Array<Record<string, unknown>> = await response.json();

    // Map SatNOGS format to simplified format for frontend
    const transmitters: SimplifiedTransmitter[] = rawData.map((item) => ({
      uuid: String(item.uuid ?? ""),
      description: String(item.description ?? ""),
      alive: Boolean(item.alive),
      type: String(item.type ?? "Transmitter"),
      uplink_low: typeof item.uplink_low === "number" ? item.uplink_low : null,
      uplink_high:
        typeof item.uplink_high === "number" ? item.uplink_high : null,
      downlink_low:
        typeof item.downlink_low === "number" ? item.downlink_low : null,
      downlink_high:
        typeof item.downlink_high === "number" ? item.downlink_high : null,
      mode: typeof item.mode === "string" ? item.mode : null,
      invert: Boolean(item.invert),
      baud: typeof item.baud === "number" ? item.baud : null,
      norad_cat_id:
        typeof item.norad_cat_id === "number" ? item.norad_cat_id : 0,
      status: String(item.status ?? "active"),
      service: String(item.service ?? ""),
    }));

    return new Response(JSON.stringify(transmitters), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=86400, stale-while-revalidate=14400",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        error: `Failed to fetch SatNOGS transponder data: ${message}`,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": getAllowedOrigin(),
        },
      },
    );
  }
}
