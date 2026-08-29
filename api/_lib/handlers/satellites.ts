/**
 * Vercel Edge Function: SatNOGS Transmitter Proxy
 * Fetches transmitter data from SatNOGS DB for a given NORAD catalog ID.
 *
 * Source: https://db.satnogs.org/api/transmitters/?format=json&satellite__norad_cat_id=<id>
 * Cache: 6 hours with 1 hour stale-while-revalidate (transmitter data changes rarely)
 */

/**
 * Vercel Edge Function: AMSAT Satellite Status Proxy
 * Fetches operational status reports from AMSAT for a given satellite designator.
 *
 * Source: https://amsat.org/status/api/v1/sat_info.php?name=<name>&hours=24
 * Cache: 30 minutes with 10 minute stale-while-revalidate (status changes frequently)
 *
 * Note: The AMSAT status API is marked as "not stable" — extra defensive error handling applied.
 */

/**
 * Vercel Edge Function: SatNOGS Transponder Proxy
 * Fetches active transmitter/transponder data from the SatNOGS database.
 * Provides transponder information for satellite tracking UI.
 *
 * Source: https://db.satnogs.org/api/transmitters/?format=json&status=active
 * Cache: 24 hours with 4 hour stale-while-revalidate (transponder data changes rarely)
 */

import { applyRateLimit } from "../rateLimit";

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

// ─── SatNOGS transmitter (by NORAD ID) ──────────────────────────────────────

function satnogsCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

export async function handleSatellitesSatnogs(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...satnogsCorsHeaders(),
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const limited = applyRateLimit(request, "satellites/satnogs", 20, 60);
  if (limited) return limited;

  // Validate required norad query param
  const url = new URL(request.url);
  const norad = url.searchParams.get("norad");

  if (!norad || !/^\d+$/.test(norad)) {
    return new Response(
      JSON.stringify({
        error:
          "Missing or invalid 'norad' query parameter. Must be a numeric NORAD catalog ID.",
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          ...satnogsCorsHeaders(),
        },
      },
    );
  }

  try {
    const upstream = `https://db.satnogs.org/api/transmitters/?format=json&satellite__norad_cat_id=${norad}`;
    const response = await fetch(upstream, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Satellite Tracker)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `SatNOGS API returned ${response.status}`,
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            ...satnogsCorsHeaders(),
          },
        },
      );
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=21600, stale-while-revalidate=3600",
        ...satnogsCorsHeaders(),
      },
    });
  } catch {
    return new Response(
      JSON.stringify({
        error: "Failed to fetch transmitter data from SatNOGS",
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          ...satnogsCorsHeaders(),
        },
      },
    );
  }
}

// ─── AMSAT satellite status ─────────────────────────────────────────────────

function statusCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

export async function handleSatellitesStatus(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...statusCorsHeaders(),
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const limited = applyRateLimit(request, "satellites/status", 20, 60);
  if (limited) return limited;

  // Validate required name query param
  const url = new URL(request.url);
  const name = url.searchParams.get("name");

  if (!name) {
    return new Response(
      JSON.stringify({
        error:
          "Missing 'name' query parameter. Must be a satellite designator (e.g., 'SO-50', 'AO-91').",
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          ...statusCorsHeaders(),
        },
      },
    );
  }

  try {
    const upstream = `https://amsat.org/status/api/v1/sat_info.php?name=${encodeURIComponent(name)}&hours=24`;
    const response = await fetch(upstream, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Satellite Tracker)",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `AMSAT status API returned ${response.status}`,
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            ...statusCorsHeaders(),
          },
        },
      );
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=1800, stale-while-revalidate=600",
        ...statusCorsHeaders(),
      },
    });
  } catch {
    // AMSAT API is marked as "not stable" — handle all failures gracefully
    return new Response(
      JSON.stringify({
        error: "Failed to fetch satellite status from AMSAT",
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          ...statusCorsHeaders(),
        },
      },
    );
  }
}

// ─── SatNOGS transponders (active) ──────────────────────────────────────────

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

export async function handleSatellitesTransponders(request: Request): Promise<Response> {
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
