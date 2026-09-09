import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyAuthMock = vi.fn();
const hasProEntitlementMock = vi.fn();

vi.mock("../_lib/auth", () => ({
  verifyAuth: (...args: unknown[]) => verifyAuthMock(...args),
}));
vi.mock("../_lib/entitlements", () => ({
  hasProEntitlement: (...args: unknown[]) => hasProEntitlementMock(...args),
}));

import handler from "./entitlements";

function request(init: RequestInit = {}): Request {
  return new Request("https://propulse.test/api/billing/entitlements", init);
}

beforeEach(() => {
  verifyAuthMock.mockReset();
  hasProEntitlementMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/billing/entitlements", () => {
  it("returns 401 without a valid Supabase JWT, and never calls the entitlement lookup", async () => {
    verifyAuthMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );

    const response = await handler(request());

    expect(response.status).toBe(401);
    expect(hasProEntitlementMock).not.toHaveBeenCalled();
  });

  it("returns { sync: true } for an entitled, authenticated user", async () => {
    verifyAuthMock.mockResolvedValue({ user: { id: "user-1" } });
    hasProEntitlementMock.mockResolvedValue(true);

    const response = await handler(
      request({ headers: { Authorization: "Bearer token" } }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sync: true });
    expect(hasProEntitlementMock).toHaveBeenCalledWith("user-1");
  });

  it("returns { sync: false } for an authenticated user without the entitlement", async () => {
    verifyAuthMock.mockResolvedValue({ user: { id: "user-2" } });
    hasProEntitlementMock.mockResolvedValue(false);

    const response = await handler(
      request({ headers: { Authorization: "Bearer token" } }),
    );

    await expect(response.json()).resolves.toEqual({ sync: false });
  });

  it("fails closed with 503 when the entitlement service is unavailable", async () => {
    verifyAuthMock.mockResolvedValue({ user: { id: "user-3" } });
    hasProEntitlementMock.mockResolvedValue(null);

    const response = await handler(
      request({ headers: { Authorization: "Bearer token" } }),
    );

    expect(response.status).toBe(503);
  });

  it("rejects non-GET methods before touching auth or entitlements", async () => {
    const response = await handler(request({ method: "POST" }));

    expect(response.status).toBe(405);
    expect(verifyAuthMock).not.toHaveBeenCalled();
  });

  it("rejects a request from an unauthorized origin before touching auth or entitlements", async () => {
    const response = await handler(
      request({ headers: { origin: "https://evil.example.com" } }),
    );

    expect(response.status).toBe(403);
    expect(verifyAuthMock).not.toHaveBeenCalled();
    expect(hasProEntitlementMock).not.toHaveBeenCalled();
  });

  it("allows a request with no origin header (non-browser clients, e.g. curl or a mobile client)", async () => {
    verifyAuthMock.mockResolvedValue({ user: { id: "user-4" } });
    hasProEntitlementMock.mockResolvedValue(true);

    const response = await handler(request());

    expect(response.status).toBe(200);
  });
});
