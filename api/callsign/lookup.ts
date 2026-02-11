/**
 * Vercel Edge Function: Callsign Lookup
 *
 * Current provider: Callook (US FCC) - no API key required.
 * https://callook.info/
 *
 * Returns normalized location data (lat/lon/grid) when available.
 */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control":
        status === 200
          ? "public, s-maxage=86400, stale-while-revalidate=3600"
          : "no-cache",
      "Access-Control-Allow-Origin": getAllowedOrigin(),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}

/** Convert Callook MM/DD/YYYY date string to ISO YYYY-MM-DD. */
function parseCallookDate(mmddyyyy: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(mmddyyyy);
  if (!match) return undefined;
  const [, mm, dd, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeCallsign(value: string | null): string | null {
  if (!value) return null;
  const cs = value.trim().toUpperCase();
  if (!cs) return null;
  // Simple sanity filter; providers may accept "/" suffixes.
  if (!/^[A-Z0-9/]{3,15}$/.test(cs)) return null;
  return cs;
}

export default async function handler(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, "callsign/lookup", 60, 60);
  if (limited) return limited;

  const url = new URL(request.url);
  const callsign = normalizeCallsign(url.searchParams.get("callsign"));
  if (!callsign) {
    return jsonResponse({ error: "Invalid or missing callsign" }, 400);
  }

  const upstreamUrl = `https://callook.info/${encodeURIComponent(callsign)}/json`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (DX Wizard Callsign Lookup)",
      },
    });

    if (!upstream.ok) {
      return jsonResponse(
        {
          error: `Upstream returned ${upstream.status}: ${upstream.statusText}`,
          provider: "callook",
        },
        upstream.status,
      );
    }

    const data = (await upstream.json()) as unknown;

    type CallookLocation = {
      latitude?: unknown;
      longitude?: unknown;
      gridsquare?: unknown;
    };

    type CallookResponse = {
      status?: unknown;
      name?: unknown;
      location?: CallookLocation;
      current?: {
        operClass?: unknown;
        name?: unknown;
        trustee?: { name?: unknown };
      };
      trustee?: { name?: unknown };
      otherInfo?: {
        grantDate?: unknown;
        expiryDate?: unknown;
        frn?: unknown;
      };
    };

    const payload: CallookResponse =
      typeof data === "object" && data !== null
        ? (data as CallookResponse)
        : {};

    if (payload.status !== "VALID") {
      return jsonResponse(
        { error: "Callsign not found", provider: "callook" },
        404,
      );
    }

    const loc = payload.location;
    const latitude =
      loc?.latitude !== undefined ? Number(loc.latitude) : undefined;
    const longitude =
      loc?.longitude !== undefined ? Number(loc.longitude) : undefined;
    const grid =
      loc?.gridsquare !== undefined ? String(loc.gridsquare) : undefined;
    const name =
      (typeof payload.name === "string" ? payload.name : undefined) ??
      (typeof payload.current?.name === "string"
        ? payload.current.name
        : undefined) ??
      (typeof payload.trustee?.name === "string"
        ? payload.trustee.name
        : undefined) ??
      (typeof payload.current?.trustee?.name === "string"
        ? payload.current.trustee.name
        : undefined) ??
      undefined;

    // License metadata
    const licenseClass =
      typeof payload.current?.operClass === "string" &&
      payload.current.operClass
        ? payload.current.operClass.toUpperCase()
        : undefined;
    const grantDate =
      typeof payload.otherInfo?.grantDate === "string"
        ? parseCallookDate(payload.otherInfo.grantDate)
        : undefined;
    const expiryDate =
      typeof payload.otherInfo?.expiryDate === "string"
        ? parseCallookDate(payload.otherInfo.expiryDate)
        : undefined;
    const licenseId =
      typeof payload.otherInfo?.frn === "string" && payload.otherInfo.frn
        ? payload.otherInfo.frn
        : undefined;

    return jsonResponse(
      {
        callsign,
        name,
        grid,
        lat: Number.isFinite(latitude) ? latitude : undefined,
        lon: Number.isFinite(longitude) ? longitude : undefined,
        licenseClass,
        grantDate,
        expiryDate,
        licenseId,
        source: "callook",
      },
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(
      { error: `Failed to lookup callsign: ${message}`, provider: "callook" },
      500,
    );
  }
}
