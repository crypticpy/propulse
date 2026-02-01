/**
 * Vercel Edge Function: HamQTH Callsign Lookup
 *
 * Proxies the HamQTH XML API for callsign lookups.
 * https://www.hamqth.com/developers.php
 *
 * Requires HAMQTH_USERNAME and HAMQTH_PASSWORD environment variables.
 * Returns normalized location data (lat/lon/grid) when available.
 */

export const config = {
  runtime: "edge",
};

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": getAllowedOrigin(),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      ...extraHeaders,
    },
  });
}

function normalizeCallsign(value: string | null): string | null {
  if (!value) return null;
  const cs = value.trim().toUpperCase();
  if (!cs) return null;
  // Simple sanity filter; providers may accept "/" suffixes.
  if (!/^[A-Z0-9/]{3,15}$/.test(cs)) return null;
  return cs;
}

/**
 * Extract a value from XML using regex.
 * Returns undefined if not found.
 */
function extractXmlValue(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
}

/**
 * Authenticate with HamQTH and get a session ID.
 */
async function authenticate(
  username: string,
  password: string,
): Promise<{ sessionId?: string; error?: string }> {
  const authUrl = `https://www.hamqth.com/xml.php?u=${encodeURIComponent(username)}&p=${encodeURIComponent(password)}`;

  try {
    const response = await fetch(authUrl, {
      headers: {
        "User-Agent": "PropUlse/1.0 (DX Wizard Callsign Lookup)",
      },
    });

    if (!response.ok) {
      return { error: `Authentication failed: ${response.status}` };
    }

    const xml = await response.text();

    // Check for error
    const errorMsg = extractXmlValue(xml, "error");
    if (errorMsg) {
      return { error: `HamQTH auth error: ${errorMsg}` };
    }

    const sessionId = extractXmlValue(xml, "session_id");
    if (!sessionId) {
      return { error: "No session ID returned from HamQTH" };
    }

    return { sessionId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Authentication request failed: ${message}` };
  }
}

/**
 * Lookup a callsign using an existing session ID.
 */
async function lookupCallsign(
  sessionId: string,
  callsign: string,
): Promise<{
  data?: Record<string, string | number | undefined>;
  sessionExpired?: boolean;
  notFound?: boolean;
  error?: string;
}> {
  const lookupUrl = `https://www.hamqth.com/xml.php?id=${encodeURIComponent(sessionId)}&callsign=${encodeURIComponent(callsign)}&prg=PropUlse`;

  try {
    const response = await fetch(lookupUrl, {
      headers: {
        "User-Agent": "PropUlse/1.0 (DX Wizard Callsign Lookup)",
      },
    });

    if (!response.ok) {
      return { error: `Lookup failed: ${response.status}` };
    }

    const xml = await response.text();

    // Check for error
    const errorMsg = extractXmlValue(xml, "error");
    if (errorMsg) {
      // Session expired or invalid
      if (
        errorMsg.toLowerCase().includes("session") ||
        errorMsg.toLowerCase().includes("invalid")
      ) {
        return { sessionExpired: true };
      }
      // Callsign not found
      if (
        errorMsg.toLowerCase().includes("not found") ||
        errorMsg.toLowerCase().includes("not exist")
      ) {
        return { notFound: true };
      }
      return { error: errorMsg };
    }

    // Extract fields from XML
    const rawCallsign = extractXmlValue(xml, "callsign");
    const nick = extractXmlValue(xml, "nick");
    const adrName = extractXmlValue(xml, "adr_name");
    const adrCity = extractXmlValue(xml, "adr_city");
    const country = extractXmlValue(xml, "country");
    const grid = extractXmlValue(xml, "grid");
    const cq = extractXmlValue(xml, "cq");
    const itu = extractXmlValue(xml, "itu");
    const latitude = extractXmlValue(xml, "latitude");
    const longitude = extractXmlValue(xml, "longitude");

    // Build name from available fields
    const name = nick || adrName || undefined;

    // Build QTH (location string) from city and country
    const qthParts: string[] = [];
    if (adrCity) qthParts.push(adrCity);
    if (country) qthParts.push(country);
    const qth = qthParts.length > 0 ? qthParts.join(", ") : undefined;

    // Parse numeric values
    const lat = latitude ? parseFloat(latitude) : undefined;
    const lon = longitude ? parseFloat(longitude) : undefined;
    const cqzone = cq ? parseInt(cq, 10) : undefined;
    const ituzone = itu ? parseInt(itu, 10) : undefined;

    return {
      data: {
        callsign: rawCallsign || callsign,
        name,
        grid,
        qth,
        country,
        cqzone: Number.isFinite(cqzone) ? cqzone : undefined,
        ituzone: Number.isFinite(ituzone) ? ituzone : undefined,
        lat: Number.isFinite(lat) ? lat : undefined,
        lon: Number.isFinite(lon) ? lon : undefined,
        source: "hamqth",
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Lookup request failed: ${message}` };
  }
}

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const url = new URL(request.url);
  const callsign = normalizeCallsign(url.searchParams.get("callsign"));
  const providedSessionId = url.searchParams.get("sessionId");

  if (!callsign) {
    return jsonResponse({ error: "Invalid or missing callsign" }, 400);
  }

  // Check for credentials
  const username = process.env.HAMQTH_USERNAME;
  const password = process.env.HAMQTH_PASSWORD;

  if (!username || !password) {
    return jsonResponse(
      {
        error:
          "HamQTH credentials not configured. Use /api/callsign/lookup for Callook (US FCC) data instead.",
        provider: "hamqth",
      },
      501,
    );
  }

  let sessionId = providedSessionId;
  let newSession = false;

  // If no session ID provided, authenticate first
  if (!sessionId) {
    const authResult = await authenticate(username, password);
    if (authResult.error) {
      return jsonResponse({ error: authResult.error, provider: "hamqth" }, 500);
    }
    sessionId = authResult.sessionId!;
    newSession = true;
  }

  // Attempt lookup
  let lookupResult = await lookupCallsign(sessionId, callsign);

  // If session expired and we used a provided session, re-authenticate
  if (lookupResult.sessionExpired && providedSessionId) {
    const authResult = await authenticate(username, password);
    if (authResult.error) {
      return jsonResponse({ error: authResult.error, provider: "hamqth" }, 500);
    }
    sessionId = authResult.sessionId!;
    newSession = true;

    // Retry lookup with new session
    lookupResult = await lookupCallsign(sessionId, callsign);
  }

  // Handle lookup errors
  if (lookupResult.sessionExpired) {
    return jsonResponse(
      {
        error: "Session expired and re-authentication failed",
        provider: "hamqth",
      },
      500,
    );
  }

  if (lookupResult.notFound) {
    return jsonResponse(
      { error: "Callsign not found", provider: "hamqth" },
      404,
    );
  }

  if (lookupResult.error) {
    return jsonResponse({ error: lookupResult.error, provider: "hamqth" }, 500);
  }

  // Return success response with session ID header for frontend caching
  const extraHeaders: Record<string, string> = {};
  if (newSession && sessionId) {
    extraHeaders["X-HamQTH-Session-Id"] = sessionId;
  }

  return jsonResponse(lookupResult.data, 200, extraHeaders);
}
