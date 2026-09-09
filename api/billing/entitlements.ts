/**
 * Vercel Edge Function: `sync` entitlement reader (#698).
 *
 * `useSyncEntitlement` (src/hooks/useSyncEntitlement.ts) gates the account
 * transport — cross-device operating state,
 * src/lib/workspace/operatingChannel.ts `createAccountTransport` — on this
 * endpoint. The client has no entitlement of its own to check:
 * `profileStore.subscriptionTier` is a synced *copy* of server state, not a
 * source of truth a security-relevant gate can use, so this asks the server
 * on every read instead.
 */
import { applyRateLimit } from "../_lib/rateLimit";
import { verifyAuth } from "../_lib/auth";
import { hasProEntitlement } from "../_lib/entitlements";

export const config = {
  runtime: "edge",
};

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== "GET") {
    return jsonError("Method not allowed", 405);
  }

  const limited = applyRateLimit(request, "billing/entitlements", 60, 60);
  if (limited) return limited;

  const authResult = await verifyAuth(request);
  if (authResult instanceof Response) return authResult;

  // Cross-device sync is gated on the same paid tier as Pro imagery today —
  // there is only one paid tier (`profiles.subscription_tier === "pro"`). If
  // a distinct `sync` add-on ships later, this is the one place to split it.
  const entitled = await hasProEntitlement(authResult.user.id);
  if (entitled === null) {
    return jsonError("Unable to verify entitlement", 503);
  }

  return new Response(JSON.stringify({ sync: entitled }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Private: the answer differs per user and must never be shared-cached.
      "Cache-Control": "private, max-age=60",
      Vary: "Authorization",
      ...corsHeaders(),
    },
  });
}
