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

    // Use service role key to bypass RLS
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

        const { error } = await supabase
          .from("profiles")
          .update(checkoutUpdates)
          .eq("stripe_customer_id", customerId);

        if (error) {
          console.error(
            "checkout.session.completed update failed:",
            error.message,
          );
        }
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
          const { error } = await supabase
            .from("profiles")
            .update(updates)
            .eq("stripe_customer_id", customerId);

          if (error) {
            console.error(
              "customer.subscription.updated failed:",
              error.message,
            );
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        if (!customerId) break;

        const { error } = await supabase
          .from("profiles")
          .update({
            subscription_tier: "free",
            subscription_status: "inactive",
          })
          .eq("stripe_customer_id", customerId);

        if (error) {
          console.error("customer.subscription.deleted failed:", error.message);
        }
        break;
      }

      case "invoice.payment_failed": {
        if (!customerId) break;

        const { error } = await supabase
          .from("profiles")
          .update({
            subscription_status: "past_due",
          })
          .eq("stripe_customer_id", customerId);

        if (error) {
          console.error("invoice.payment_failed update failed:", error.message);
        }
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
