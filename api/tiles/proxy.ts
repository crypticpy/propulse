/**
 * Vercel Edge Function: Tile Proxy
 * Proxies satellite tile requests to Mapbox/ESRI for authenticated users.
 */
import { applyRateLimit } from "../_lib/rateLimit";
import { verifyAuth } from "../_lib/auth";

export const config = {
  runtime: "edge",
};

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": getAllowedOrigin(),
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function buildUpstreamUrl(
  provider: string,
  z: number,
  x: number,
  y: number,
): string | null {
  if (provider === "mapbox") {
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) return null;
    return `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}@2x.jpg?access_token=${token}`;
  }
  if (provider === "esri") {
    // ESRI uses z/y/x order
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  }
  return null;
}

export default async function handler(request: Request): Promise<Response> {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "GET") {
    return jsonError("Method not allowed", 405);
  }

  // Rate limit: 200 tiles/min to accommodate bursty map interactions
  const limited = applyRateLimit(request, "tiles/proxy", 200, 60);
  if (limited) return limited;

  // Auth: requires a valid Supabase JWT
  const authResult = await verifyAuth(request);
  if (authResult instanceof Response) return authResult;

  // Currently auth alone is sufficient since the client only exposes the proxy
  // URL to Pro-tier subscribers. Phase 3+: query profiles.subscription_tier
  // for server-side tier enforcement so free users cannot call this directly.

  // Parse and validate query params
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  const zStr = url.searchParams.get("z");
  const xStr = url.searchParams.get("x");
  const yStr = url.searchParams.get("y");

  if (!provider || !zStr || !xStr || !yStr) {
    return jsonError("Missing required parameters: provider, z, x, y", 400);
  }

  if (provider !== "mapbox" && provider !== "esri") {
    return jsonError('Invalid provider. Must be "mapbox" or "esri"', 400);
  }

  const z = parseInt(zStr, 10);
  const x = parseInt(xStr, 10);
  const y = parseInt(yStr, 10);

  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
    return jsonError("Parameters z, x, y must be integers", 400);
  }

  // Validate coordinate ranges to prevent abuse
  if (z < 0 || z > 22) {
    return jsonError("Zoom level z must be between 0 and 22", 400);
  }
  const maxTile = (1 << z) - 1;
  if (x < 0 || x > maxTile || y < 0 || y > maxTile) {
    return jsonError(`Tile coordinates out of range for zoom ${z}`, 400);
  }

  const upstreamUrl = buildUpstreamUrl(provider, z, x, y);
  if (!upstreamUrl) {
    return jsonError("Tile provider is not configured", 502);
  }

  // Fetch tile from upstream provider
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl);
  } catch {
    return jsonError("Upstream tile fetch failed", 502);
  }

  if (!upstream.ok) {
    return jsonError(`Upstream returned ${upstream.status}`, 502);
  }

  const tileBody = await upstream.arrayBuffer();
  const contentType = upstream.headers.get("Content-Type") || "image/jpeg";

  return new Response(tileBody, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      ...CORS_HEADERS,
    },
  });
}
