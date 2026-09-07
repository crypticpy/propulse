import { afterEach, expect, it, vi } from "vitest";
import { sharedPskStationCache } from "./pskStationCache";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function configure() { vi.stubEnv("SUPABASE_URL", "https://store.example/"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-key"); }
const token = "12345678-1234-1234-1234-123456789012";

it("fails closed without shared cache credentials instead of making any provider request", async () => {
  vi.stubEnv("SUPABASE_URL", ""); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(sharedPskStationCache.claim("N0TEST")).rejects.toThrow("not configured");
  expect(fetcher).not.toHaveBeenCalled();
});
it("uses only the fixed authenticated RPC and validates its lease response", async () => {
  configure();
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ token, snapshot: null, retryAt: 12345 })));
  vi.stubGlobal("fetch", fetcher);
  expect(await sharedPskStationCache.claim("N0TEST")).toEqual({ token, snapshot: null, retryAt: 12345 });
  expect(fetcher).toHaveBeenCalledWith("https://store.example/rest/v1/rpc/psk_station_claim", expect.objectContaining({
    method: "POST", body: JSON.stringify({ p_callsign: "N0TEST" }), redirect: "error",
    headers: { apikey: "fixture-key", Authorization: "Bearer fixture-key", "Content-Type": "application/json" },
  }));
});
it.each([
  { token: "bad", snapshot: null, retryAt: 12345 },
  { token: null, snapshot: { callsign: "W1AW" }, retryAt: 12345 },
  { token: null, snapshot: null, retryAt: "tomorrow" },
])("rejects malformed shared responses", async value => {
  configure(); vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(value))));
  await expect(sharedPskStationCache.claim("N0TEST")).rejects.toThrow();
});
it("rejects oversized RPC bodies and unsuccessful HTTP responses", async () => {
  configure(); vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("x".repeat(512 * 1024 + 1))).mockResolvedValueOnce(new Response("failure", { status: 500 })));
  await expect(sharedPskStationCache.claim("N0TEST")).rejects.toThrow();
  await expect(sharedPskStationCache.claim("N0TEST")).rejects.toThrow();
});
