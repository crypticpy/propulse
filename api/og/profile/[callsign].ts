/**
 * Vercel Edge Function: OG Image for Profile Sharing
 *
 * Dynamic route: /api/og/profile/[callsign]
 * Generates a simple SVG-based OG image (1200x630) for social media previews.
 * Returns image/svg+xml content type.
 */

import { createClient } from "@supabase/supabase-js";

export const config = {
  runtime: "edge",
};

/** Escape HTML entities in user-supplied strings */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function errorSvg(message: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0a0a0f"/>
  <text x="600" y="315" text-anchor="middle" fill="#888" font-family="monospace" font-size="24">${escapeHtml(message)}</text>
</svg>`;
}

function svgResponse(svg: string, status: number = 200): Response {
  return new Response(svg, {
    status,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Extract callsign from the URL path: /api/og/profile/[callsign]
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const callsign = pathSegments[pathSegments.length - 1]?.toUpperCase();

  if (!callsign || !/^[A-Z0-9/]{3,15}$/.test(callsign)) {
    return svgResponse(errorSvg("Invalid callsign"), 400);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let operatorName = "";
  let grid = "";
  let qsoCount = "";

  // Fetch profile data from Supabase if configured
  if (supabaseUrl && supabaseServiceKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { data: profile } = await supabase
        .from("profiles")
        .select("operator_name, grid, stats_cache")
        .eq("callsign", callsign)
        .maybeSingle();

      if (profile) {
        operatorName = profile.operator_name ?? "";
        grid = profile.grid ?? "";

        if (profile.stats_cache && typeof profile.stats_cache === "object") {
          const statsCache = profile.stats_cache as Record<string, unknown>;
          const total = statsCache.totalQSOs ?? statsCache.total_qsos;
          if (typeof total === "number") {
            qsoCount = `${total.toLocaleString()} QSOs`;
          }
        }
      }
    } catch {
      // Proceed with defaults — OG image should never fail hard
    }
  }

  // Build SVG (1200x630)
  const safeCallsign = escapeHtml(callsign);
  const safeName = escapeHtml(operatorName);
  const safeGrid = escapeHtml(grid);
  const safeQsos = escapeHtml(qsoCount);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d0d1a"/>
      <stop offset="100%" stop-color="#0a0a0f"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff6b35"/>
      <stop offset="100%" stop-color="#ff8f5e"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Top accent line -->
  <rect x="0" y="0" width="1200" height="4" fill="url(#accent)"/>

  <!-- Callsign (large, centered) -->
  <text x="600" y="${safeName ? "260" : "300"}" text-anchor="middle"
        fill="#ff6b35" font-family="monospace, 'Courier New'" font-size="96" font-weight="bold"
        letter-spacing="6">${safeCallsign}</text>

  ${
    safeName
      ? `<!-- Operator Name -->
  <text x="600" y="320" text-anchor="middle"
        fill="#c0c0d0" font-family="sans-serif, Arial" font-size="32">${safeName}</text>`
      : ""
  }

  <!-- Grid square -->
  ${
    safeGrid
      ? `<text x="600" y="${safeName ? "380" : "370"}" text-anchor="middle"
        fill="#888899" font-family="monospace, 'Courier New'" font-size="28">${safeGrid}</text>`
      : ""
  }

  <!-- QSO count -->
  ${
    safeQsos
      ? `<text x="600" y="${safeName ? "430" : "420"}" text-anchor="middle"
        fill="#666677" font-family="sans-serif, Arial" font-size="22">${safeQsos}</text>`
      : ""
  }

  <!-- Branding -->
  <text x="600" y="580" text-anchor="middle"
        fill="#444455" font-family="sans-serif, Arial" font-size="20" letter-spacing="4">PROPULSE</text>

  <!-- Subtle border -->
  <rect x="1" y="1" width="1198" height="628" fill="none" stroke="#ffffff10" stroke-width="1" rx="4"/>
</svg>`;

  return svgResponse(svg);
}
