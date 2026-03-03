/**
 * Vercel Edge Function: LoTW (Logbook of The World) Proxy
 *
 * Proxies requests to ARRL's LoTW service to avoid CORS issues.
 *
 * POST: Upload ADIF records to LoTW
 *   - Body: { adif: string, username: string, password: string }
 *   - Forwards to https://lotw.arrl.org/lotwuser/upload
 *
 * POST: Download QSL confirmations from LoTW
 *   - Body: { username: string, password: string, since?: string }
 *   - Fetches from https://lotw.arrl.org/lotwuser/lotwreport.adi
 *
 * No caching — requests contain user credentials.
 */

import { applyRateLimit } from "../_lib/rateLimit";
import { verifyAuth } from "../_lib/auth";

export const config = {
  runtime: "edge",
};

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

/** Reject browser requests from unauthorized origins */
function validateOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (origin && origin !== getAllowedOrigin()) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
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
      "Cache-Control": "no-store, no-cache",
      "Access-Control-Allow-Origin": getAllowedOrigin(),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      ...extraHeaders,
    },
  });
}

/**
 * Parse the LoTW upload response to determine success/failure.
 *
 * LoTW returns a text page with results like:
 *   "Your file has been queued for processing"
 *   or various error messages
 */
function parseUploadResponse(text: string): {
  success: boolean;
  message: string;
  recordsAccepted: number;
  recordsRejected: number;
} {
  const lower = text.toLowerCase();

  // Success patterns
  if (
    lower.includes("queued for processing") ||
    lower.includes("file has been queued") ||
    lower.includes("successfully")
  ) {
    // Try to extract record counts
    const acceptedMatch = text.match(
      /(\d+)\s*(?:record|qso)s?\s*(?:accepted|added|processed)/i,
    );
    const rejectedMatch = text.match(
      /(\d+)\s*(?:record|qso)s?\s*(?:rejected|failed|error)/i,
    );

    return {
      success: true,
      message: "ADIF file queued for processing by LoTW",
      recordsAccepted: acceptedMatch ? parseInt(acceptedMatch[1], 10) : 0,
      recordsRejected: rejectedMatch ? parseInt(rejectedMatch[1], 10) : 0,
    };
  }

  // Authentication errors
  if (
    lower.includes("password incorrect") ||
    lower.includes("login failed") ||
    lower.includes("invalid login") ||
    lower.includes("username or password")
  ) {
    return {
      success: false,
      message: "Invalid LoTW username or password",
      recordsAccepted: 0,
      recordsRejected: 0,
    };
  }

  // Certificate errors
  if (lower.includes("certificate") || lower.includes("tqsl")) {
    return {
      success: false,
      message: "LoTW requires signed ADIF (use TQSL to sign before upload)",
      recordsAccepted: 0,
      recordsRejected: 0,
    };
  }

  // Generic error
  if (lower.includes("error")) {
    const errorLine = text
      .split("\n")
      .find((l) => l.toLowerCase().includes("error"));
    return {
      success: false,
      message: errorLine ? errorLine.trim() : "Unknown LoTW error",
      recordsAccepted: 0,
      recordsRejected: 0,
    };
  }

  // Unable to determine
  return {
    success: false,
    message: "Unable to parse LoTW response",
    recordsAccepted: 0,
    recordsRejected: 0,
  };
}

/**
 * Handle POST requests — upload ADIF to LoTW
 * Accepts a pre-parsed body to avoid double-reading the request stream.
 */
async function handleUpload(
  _request: Request,
  preBody?: { adif?: string; username?: string; password?: string },
): Promise<Response> {
  const body = preBody ?? (await _request.json().catch(() => null));
  if (!body) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { adif, username, password } = body;

  if (!adif || adif.trim().length === 0) {
    return jsonResponse({ error: "ADIF content is required" }, 400);
  }

  if (!username) {
    return jsonResponse({ error: "LoTW username (callsign) is required" }, 400);
  }

  if (!password) {
    return jsonResponse({ error: "LoTW password is required" }, 400);
  }

  try {
    // LoTW upload expects multipart/form-data
    const formData = new FormData();
    formData.append("login", username.toUpperCase());
    formData.append("password", password);

    // Create a Blob for the ADIF file content
    const adifBlob = new Blob([adif], { type: "application/octet-stream" });
    formData.append("upfile", adifBlob, "upload.adi");

    const response = await fetch("https://lotw.arrl.org/lotwuser/upload", {
      method: "POST",
      headers: {
        "User-Agent": "PropUlse/1.0 (Ham Radio Log Upload)",
      },
      body: formData,
    });

    const text = await response.text();

    if (!response.ok) {
      const result = parseUploadResponse(text);
      return jsonResponse(
        {
          success: false,
          error: result.message || `LoTW server returned ${response.status}`,
        },
        502,
      );
    }

    const result = parseUploadResponse(text);
    return jsonResponse(result, result.success ? 200 : 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(
      {
        success: false,
        error: `Failed to connect to LoTW: ${message}`,
      },
      502,
    );
  }
}

/**
 * Handle download requests — download QSL confirmations from LoTW
 * Accepts POST with JSON body: { username, password, since? }
 */
async function handleDownload(
  _request: Request,
  preBody: { username?: string; password?: string; since?: string },
): Promise<Response> {
  const username = preBody.username ?? null;
  const password = preBody.password ?? null;
  const since = preBody.since ?? null;

  if (!username) {
    return jsonResponse({ error: "LoTW username is required" }, 400);
  }

  if (!password) {
    return jsonResponse({ error: "LoTW password is required" }, 400);
  }

  try {
    // Build the LoTW report query URL
    const params = new URLSearchParams({
      login: username.toUpperCase(),
      password: password,
      qso_query: "1",
      qso_qsl: "yes",
      qso_qsldetail: "yes",
    });

    if (since) {
      // LoTW expects date as YYYY-MM-DD
      params.set("qso_qslsince", since);
    }

    const lotwUrl = `https://lotw.arrl.org/lotwuser/lotwreport.adi?${params.toString()}`;

    const response = await fetch(lotwUrl, {
      headers: {
        "User-Agent": "PropUlse/1.0 (Ham Radio Log Download)",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      const lower = text.toLowerCase();

      if (
        lower.includes("password incorrect") ||
        lower.includes("login failed") ||
        lower.includes("invalid login")
      ) {
        return jsonResponse(
          { error: "Invalid LoTW username or password" },
          401,
        );
      }

      return jsonResponse(
        { error: `LoTW server returned ${response.status}` },
        502,
      );
    }

    const adifText = await response.text();

    // Check if LoTW returned an error page instead of ADIF
    const lowerAdif = adifText.toLowerCase();
    if (
      lowerAdif.includes("<html") &&
      (lowerAdif.includes("password incorrect") ||
        lowerAdif.includes("login failed"))
    ) {
      return jsonResponse({ error: "Invalid LoTW username or password" }, 401);
    }

    return jsonResponse({ adif: adifText }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(
      { error: `Failed to connect to LoTW: ${message}` },
      502,
    );
  }
}

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const originError = validateOrigin(request);
  if (originError) return originError;

  const limited = applyRateLimit(request, "log/lotw", 10, 60);
  if (limited) return limited;

  // Verify JWT authentication
  const authResult = await verifyAuth(request);
  if (authResult instanceof Response) return authResult;

  if (request.method === "POST") {
    // Parse body once and route: upload (has adif) vs download (no adif)
    let body: {
      adif?: string;
      username?: string;
      password?: string;
      since?: string;
    };
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    if (body.adif) {
      return handleUpload(request, body);
    }
    return handleDownload(request, body);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
}
