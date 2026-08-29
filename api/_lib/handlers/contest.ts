/**
 * SCP Download Proxy - Vercel Edge Function
 *
 * Proxies downloads of MASTER.SCP from supercheckpartial.com
 * to avoid CORS issues in the browser.
 *
 * GET /api/contest/scp -> returns MASTER.SCP text file content
 *
 * Caching: 24-hour CDN cache (s-maxage), 1-hour browser cache (max-age)
 * The MASTER.SCP file is updated infrequently (weekly at most).
 */

import { applyRateLimit } from "../rateLimit";

/** Source URL for MASTER.SCP */
const MASTER_SCP_URL = "https://www.supercheckpartial.com/MASTER.SCP";

/**
 * Get the allowed CORS origin based on environment
 */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

export async function handleContestScp(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
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

  const limited = applyRateLimit(req, "contest/scp", 10, 60);
  if (limited) return limited;

  // Only allow GET requests
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
      },
    });
  }

  try {
    const response = await fetch(MASTER_SCP_URL, {
      headers: {
        "User-Agent": "Propulse/1.0 (Ham Radio Contest Logger)",
        Accept: "text/plain",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: "Failed to fetch MASTER.SCP",
          status: response.status,
        }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": getAllowedOrigin(),
          },
        },
      );
    }

    const content = await response.text();

    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        // CDN caches for 24 hours, browser caches for 1 hour
        "Cache-Control": "public, s-maxage=86400, max-age=3600",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
      },
    });
  } catch (error) {
    console.error("SCP proxy error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error fetching MASTER.SCP" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": getAllowedOrigin(),
        },
      },
    );
  }
}
