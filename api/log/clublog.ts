/**
 * Vercel Edge Function: Club Log Upload Proxy
 *
 * Proxies ADIF uploads to Club Log to avoid CORS issues.
 * https://clublog.org/putlogs.php
 *
 * Note: Club Log uses API credentials (email/password) which
 * are different from website login credentials.
 *
 * Accepts JSON with adifContent, email, password, and callsign.
 * Returns JSON with success status and message.
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...extraHeaders,
    },
  });
}

/**
 * Parse Club Log response to extract result
 * Club Log returns plain text:
 * - "OK" or "OK: X QSOs" on success
 * - Error message on failure
 */
function parseClublogResponse(text: string): {
  success: boolean;
  recordsUploaded?: number;
  message: string;
} {
  const trimmed = text.trim();
  const lowerText = trimmed.toLowerCase();

  // Check for success
  if (lowerText.startsWith("ok")) {
    // Try to extract record count: "OK: 5 QSOs"
    const countMatch = trimmed.match(/ok[:\s]*(\d+)\s*qso/i);
    if (countMatch) {
      const count = parseInt(countMatch[1], 10);
      return {
        success: true,
        recordsUploaded: count,
        message: `Successfully uploaded ${count} QSO${count !== 1 ? "s" : ""} to Club Log`,
      };
    }

    return {
      success: true,
      message: "Successfully uploaded to Club Log",
    };
  }

  // Check for common error patterns
  if (lowerText.includes("invalid") && lowerText.includes("password")) {
    return {
      success: false,
      message: "Invalid Club Log email or password",
    };
  }

  if (lowerText.includes("invalid") && lowerText.includes("email")) {
    return {
      success: false,
      message: "Invalid Club Log email address",
    };
  }

  if (lowerText.includes("callsign") && lowerText.includes("not found")) {
    return {
      success: false,
      message: "Callsign not registered with Club Log",
    };
  }

  if (
    lowerText.includes("not authorized") ||
    lowerText.includes("unauthorized")
  ) {
    return {
      success: false,
      message: "Not authorized for this callsign on Club Log",
    };
  }

  if (lowerText.includes("invalid adif") || lowerText.includes("parse error")) {
    return {
      success: false,
      message: "Invalid ADIF format",
    };
  }

  if (lowerText.includes("duplicate")) {
    return {
      success: true,
      recordsUploaded: 0,
      message: "Records already exist in Club Log (duplicates skipped)",
    };
  }

  // Return the error message from Club Log
  if (trimmed.length > 0 && trimmed.length < 200) {
    return {
      success: false,
      message: `Club Log error: ${trimmed}`,
    };
  }

  return {
    success: false,
    message: "Unable to parse Club Log response",
  };
}

/**
 * Normalize callsign for Club Log
 */
function normalizeCallsign(callsign: string): string {
  return callsign.trim().toUpperCase();
}

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // Only allow POST
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Parse request body
  let body: {
    adifContent?: string;
    email?: string;
    password?: string;
    callsign?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { adifContent, email, password, callsign } = body;

  // Validate required fields
  if (!adifContent || adifContent.trim().length === 0) {
    return jsonResponse({ error: "ADIF content is required" }, 400);
  }

  if (!email) {
    return jsonResponse({ error: "Club Log email is required" }, 400);
  }

  if (!password) {
    return jsonResponse({ error: "Club Log password is required" }, 400);
  }

  if (!callsign) {
    return jsonResponse({ error: "Callsign is required" }, 400);
  }

  try {
    // Build form data for Club Log
    // Club Log uses form-urlencoded format
    const params = new URLSearchParams();
    params.append("email", email);
    params.append("password", password);
    params.append("callsign", normalizeCallsign(callsign));
    params.append("file", adifContent);

    // Upload to Club Log
    const response = await fetch("https://clublog.org/putlogs.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "PropUlse/1.0 (Ham Radio Log Upload)",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      // Club Log sometimes returns 4xx/5xx with error message in body
      const errorText = await response.text();
      const result = parseClublogResponse(errorText);
      return jsonResponse(
        {
          success: false,
          error:
            result.message || `Club Log server returned ${response.status}`,
        },
        502,
      );
    }

    const text = await response.text();
    const result = parseClublogResponse(text);

    return jsonResponse(result, result.success ? 200 : 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(
      {
        success: false,
        error: `Failed to connect to Club Log: ${message}`,
      },
      502,
    );
  }
}
