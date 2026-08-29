import { applyRateLimit } from "../rateLimit";

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

/**
 * Vercel Edge Function: Callsign Lookup
 *
 * Current provider: Callook (US FCC) - no API key required.
 * https://callook.info/
 *
 * Returns normalized location data (lat/lon/grid) when available.
 */

function lookupJsonResponse(body: unknown, status: number): Response {
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

export async function handleCallsignLookup(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, "callsign/lookup", 60, 60);
  if (limited) return limited;

  const url = new URL(request.url);
  const callsign = normalizeCallsign(url.searchParams.get("callsign"));
  if (!callsign) {
    return lookupJsonResponse({ error: "Invalid or missing callsign" }, 400);
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
      return lookupJsonResponse(
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
      return lookupJsonResponse(
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

    return lookupJsonResponse(
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
    return lookupJsonResponse(
      { error: `Failed to lookup callsign: ${message}`, provider: "callook" },
      500,
    );
  }
}

/**
 * Vercel Edge Function: Club Log DXCC Status Proxy
 *
 * Proxies requests to Club Log's DXCC lookup API to avoid CORS issues.
 *
 * GET: Query DXCC entity information for a callsign
 *   - Query params: callsign, api_key
 *   - Fetches from https://clublog.org/getdxcc.php
 *
 * Cached for 5 minutes (DXCC entity data changes infrequently).
 */

function clublogJsonResponse(
  body: unknown,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": getAllowedOrigin(),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...extraHeaders,
    },
  });
}

/**
 * Validate a callsign format.
 * Basic check: 3-15 alphanumeric characters plus "/" for portable designators.
 */
function isValidCallsign(callsign: string): boolean {
  return /^[A-Z0-9/]{3,15}$/i.test(callsign);
}

export async function handleCallsignClublogStatus(
  request: Request,
): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
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

  const limited = applyRateLimit(request, "callsign/clublog-status", 30, 60);
  if (limited) return limited;

  // Only allow GET
  if (request.method !== "GET") {
    return clublogJsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(request.url);
  const callsign = url.searchParams.get("callsign");
  const apiKey = url.searchParams.get("api_key");

  // Validate required params
  if (!callsign) {
    return clublogJsonResponse({ error: "Callsign is required" }, 400);
  }

  if (!isValidCallsign(callsign)) {
    return clublogJsonResponse({ error: "Invalid callsign format" }, 400);
  }

  if (!apiKey) {
    return clublogJsonResponse({ error: "Club Log API key is required" }, 400);
  }

  try {
    // Build Club Log query URL
    const params = new URLSearchParams({
      call: callsign.toUpperCase(),
      api: apiKey,
      full: "1",
    });

    const clublogUrl = `https://clublog.org/getdxcc.php?${params.toString()}`;

    const response = await fetch(clublogUrl, {
      headers: {
        "User-Agent": "PropUlse/1.0 (Ham Radio DXCC Lookup)",
      },
    });

    if (!response.ok) {
      return clublogJsonResponse(
        { error: `Club Log server returned ${response.status}` },
        502,
      );
    }

    const text = await response.text();

    // Club Log returns JSON for the full DXCC data
    // Try to parse it; if it fails, the response is an error string
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      // Club Log may return plain text error messages
      return clublogJsonResponse(
        { error: text.trim() || "Unknown Club Log error" },
        400,
      );
    }

    return clublogJsonResponse(data, 200, {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return clublogJsonResponse(
      { error: `Failed to connect to Club Log: ${message}` },
      502,
    );
  }
}
