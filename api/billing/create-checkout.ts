/**
 * Vercel Edge Function: Create Stripe Checkout Session
 *
 * Creates a Stripe Checkout session for upgrading to Pro ($6.99/mo).
 * Auth-gated via Supabase JWT. Creates a Stripe customer if none exists.
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
  const limited = applyRateLimit(request, "billing/create-checkout", 5, 60);
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
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripePriceId = process.env.STRIPE_PRICE_ID;
  const stripeSuccessUrl = process.env.STRIPE_SUCCESS_URL;
  const stripeCancelUrl = process.env.STRIPE_CANCEL_URL;

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    !supabaseServiceRoleKey ||
    !stripeSecretKey ||
    !stripePriceId ||
    !stripeSuccessUrl ||
    !stripeCancelUrl
  ) {
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  try {
    const token = authHeader.replace("Bearer ", "");
    // The caller's JWT identifies who is checking out, and nothing else. Every
    // read and write of `profile_billing` goes through the service role: that
    // table grants no write to `authenticated` at all (20260909140000), which
    // is the point — a client must never be able to move its own tier.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify the user's JWT
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Look up existing Stripe customer ID. A first-time subscriber has no
    // billing row yet, so this must tolerate an absent row rather than 500.
    const { data: billing, error: billingError } = await supabaseAdmin
      .from("profile_billing")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (billingError) {
      return jsonResponse(
        { error: `Failed to fetch billing record: ${billingError.message}` },
        500,
      );
    }

    let stripeCustomerId: string = billing?.stripe_customer_id || "";

    // If no Stripe customer, create one
    if (!stripeCustomerId) {
      const customerRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          email: user.email || "",
          "metadata[supabase_user_id]": user.id,
        }),
      });

      if (!customerRes.ok) {
        const err = await customerRes.text();
        return jsonResponse(
          { error: `Failed to create Stripe customer: ${err}` },
          500,
        );
      }

      const customer = (await customerRes.json()) as { id: string };
      stripeCustomerId = customer.id;

      // Save stripe_customer_id back. Upsert, not update: the row does not
      // exist until the first checkout.
      const { error: updateError } = await supabaseAdmin
        .from("profile_billing")
        .upsert(
          { user_id: user.id, stripe_customer_id: stripeCustomerId },
          { onConflict: "user_id" },
        );

      if (updateError) {
        return jsonResponse(
          { error: `Failed to save customer ID: ${updateError.message}` },
          500,
        );
      }
    }

    // Create Checkout Session
    const sessionRes = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          customer: stripeCustomerId,
          mode: "subscription",
          "line_items[0][price]": stripePriceId,
          "line_items[0][quantity]": "1",
          success_url: stripeSuccessUrl,
          cancel_url: stripeCancelUrl,
        }),
      },
    );

    if (!sessionRes.ok) {
      const err = await sessionRes.text();
      return jsonResponse(
        { error: `Failed to create checkout session: ${err}` },
        500,
      );
    }

    const session = (await sessionRes.json()) as { url: string };
    return jsonResponse({ url: session.url }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: `Checkout creation failed: ${message}` }, 500);
  }
}
