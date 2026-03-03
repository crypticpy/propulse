/**
 * Vercel Edge Function: QRZ.com Logbook API Proxy
 *
 * Proxies ADIF uploads to QRZ.com logbook API to avoid CORS issues.
 * QRZ API endpoint: https://logbook.qrz.com/api
 *
 * Authentication: API key (not username/password).
 *
 * QRZ API actions:
 *   - INSERT: Upload ADIF records to QRZ logbook
 *   - STATUS: Check logbook status / validate API key
 *
 * QRZ API response format:
 *   RESULT=OK or RESULT=FAIL&REASON=...
 */

import { applyRateLimit } from "../_lib/rateLimit";
import { verifyAuth } from "../_lib/auth";

export const config = {
  runtime: "edge",
};

const QRZ_API_URL = "https://logbook.qrz.com/api";

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
      "Cache-Control": "no-cache, no-store",
      "Access-Control-Allow-Origin": getAllowedOrigin(),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      ...extraHeaders,
    },
  });
}

/**
 * Parse QRZ API response.
 *
 * QRZ returns URL-encoded key=value pairs separated by &.
 * Example success: RESULT=OK&COUNT=5&LOGID=12345
 * Example failure: RESULT=FAIL&REASON=invalid api key
 */
function parseQrzResponse(text: string): {
  success: boolean;
  recordsUploaded?: number;
  message: string;
} {
  const params = new URLSearchParams(text.trim());
  const result = params.get("RESULT");
  const reason = params.get("REASON");
  const count = params.get("COUNT");
  const logIds = params.get("LOGIDS") || params.get("LOGID");

  if (result === "OK") {
    const recordCount = count ? parseInt(count, 10) : undefined;
    const countStr =
      recordCount != null
        ? `${recordCount} record${recordCount !== 1 ? "s" : ""}`
        : "Records";
    return {
      success: true,
      recordsUploaded: recordCount,
      message: logIds
        ? `${countStr} uploaded to QRZ.com (IDs: ${logIds})`
        : `${countStr} uploaded to QRZ.com successfully`,
    };
  }

  if (result === "FAIL") {
    return {
      success: false,
      message: reason || "QRZ.com returned an error",
    };
  }

  // Fallback: try to detect success/failure from raw text
  const lowerText = text.toLowerCase();
  if (lowerText.includes("invalid") || lowerText.includes("error")) {
    return {
      success: false,
      message: text.trim() || "Unknown QRZ error",
    };
  }

  return {
    success: false,
    message: "Unable to parse QRZ response",
  };
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

  const limited = applyRateLimit(request, "log/qrz", 10, 60);
  if (limited) return limited;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Verify JWT authentication
  const authResult = await verifyAuth(request);
  if (authResult instanceof Response) return authResult;

  let body: {
    adif?: string;
    apiKey?: string;
    action?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { apiKey, action } = body;

  if (!apiKey) {
    return jsonResponse({ error: "QRZ API key is required" }, 400);
  }

  // Determine action: STATUS or INSERT (default)
  const qrzAction = action === "STATUS" ? "STATUS" : "INSERT";

  try {
    // Build form data for QRZ API
    const formParams = new URLSearchParams();
    formParams.set("KEY", apiKey);
    formParams.set("ACTION", qrzAction);

    if (qrzAction === "INSERT") {
      const adif = body.adif;
      if (!adif || adif.trim().length === 0) {
        return jsonResponse(
          { error: "ADIF content is required for upload" },
          400,
        );
      }
      formParams.set("ADIF", adif);
    }

    const response = await fetch(QRZ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "PropUlse/1.0 (Ham Radio Log Upload)",
      },
      body: formParams.toString(),
    });

    if (!response.ok) {
      return jsonResponse(
        {
          success: false,
          error: `QRZ server returned ${response.status}: ${response.statusText}`,
        },
        502,
      );
    }

    const responseText = await response.text();
    const parsed = parseQrzResponse(responseText);

    return jsonResponse(
      {
        success: parsed.success,
        recordsUploaded: parsed.recordsUploaded,
        message: parsed.message,
        error: parsed.success ? undefined : parsed.message,
      },
      parsed.success ? 200 : 400,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(
      {
        success: false,
        error: `Failed to connect to QRZ.com: ${message}`,
      },
      502,
    );
  }
}
