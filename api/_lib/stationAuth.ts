/** Future station persistence boundary. This intentionally does not share the
 * optional local-development bypass in auth.ts. No endpoint is enabled here. */
import { createClient, isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { z } from "zod";

export interface StationVerifiedOwner { readonly ownerId: string }
const ownerSchema = z.string().uuid();

function failure(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Verify with Supabase, never decode a JWT locally as proof of its identity.
 * The returned owner comes only from getUser; request bodies and claimed IDs
 * provide no authority. Endpoint/domain authorization remains a separate step. */
export async function verifyStationOwner(request: Request): Promise<StationVerifiedOwner | Response> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url?.trim() || !key?.trim()) return failure(500, "Station authentication is not configured");

  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer ([^\s,]+)$/i);
  if (!bearer) return failure(401, "Missing or invalid authorization header");

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.getUser(bearer[1]);
    // The SDK only uses its retryable class for network/502–504 failures;
    // other 5xx responses and invalid upstream JSON use different error classes.
    const status = error?.status;
    if (isAuthRetryableFetchError(error)
      || (typeof status === "number" && status >= 500 && status < 600)
      || (isAuthError(error) && error.name === "AuthUnknownError")) {
      return failure(503, "Station authentication is unavailable");
    }
    const owner = ownerSchema.safeParse(data?.user?.id);
    if (error || !owner.success) return failure(401, "Unauthorized");
    return Object.freeze({ ownerId: owner.data });
  } catch {
    // Never disclose credentials, tokens or upstream exception text.
    return failure(503, "Station authentication is unavailable");
  }
}
