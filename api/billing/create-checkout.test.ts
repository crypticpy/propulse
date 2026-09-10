import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_lib/rateLimit", () => ({ applyRateLimit: () => null }));

const createClientMock = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import handler from "./create-checkout";

const SERVICE_ROLE_KEY = "service-role-key";
const ANON_KEY = "anon-key";

/**
 * PostgREST runs a request made with the caller's JWT as `authenticated`, and
 * `profile_billing` (20260909140000) grants that role no write at all. This
 * fake reproduces that: a write attempted through the anon/JWT client comes
 * back as an RLS failure, exactly as the live database would answer.
 */
function makeSupabaseFakes(existingCustomerId: string | null) {
  const adminUpsert = vi.fn(async () => ({ error: null }));
  const anonUpsert = vi.fn(async () => ({
    error: { message: "new row violates row-level security policy" },
  }));
  const tables: string[] = [];

  const billingSelect = (upsert: typeof adminUpsert) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: existingCustomerId
          ? { stripe_customer_id: existingCustomerId }
          : null,
        error: null,
      })),
      upsert,
    };
    return query;
  };

  const client = (upsert: typeof adminUpsert) => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1", email: "op@example.test" } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      tables.push(table);
      return billingSelect(upsert);
    }),
  });

  createClientMock.mockImplementation((_url: string, key: string) =>
    key === SERVICE_ROLE_KEY ? client(adminUpsert) : client(anonUpsert),
  );

  return { adminUpsert, anonUpsert, tables };
}

function stubStripe() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/v1/customers")) {
      return new Response(JSON.stringify({ id: "cus_new" }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ url: "https://checkout.stripe.test/session" }),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function request(): Request {
  return new Request("https://propulse.test/api/billing/create-checkout", {
    method: "POST",
    headers: { authorization: "Bearer jwt-token" },
  });
}

beforeEach(() => {
  createClientMock.mockReset();
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.test");
  vi.stubEnv("SUPABASE_ANON_KEY", ANON_KEY);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
  vi.stubEnv("STRIPE_PRICE_ID", "price_test");
  vi.stubEnv("STRIPE_SUCCESS_URL", "https://propulse.test/ok");
  vi.stubEnv("STRIPE_CANCEL_URL", "https://propulse.test/cancel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/billing/create-checkout", () => {
  it("saves a first-time customer id through the service role, not the caller's JWT", async () => {
    const { adminUpsert, anonUpsert, tables } = makeSupabaseFakes(null);
    stubStripe();

    const response = await handler(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://checkout.stripe.test/session",
    });
    // The write that the guard trigger used to reject (#867 Codex P1).
    expect(adminUpsert).toHaveBeenCalledTimes(1);
    expect(adminUpsert).toHaveBeenCalledWith(
      { user_id: "user-1", stripe_customer_id: "cus_new" },
      { onConflict: "user_id" },
    );
    expect(anonUpsert).not.toHaveBeenCalled();
    // Billing state no longer lives on `profiles` (#867 Codex P2).
    expect(tables).not.toContain("profiles");
    expect(tables).toContain("profile_billing");
  });

  it("reuses an existing customer id without writing", async () => {
    const { adminUpsert } = makeSupabaseFakes("cus_existing");
    const fetchMock = stubStripe();

    const response = await handler(request());

    expect(response.status).toBe(200);
    expect(adminUpsert).not.toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/v1/customers"),
      ),
    ).toBe(false);
  });

  it("refuses to run without a service role key rather than 500ing mid-Stripe", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    makeSupabaseFakes(null);
    const fetchMock = stubStripe();

    const response = await handler(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Server misconfiguration",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
