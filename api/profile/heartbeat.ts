/**
 * Vercel Edge Function: Profile Heartbeat
 *
 * Updates `last_active_at` on the user's profile row.
 * Called periodically by the client to indicate the user is active.
 */

import { createClient } from "@supabase/supabase-js";

export const config = {
  runtime: "edge",
};

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

/** Reject browser requests from unauthorized origins */
function validateOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (origin && origin !== getAllowedOrigin()) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": getAllowedOrigin(),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return jsonResponse({}, 204);
  }

  const originError = validateOrigin(request);
  if (originError) return originError;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Extract Authorization header (Supabase JWT)
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(
      { error: "Missing or invalid authorization header" },
      401,
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  try {
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Verify the user's JWT
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Update last_active_at
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", user.id);

    if (updateError) {
      return jsonResponse(
        { error: `Failed to update heartbeat: ${updateError.message}` },
        500,
      );
    }

    return jsonResponse({ ok: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: `Heartbeat failed: ${message}` }, 500);
  }
}
