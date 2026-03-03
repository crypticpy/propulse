/**
 * Shared JWT authentication helper for Vercel Edge Functions.
 *
 * Verifies a Supabase JWT from the Authorization header.
 * Returns an AuthResult on success, or a 401/500 Response on failure.
 *
 * Usage:
 * ```ts
 * import { verifyAuth } from "../_lib/auth";
 *
 * const authResult = await verifyAuth(request);
 * if (authResult instanceof Response) return authResult;
 * // authResult.user.id is available
 * ```
 */

import { createClient } from "@supabase/supabase-js";

export interface AuthResult {
  user: { id: string; email?: string };
}

/**
 * Verify the Bearer JWT on a request using Supabase auth.
 *
 * @returns AuthResult when valid, or a JSON Response (401/500) on failure.
 */
export async function verifyAuth(
  request: Request,
): Promise<AuthResult | Response> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  // Local dev bypass: no Supabase configured, allow through
  if (!supabaseUrl || !supabaseAnonKey) {
    return { user: { id: "local-dev", email: undefined } };
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid authorization header" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return { user: { id: user.id, email: user.email ?? undefined } };
}
