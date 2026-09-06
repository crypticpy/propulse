import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyStationOwner } from "./stationAuth";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
const ownerId = "4d6c508d-c5ab-4a43-a307-26f4f13181be";
const token = "untrusted.payload.signature";
const request = (authorization = `Bearer ${token}`) => new Request("https://example.invalid/api/station", {
  method: "POST", headers: { authorization }, body: JSON.stringify({ ownerId: "attacker-supplied-owner" }),
});

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://station-test.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
  mocks.createClient.mockReset().mockReturnValue({ auth: { getUser: mocks.getUser } });
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: ownerId } }, error: null });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in station auth tests"); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function expectFailure(response: Awaited<ReturnType<typeof verifyStationOwner>>, status: number) {
  expect(response).toBeInstanceOf(Response);
  if (!(response instanceof Response)) throw new Error("Expected failed authentication");
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toBe("application/json");
  return response.json();
}

describe("station verified owner boundary", () => {
  it("returns only the verified UUID owner and disables ambient session persistence", async () => {
    const result = await verifyStationOwner(request());
    expect(result).toEqual({ ownerId });
    expect(Object.isFrozen(result)).toBe(true);
    expect(mocks.createClient).toHaveBeenCalledWith("https://station-test.supabase.co", "test-anon-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith(token);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["SUPABASE_URL", "SUPABASE_ANON_KEY"])("fails closed without %s even when client config or a local-dev identity exists", async (field) => {
    vi.stubEnv(field, "");
    vi.stubEnv("VITE_SUPABASE_URL", "https://client-test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "client-key");
    mocks.getUser.mockResolvedValue({ data: { user: { id: "local-dev" } }, error: null });
    await expectFailure(await verifyStationOwner(request()), 500);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("treats whitespace-only configuration as missing", async () => {
    vi.stubEnv("SUPABASE_ANON_KEY", "  \t");
    await expectFailure(await verifyStationOwner(request()), 500);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it.each(["", "Bearer", "Bearer ", "Basic token", "Bearer  token", "Bearer a b", "Bearer token, Bearer other"])("rejects malformed bearer header %j without verifying another credential", async (header) => {
    await expectFailure(await verifyStationOwner(request(header)), 401);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("rejects a missing header and accepts a case-insensitive bearer scheme", async () => {
    await expectFailure(await verifyStationOwner(new Request("https://example.invalid")), 401);
    expect(await verifyStationOwner(request(`bEaReR ${token}`))).toEqual({ ownerId });
  });

  it.each(["local-dev", "not-a-uuid", "", ` ${ownerId}`, `${ownerId} `, null, undefined])("rejects an unverified or non-UUID owner %j", async (id) => {
    mocks.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
    await expectFailure(await verifyStationOwner(request()), 401);
  });

  it("rejects verification errors even when a user is also returned", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: ownerId } }, error: { message: `Secret ${token}` } });
    const body = await expectFailure(await verifyStationOwner(request()), 401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("rejects a missing verified user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expectFailure(await verifyStationOwner(request()), 401);
  });

  it.each(["client", "verification"])("fails closed when %s throws without exposing upstream details", async (stage) => {
    const secret = `private detail ${token}`;
    if (stage === "client") mocks.createClient.mockImplementation(() => { throw new Error(secret); });
    else mocks.getUser.mockRejectedValue(new Error(secret));
    const body = await expectFailure(await verifyStationOwner(request()), 503);
    expect(body).toEqual({ error: "Station authentication is unavailable" });
  });
});
