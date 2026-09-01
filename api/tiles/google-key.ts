import { verifyAuth } from "../_lib/auth";
import { hasProEntitlement } from "../_lib/entitlements";
import { applyRateLimit } from "../_lib/rateLimit";

export const config = { runtime: "edge" };

function response(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * Delivers the referrer- and API-restricted browser key only to verified Pro
 * sessions. The key is never compiled into the public application bundle.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") return response("Method not allowed", 405);
  const limited = applyRateLimit(request, "tiles/google-key", 10, 60);
  if (limited) return limited;

  const authResult = await verifyAuth(request);
  if (authResult instanceof Response) return authResult;
  const entitled = await hasProEntitlement(authResult.user.id);
  if (entitled === null) return response("Unable to verify Pro entitlement", 503);
  if (!entitled) return response("Pro subscription required", 403);

  const apiKey = process.env.GOOGLE_MAP_TILES_API_KEY;
  if (!apiKey) return response("Photorealistic 3D is not configured", 503);
  return new Response(JSON.stringify({ apiKey }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
