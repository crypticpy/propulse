/**
 * Vercel Edge Function: QRZ.com Callsign Lookup
 *
 * Proxies the QRZ.com XML API for callsign lookups.
 * https://www.qrz.com/docs/xml/current/
 *
 * The API key is provided by the user (QRZ XML Logbook Data subscription).
 * Returns normalized location data (lat/lon/grid) when available.
 */

import { applyRateLimit } from "../_lib/rateLimit";
import { verifyAuth } from "../_lib/auth";

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
      "Cache-Control":
        status === 200
          ? "public, s-maxage=86400, stale-while-revalidate=3600"
          : "no-cache",
      "Access-Control-Allow-Origin": getAllowedOrigin(),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, Authorization",
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
 * Strip HTML tags, decode common entities, and truncate.
 */
function stripHtml(html: string): string {
  // Strip HTML tags
  let text = html.replace(/<[^>]*>/g, " ");
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  // Collapse whitespace and trim
  text = text.replace(/\s+/g, " ").trim();
  // Truncate to 500 characters
  if (text.length > 500) {
    text = text.slice(0, 500);
  }
  return text;
}

/**
 * Authenticate with QRZ.com and get a session key.
 */
async function authenticate(
  apiKey: string,
): Promise<{ sessionKey?: string; error?: string }> {
  const authUrl = `https://xmldata.qrz.com/xml/current/?username=${encodeURIComponent(apiKey)}&password=${encodeURIComponent(apiKey)}&agent=Propulse`;

  try {
    const response = await fetch(authUrl, {
      headers: {
        "User-Agent": "Propulse/1.0 (Callsign Lookup)",
      },
    });

    if (!response.ok) {
      return { error: `Authentication failed: ${response.status}` };
    }

    const xml = await response.text();

    // Check for error
    const errorMsg = extractXmlValue(xml, "Error");
    if (errorMsg) {
      return { error: errorMsg };
    }

    const sessionKey = extractXmlValue(xml, "Key");
    if (!sessionKey) {
      return { error: "No session key returned from QRZ" };
    }

    return { sessionKey };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Authentication request failed: ${message}` };
  }
}

/**
 * Lookup a callsign using an existing session key.
 */
async function lookupCallsign(
  sessionKey: string,
  callsign: string,
): Promise<{
  data?: Record<string, string | number | undefined>;
  bioLength?: number;
  sessionExpired?: boolean;
  notFound?: boolean;
  error?: string;
}> {
  const lookupUrl = `https://xmldata.qrz.com/xml/current/?s=${encodeURIComponent(sessionKey)}&callsign=${encodeURIComponent(callsign)}`;

  try {
    const response = await fetch(lookupUrl, {
      headers: {
        "User-Agent": "Propulse/1.0 (Callsign Lookup)",
      },
    });

    if (!response.ok) {
      return { error: `Lookup failed: ${response.status}` };
    }

    const xml = await response.text();

    // Check for error in Session block
    const errorMsg = extractXmlValue(xml, "Error");
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

    // Extract fields from QRZ XML <Callsign> element
    const rawCallsign = extractXmlValue(xml, "call");
    const fname = extractXmlValue(xml, "fname");
    const lname = extractXmlValue(xml, "name");
    const grid = extractXmlValue(xml, "grid");
    const latitude = extractXmlValue(xml, "lat");
    const longitude = extractXmlValue(xml, "lon");
    const country = extractXmlValue(xml, "country");
    const city = extractXmlValue(xml, "addr2");
    const state = extractXmlValue(xml, "state");
    const licenseClass = extractXmlValue(xml, "class");
    const grantDate = extractXmlValue(xml, "efdate");
    const expiryDate = extractXmlValue(xml, "expdate");
    const imageUrl = extractXmlValue(xml, "image");
    const cq = extractXmlValue(xml, "cqzone");
    const itu = extractXmlValue(xml, "ituzone");
    const bio = extractXmlValue(xml, "bio");

    // Build name from first + last
    const nameParts: string[] = [];
    if (fname) nameParts.push(fname);
    if (lname) nameParts.push(lname);
    const name = nameParts.length > 0 ? nameParts.join(" ") : undefined;

    // Build QTH from city and state
    const qthParts: string[] = [];
    if (city) qthParts.push(city);
    if (state) qthParts.push(state);
    const qth = qthParts.length > 0 ? qthParts.join(", ") : undefined;

    // Parse numeric values
    const lat = latitude ? parseFloat(latitude) : undefined;
    const lon = longitude ? parseFloat(longitude) : undefined;
    const cqzone = cq ? parseInt(cq, 10) : undefined;
    const ituzone = itu ? parseInt(itu, 10) : undefined;

    // Bio length (number of bytes reported by QRZ)
    const bioLength = bio ? parseInt(bio, 10) : 0;

    return {
      data: {
        callsign: rawCallsign || callsign,
        name,
        grid,
        qth,
        country,
        licenseClass: licenseClass ? licenseClass.toUpperCase() : undefined,
        grantDate: grantDate || undefined,
        expiryDate: expiryDate || undefined,
        imageUrl: imageUrl || undefined,
        cqzone: Number.isFinite(cqzone) ? cqzone : undefined,
        ituzone: Number.isFinite(ituzone) ? ituzone : undefined,
        lat: Number.isFinite(lat) ? lat : undefined,
        lon: Number.isFinite(lon) ? lon : undefined,
        source: "qrz",
      },
      bioLength: Number.isFinite(bioLength) ? bioLength : 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Lookup request failed: ${message}` };
  }
}

/**
 * Fetch the bio HTML for a callsign and return cleaned plain text.
 * Uses a 3-second timeout. Returns undefined on any failure.
 */
async function fetchBio(
  sessionKey: string,
  callsign: string,
): Promise<string | undefined> {
  const bioUrl = `https://xmldata.qrz.com/xml/current/?s=${encodeURIComponent(sessionKey)}&html=${encodeURIComponent(callsign)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(bioUrl, {
      headers: {
        "User-Agent": "Propulse/1.0 (Callsign Lookup)",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return undefined;
    }

    const html = await response.text();
    if (!html || html.trim().length === 0) {
      return undefined;
    }

    const text = stripHtml(html);
    return text.length > 0 ? text : undefined;
  } catch {
    // Timeout, network error, or abort — continue without bio
    return undefined;
  }
}

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, X-Api-Key, Authorization",
      },
    });
  }

  const limited = applyRateLimit(request, "callsign/qrz", 30, 60);
  if (limited) return limited;

  // Verify JWT authentication
  const authResult = await verifyAuth(request);
  if (authResult instanceof Response) return authResult;

  let callsign: string | null = null;
  let apiKey: string | null = null;

  if (request.method === "POST") {
    // POST: read callsign and apiKey from JSON body
    let body: { callsign?: string; apiKey?: string };
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    callsign = normalizeCallsign(body.callsign ?? null);
    apiKey = body.apiKey ?? null;
  } else if (request.method === "GET") {
    // GET: callsign from query param, apiKey from X-Api-Key header (not query param)
    const url = new URL(request.url);
    callsign = normalizeCallsign(url.searchParams.get("callsign"));
    apiKey = request.headers.get("X-Api-Key");
  } else {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!callsign) {
    return jsonResponse({ error: "Invalid or missing callsign" }, 400);
  }

  if (!apiKey) {
    return jsonResponse(
      {
        error:
          "Missing apiKey parameter. Provide your QRZ XML Logbook Data subscription key.",
        provider: "qrz",
      },
      400,
    );
  }

  // Authenticate with QRZ
  const qrzAuth = await authenticate(apiKey);
  if (qrzAuth.error) {
    // Distinguish auth errors from network errors
    const isAuthError =
      qrzAuth.error.toLowerCase().includes("password") ||
      qrzAuth.error.toLowerCase().includes("username") ||
      qrzAuth.error.toLowerCase().includes("invalid") ||
      qrzAuth.error.toLowerCase().includes("not found") ||
      qrzAuth.error.toLowerCase().includes("denied");

    return jsonResponse(
      {
        error: isAuthError ? "Invalid QRZ API key" : qrzAuth.error,
        provider: "qrz",
      },
      isAuthError ? 401 : 500,
    );
  }

  let sessionKey = qrzAuth.sessionKey!;

  // Attempt lookup
  let lookupResult = await lookupCallsign(sessionKey, callsign);

  // If session expired, re-authenticate once and retry
  if (lookupResult.sessionExpired) {
    const reAuthResult = await authenticate(apiKey);
    if (reAuthResult.error) {
      return jsonResponse(
        {
          error: "Session expired and re-authentication failed",
          provider: "qrz",
        },
        500,
      );
    }
    sessionKey = reAuthResult.sessionKey!;
    lookupResult = await lookupCallsign(sessionKey, callsign);
  }

  // Handle lookup errors
  if (lookupResult.sessionExpired) {
    return jsonResponse(
      {
        error: "Session expired and re-authentication failed",
        provider: "qrz",
      },
      500,
    );
  }

  if (lookupResult.notFound) {
    return jsonResponse({ error: "Callsign not found", provider: "qrz" }, 404);
  }

  if (lookupResult.error) {
    return jsonResponse({ error: lookupResult.error, provider: "qrz" }, 500);
  }

  // If bio length > 0, fetch bio HTML and extract text
  const data = { ...lookupResult.data };
  if (lookupResult.bioLength && lookupResult.bioLength > 0) {
    const bioText = await fetchBio(sessionKey, callsign);
    if (bioText) {
      data.bioText = bioText;
    }
  }

  return jsonResponse(data, 200);
}
