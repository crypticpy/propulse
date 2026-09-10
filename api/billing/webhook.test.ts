import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import handler from "./webhook";

const WEBHOOK_SECRET = "whsec_test";

/**
 * Sign a payload exactly as `verifyStripeSignature` in webhook.ts expects, so
 * these tests exercise the real handler rather than a stub of it.
 */
async function signPayload(
  payload: string,
  secret: string,
  timestamp: number,
): Promise<string> {
  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload),
  );
  return Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function makeRequest(event: unknown): Promise<Request> {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await signPayload(payload, WEBHOOK_SECRET, timestamp);
  return new Request("https://propulse.test/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
    body: payload,
  });
}

/**
 * Fake the `profile_billing` update chain used by every event branch:
 * `.from("profile_billing").update(values, { count: "exact" }).eq(...)`.
 */
function stubBillingUpdate(result: {
  error: { message: string } | null;
  count: number | null;
}) {
  const update = vi.fn(() => ({
    eq: vi.fn(async () => result),
  }));
  createClientMock.mockImplementation(() => ({
    from: vi.fn(() => ({ update })),
  }));
  return update;
}

const checkoutCompletedEvent = {
  type: "checkout.session.completed",
  data: { object: { customer: "cus_1", current_period_end: 1893456000 } },
};

beforeEach(() => {
  createClientMock.mockReset();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/billing/webhook", () => {
  it("returns a non-200 when the billing update errors, so Stripe retries", async () => {
    stubBillingUpdate({ error: { message: "connection reset" }, count: null });

    const response = await handler(await makeRequest(checkoutCompletedEvent));

    expect(response.status).not.toBe(200);
    expect(response.status).toBe(500);
  });

  it("returns a non-200 when the update matches zero rows (customer created outside create-checkout)", async () => {
    stubBillingUpdate({ error: null, count: 0 });

    const response = await handler(await makeRequest(checkoutCompletedEvent));

    expect(response.status).not.toBe(200);
    expect(response.status).toBe(500);
  });

  it("returns 200 when the billing update succeeds", async () => {
    const update = stubBillingUpdate({ error: null, count: 1 });

    const response = await handler(await makeRequest(checkoutCompletedEvent));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(update).toHaveBeenCalledWith(
      {
        subscription_tier: "pro",
        subscription_status: "active",
        subscription_period_end: expect.any(String),
      },
      { count: "exact" },
    );
  });
});
