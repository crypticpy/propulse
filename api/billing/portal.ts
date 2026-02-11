/**
 * Vercel Edge Function: Create Stripe Customer Portal Session
 *
 * Creates a Stripe Customer Portal session so users can manage
 * their subscription (cancel, update payment method, view invoices).
 * Auth-gated via Supabase JWT.
 */

import { createClient } from "@supabase/supabase-js";
import { applyRateLimit } from "../_lib/rateLimit";

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
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
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

  // Rate limit: 5 requests per 60 seconds
  const limited = applyRateLimit(request, "billing/portal", 5, 60);
  if (limited) return limited;

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
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !stripeSecretKey) {
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

    // Look up existing Stripe customer ID
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return jsonResponse(
        { error: `Failed to fetch profile: ${profileError.message}` },
        500,
      );
    }

    if (!profile?.stripe_customer_id) {
      return jsonResponse(
        { error: "No billing account found. Please subscribe first." },
        400,
      );
    }

    // Create Stripe Customer Portal session
    const returnUrl =
      process.env.STRIPE_PORTAL_RETURN_URL || getAllowedOrigin();

    const portalRes = await fetch(
      "https://api.stripe.com/v1/billing_portal/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          customer: profile.stripe_customer_id,
          return_url: returnUrl,
        }),
      },
    );

    if (!portalRes.ok) {
      const err = await portalRes.text();
      return jsonResponse(
        { error: `Failed to create portal session: ${err}` },
        500,
      );
    }

    const session = (await portalRes.json()) as { url: string };
    return jsonResponse({ url: session.url }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(
      { error: `Portal session creation failed: ${message}` },
      500,
    );
  }
}
