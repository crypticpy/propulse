/**
 * Vercel Edge Function: Stripe Webhook Handler
 *
 * Handles Stripe webhook events for subscription lifecycle management.
 * Not auth-gated — Stripe sends events server-to-server.
 * Verifies Stripe signature using Web Crypto API (Edge-compatible).
 */

import { createClient } from "@supabase/supabase-js";

export const config = {
  runtime: "edge",
};

// ─── Stripe Signature Verification ──────────────────────────────────────────

/**
 * Verify the Stripe webhook signature using HMAC-SHA256 via Web Crypto API.
 * Returns true if the signature is valid.
 */
async function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  // Parse the signature header: "t=<timestamp>,v1=<sig>,..."
  const parts = signatureHeader.split(",");
  const timestampStr = parts.find((p) => p.startsWith("t="))?.replace("t=", "");
  const signature = parts.find((p) => p.startsWith("v1="))?.replace("v1=", "");

  if (!timestampStr || !signature) return false;

  // Reject signatures older than 5 minutes to prevent replay attacks
  const timestamp = parseInt(timestampStr, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) return false;

  // Compute the expected signature
  const signedPayload = `${timestampStr}.${payload}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signedPayload),
  );

  // Convert to hex string
  const computedSignature = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Timing-safe comparison (constant-time for equal-length strings)
  if (computedSignature.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computedSignature.length; i++) {
    mismatch |= computedSignature.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface StripeEvent {
  type: string;
  data: {
    object: {
      customer?: string;
      status?: string;
      current_period_end?: number;
    };
  };
}

// ─── Billing writes ─────────────────────────────────────────────────────────

function billingErrorResponse(eventType: string, detail: string): Response {
  return new Response(
    JSON.stringify({ error: `${eventType} billing update failed: ${detail}` }),
    { status: 500, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Apply a billing update by Stripe customer id and fail loudly.
 *
 * Logging an error and still returning 200 tells Stripe to stop retrying, so
 * a write lost to the async PostgREST schema-cache reload this table
 * introduces (or any other transient failure) would leave the customer on
 * their old tier forever. `.update().eq(...)` also returns no error when it
 * matches zero rows (e.g. a `stripe_customer_id` created outside
 * create-checkout), so request an exact count and treat zero as a failure
 * too. Returns a Response to send immediately on failure, or null to
 * continue processing.
 */
async function applyBillingUpdate(
  supabase: ReturnType<typeof createClient>,
  eventType: string,
  customerId: string,
  updates: Record<string, string>,
): Promise<Response | null> {
  const { error, count } = await supabase
    .from("profile_billing")
    .update(updates, { count: "exact" })
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error(`${eventType} update failed:`, error.message);
    return billingErrorResponse(eventType, error.message);
  }

  if (count === 0) {
    console.error(
      `${eventType}: no profile_billing row for stripe_customer_id`,
      customerId,
    );
    return billingErrorResponse(eventType, "no matching billing row");
  }

  return null;
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeWebhookSecret || !supabaseUrl || !supabaseServiceRoleKey) {
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.text();
    const signatureHeader = request.headers.get("stripe-signature");

    if (!signatureHeader) {
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Verify the Stripe webhook signature
    const isValid = await verifyStripeSignature(
      body,
      signatureHeader,
      stripeWebhookSecret,
    );

    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(body) as StripeEvent;

    // Use service role key to bypass RLS. `profile_billing` (20260909140000)
    // grants writes to nobody else, so this is the only path that moves a tier.
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const customerId = event.data.object.customer;

    switch (event.type) {
      case "checkout.session.completed": {
        if (!customerId) break;

        const checkoutUpdates: Record<string, string> = {
          subscription_tier: "pro",
          subscription_status: "active",
        };
        if (event.data.object.current_period_end) {
          checkoutUpdates.subscription_period_end = new Date(
            event.data.object.current_period_end * 1000,
          ).toISOString();
        }

        const failure = await applyBillingUpdate(
          supabase,
          "checkout.session.completed",
          customerId,
          checkoutUpdates,
        );
        if (failure) return failure;
        break;
      }

      case "customer.subscription.updated": {
        if (!customerId) break;

        const subscription = event.data.object;
        const updates: Record<string, string> = {};

        if (subscription.status) {
          updates.subscription_status = subscription.status;
        }
        if (subscription.current_period_end) {
          updates.subscription_period_end = new Date(
            subscription.current_period_end * 1000,
          ).toISOString();
        }

        if (Object.keys(updates).length > 0) {
          const failure = await applyBillingUpdate(
            supabase,
            "customer.subscription.updated",
            customerId,
            updates,
          );
          if (failure) return failure;
        }
        break;
      }

      case "customer.subscription.deleted": {
        if (!customerId) break;

        const failure = await applyBillingUpdate(
          supabase,
          "customer.subscription.deleted",
          customerId,
          { subscription_tier: "free", subscription_status: "inactive" },
        );
        if (failure) return failure;
        break;
      }

      case "invoice.payment_failed": {
        if (!customerId) break;

        const failure = await applyBillingUpdate(
          supabase,
          "invoice.payment_failed",
          customerId,
          { subscription_status: "past_due" },
        );
        if (failure) return failure;
        break;
      }

      default:
        // Unhandled event type — return 200 to prevent Stripe retries
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Webhook processing error:", message);
    return new Response(
      JSON.stringify({ error: `Webhook handler failed: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
