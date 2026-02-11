/**
 * PSKReporter API Proxy - Vercel Edge Function
 *
 * Proxies requests to PSKReporter.info to avoid CORS issues
 * Parses XML response and transforms to unified spot JSON format
 */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

/**
 * Get the allowed CORS origin based on environment
 * Never returns wildcard "*" to prevent security issues
 */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

// Maidenhead grid locator regex: 2-8 alphanumeric characters
// Format: AA00 or AA00aa or AA00aa00
const GRID_REGEX = /^[A-Ra-r]{2}[0-9]{2}([A-Xa-x]{2}([0-9]{2})?)?$/;

/**
 * Extract an XML attribute value by name from an element string.
 * Uses regex since no DOM parser is available in Edge Functions.
 */
function getAttr(element: string, name: string): string | undefined {
  // Match both single and double quoted attribute values
  const regex = new RegExp(`${name}=["']([^"']*)["']`);
  const match = element.match(regex);
  return match ? match[1] : undefined;
}

/**
 * Parse receptionReport elements from PSKReporter XML response.
 *
 * Expected XML format:
 * <receptionReports>
 *   <receptionReport receiverCallsign="W1LP" receiverLocator="EL86XN"
 *     senderCallsign="N9WD" senderLocator="EN51XU" frequency="14074585"
 *     flowStartSeconds="1770307487" mode="FT8" sNR="-9" />
 * </receptionReports>
 */
function parseReceptionReports(xml: string): Array<{
  senderCallsign: string;
  senderLocator?: string;
  receiverCallsign: string;
  receiverLocator?: string;
  frequency: number;
  flowStartSeconds: number;
  mode: string;
  sNR?: number;
}> {
  const reports: Array<{
    senderCallsign: string;
    senderLocator?: string;
    receiverCallsign: string;
    receiverLocator?: string;
    frequency: number;
    flowStartSeconds: number;
    mode: string;
    sNR?: number;
  }> = [];

  // Match all <receptionReport ... /> or <receptionReport ...>...</receptionReport> elements
  const elementRegex = /<receptionReport\s+([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = elementRegex.exec(xml)) !== null) {
    const attrs = match[0];

    const senderCallsign = getAttr(attrs, "senderCallsign");
    const receiverCallsign = getAttr(attrs, "receiverCallsign");
    const frequencyStr = getAttr(attrs, "frequency");
    const flowStartStr = getAttr(attrs, "flowStartSeconds");

    // Skip if required fields are missing
    if (!senderCallsign || !receiverCallsign || !frequencyStr) {
      continue;
    }

    const frequency = parseInt(frequencyStr, 10);
    const flowStartSeconds = parseInt(flowStartStr || "0", 10);

    if (isNaN(frequency)) continue;

    const sNRStr = getAttr(attrs, "sNR");
    const sNR =
      sNRStr !== undefined && sNRStr !== "" ? parseInt(sNRStr, 10) : undefined;

    reports.push({
      senderCallsign,
      senderLocator: getAttr(attrs, "senderLocator"),
      receiverCallsign,
      receiverLocator: getAttr(attrs, "receiverLocator"),
      frequency,
      flowStartSeconds: isNaN(flowStartSeconds) ? 0 : flowStartSeconds,
      mode: getAttr(attrs, "mode") || "FT8",
      sNR: sNR !== undefined && !isNaN(sNR) ? sNR : undefined,
    });
  }

  return reports;
}

export default async function handler(req: Request) {
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

  const limited = applyRateLimit(req, "spots/pskreporter", 10, 60);
  if (limited) return limited;

  const url = new URL(req.url);

  // Validate and clamp limit (1-200)
  const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), 200);

  // Validate grid format if provided (Maidenhead: 2-8 alphanumeric)
  const grid = url.searchParams.get("grid") || "";
  if (grid && !GRID_REGEX.test(grid)) {
    return new Response(
      JSON.stringify({ error: "Invalid grid format", spots: [] }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getAllowedOrigin(),
        },
      },
    );
  }

  // Mode is passed through but should be alphanumeric only
  const mode = url.searchParams.get("mode") || "";
  if (mode && !/^[A-Za-z0-9]+$/.test(mode)) {
    return new Response(
      JSON.stringify({ error: "Invalid mode format", spots: [] }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": getAllowedOrigin(),
        },
      },
    );
  }

  try {
    // PSKReporter API query parameters
    const params = new URLSearchParams();
    params.set("flowStartSeconds", "-900"); // Last 15 minutes
    params.set("rronly", "1"); // Receiver reports only
    params.set("noactive", "1"); // No active check
    if (grid) {
      // Query by receiver locator (4 char grid)
      params.set("receiverLocator", grid.substring(0, 4));
    }
    if (mode) {
      params.set("mode", mode);
    }

    const apiUrl = `https://retrieve.pskreporter.info/query?${params}`;

    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Propulse/1.0 (Ham Radio Toolset)",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "PSKReporter API error", spots: [] }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60",
            "Access-Control-Allow-Origin": getAllowedOrigin(),
          },
        },
      );
    }

    const text = await response.text();

    // PSKReporter always returns XML - parse receptionReport elements
    const reports = parseReceptionReports(text);

    // Transform to unified spot format
    const spots = reports.slice(0, limit).map((report) => ({
      senderCallsign: report.senderCallsign,
      senderLocator: report.senderLocator,
      receiverCallsign: report.receiverCallsign,
      receiverLocator: report.receiverLocator,
      frequency: report.frequency,
      flowStartSeconds: report.flowStartSeconds,
      mode: report.mode,
      sNR: report.sNR,
    }));

    return new Response(JSON.stringify({ spots }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=60, stale-while-revalidate=30",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
      },
    });
  } catch (error) {
    console.error("PSKReporter proxy error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", spots: [] }),
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
