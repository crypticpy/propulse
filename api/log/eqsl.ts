/**
 * Vercel Edge Function: eQSL Upload Proxy
 *
 * Proxies ADIF uploads to eQSL.cc to avoid CORS issues.
 * https://www.eqsl.cc/qslcard/ImportADIF.cfm
 *
 * Accepts JSON with adifContent, username, and password.
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

function textResponse(
  body: string,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      "Access-Control-Allow-Origin": getAllowedOrigin(),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...extraHeaders,
    },
  });
}

/**
 * Parse eQSL response HTML to extract result
 * eQSL returns HTML with "Records added: X" on success
 * or various error messages on failure
 */
function parseEqslResponse(html: string): {
  success: boolean;
  recordsUploaded?: number;
  message: string;
} {
  // Check for common error messages
  const lowerHtml = html.toLowerCase();

  if (
    lowerHtml.includes("invalid user") ||
    lowerHtml.includes("login failed")
  ) {
    return {
      success: false,
      message: "Invalid eQSL username or password",
    };
  }

  if (lowerHtml.includes("not found") || lowerHtml.includes("does not exist")) {
    return {
      success: false,
      message: "eQSL user account not found",
    };
  }

  if (lowerHtml.includes("error") && !lowerHtml.includes("records added")) {
    // Try to extract error message
    const errorMatch = html.match(/error[:\s]*([^<\n]+)/i);
    return {
      success: false,
      message: errorMatch ? errorMatch[1].trim() : "Unknown eQSL error",
    };
  }

  // Look for success message: "Records added: X"
  const recordsMatch = html.match(/records?\s+added[:\s]*(\d+)/i);
  if (recordsMatch) {
    const count = parseInt(recordsMatch[1], 10);
    return {
      success: true,
      recordsUploaded: count,
      message: `Successfully uploaded ${count} record${count !== 1 ? "s" : ""} to eQSL`,
    };
  }

  // Look for alternative success patterns
  if (lowerHtml.includes("success") || lowerHtml.includes("uploaded")) {
    return {
      success: true,
      message: "Upload completed successfully",
    };
  }

  // Check for duplicate/already exists messages (not really an error)
  if (lowerHtml.includes("duplicate") || lowerHtml.includes("already exist")) {
    return {
      success: true,
      recordsUploaded: 0,
      message: "Records already exist in eQSL (duplicates skipped)",
    };
  }

  // Unable to parse response
  return {
    success: false,
    message: "Unable to parse eQSL response",
  };
}

/**
 * Handle inbox download requests for eQSL.
 * Accepts POST body: { username, password, since? }
 */
async function handleInboxRequest(
  _request: Request,
  preBody: { username?: string; password?: string; since?: string },
): Promise<Response> {
  const username = preBody.username ?? null;
  const password = preBody.password ?? null;
  const since = preBody.since ?? null;

  if (!username || !password) {
    return jsonResponse(
      { error: "eQSL username and password are required" },
      400,
    );
  }

  try {
    const eqslUrl = new URL("https://www.eqsl.cc/qslcard/DownloadInBox.cfm");
    eqslUrl.searchParams.set("UserName", username);
    eqslUrl.searchParams.set("Password", password);
    if (since) {
      // eQSL expects date in MM/DD/YYYY format for RcvdSince
      eqslUrl.searchParams.set("RcvdSince", since);
    }

    const response = await fetch(eqslUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "PropUlse/1.0 (Ham Radio eQSL Inbox Check)",
      },
    });

    if (!response.ok) {
      return jsonResponse(
        {
          success: false,
          error: `eQSL server returned ${response.status}: ${response.statusText}`,
        },
        502,
      );
    }

    const adifText = await response.text();

    // Check for error responses embedded in the HTML/text
    const lowerText = adifText.toLowerCase();
    if (
      lowerText.includes("invalid user") ||
      lowerText.includes("login failed")
    ) {
      return jsonResponse(
        { success: false, error: "Invalid eQSL username or password" },
        401,
      );
    }

    // Return raw ADIF text for client-side parsing
    return textResponse(adifText, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(
      {
        success: false,
        error: `Failed to connect to eQSL: ${message}`,
      },
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
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // Only allow POST
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Parse request body once — route: upload (has adifContent) vs inbox (no adifContent)
  let body: {
    adifContent?: string;
    username?: string;
    password?: string;
    since?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // If no adifContent, treat as inbox download request
  if (!body.adifContent) {
    return handleInboxRequest(request, body);
  }

  const { adifContent, username, password } = body;

  // Validate required fields for upload
  if (adifContent.trim().length === 0) {
    return jsonResponse({ error: "ADIF content is required" }, 400);
  }

  if (!username || !password) {
    return jsonResponse(
      { error: "eQSL username and password are required" },
      400,
    );
  }

  try {
    // Build form data for eQSL
    const formData = new FormData();
    formData.append("eQSLUser", username);
    formData.append("eQSLPassword", password);
    formData.append("ADIFData", adifContent);

    // Upload to eQSL
    const response = await fetch("https://www.eqsl.cc/qslcard/ImportADIF.cfm", {
      method: "POST",
      headers: {
        "User-Agent": "PropUlse/1.0 (Ham Radio Log Upload)",
      },
      body: formData,
    });

    if (!response.ok) {
      return jsonResponse(
        {
          success: false,
          error: `eQSL server returned ${response.status}: ${response.statusText}`,
        },
        502,
      );
    }

    const html = await response.text();
    const result = parseEqslResponse(html);

    return jsonResponse(result, result.success ? 200 : 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(
      {
        success: false,
        error: `Failed to connect to eQSL: ${message}`,
      },
      502,
    );
  }
}
