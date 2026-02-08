/**
 * Vercel Edge Function: Callsign Lookup
 *
 * Current provider: Callook (US FCC) - no API key required.
 * https://callook.info/
 *
 * Returns normalized location data (lat/lon/grid) when available.
 */

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
      "Cache-Control": "no-cache",
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

    type CallookAddress = {
      latitude?: unknown;
      longitude?: unknown;
      gridsquare?: unknown;
    };

    type CallookResponse = {
      status?: unknown;
      name?: unknown;
      address?: CallookAddress;
      current?: {
        operClass?: unknown;
        name?: unknown;
        address?: CallookAddress;
        trustee?: { name?: unknown };
      };
      previous?: { address?: CallookAddress };
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

    const address =
      payload.address ?? payload.current?.address ?? payload.previous?.address;
    const latitude =
      address?.latitude !== undefined ? Number(address.latitude) : undefined;
    const longitude =
      address?.longitude !== undefined ? Number(address.longitude) : undefined;
    const grid =
      address?.gridsquare !== undefined
        ? String(address.gridsquare)
        : undefined;
    const name =
      (typeof payload.name === "string" ? payload.name : undefined) ??
      (typeof payload.current?.name === "string"
        ? payload.current.name
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
