import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPskStationHandler, parsePskStationXml } from "./pskStation";
import { sharedPskStationCache } from "../pskStationCache.js";
import { applyRateLimit } from "../rateLimit.js";
import { canonicalPskCallsign } from "../../../src/lib/hamclock/pskStation";

vi.mock("../rateLimit.js", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("../pskStationCache.js", () => ({ sharedPskStationCache: { claim: vi.fn(), finish: vi.fn() } }));
const NOW = Date.parse("2026-09-06T12:00:00Z");
const seconds = NOW / 1_000;
function report(attrs = "") {
  return `<receptionReport senderCallsign="N0TEST" receiverCallsign="W1AW" frequency="14074125" flowStartSeconds="${seconds - 60}" mode="FT8" senderLocator="em38ab" receiverLocator="FN31" sNR="-12" ${attrs}/>`;
}
const xml = (...rows: string[]) => `<receptionReports>${rows.join("")}</receptionReports>`;
const request = (call = "N0TEST") => new Request(`https://local/api/spots/psk-station?callsign=${encodeURIComponent(call)}`);

beforeEach(() => { vi.mocked(applyRateLimit).mockClear(); vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.mocked(sharedPskStationCache.claim).mockReset().mockImplementation(async () => ({ token: "lease", snapshot: null, retryAt: Date.now() + 310_000 }));
  vi.mocked(sharedPskStationCache.finish).mockReset().mockImplementation(async (_call, _token, snapshot) => snapshot);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("PSK station XML", () => {
  it("preserves exact Hz, direction, UTC, missing SNR and optional valid locators", () => {
    const parsed = parsePskStationXml(xml(report(), report().replace('sNR="-12"', 'sNR=""').replace('receiverLocator="FN31"', 'receiverLocator="ZZ99"')), "N0TEST", NOW);
    expect(parsed.reports).toHaveLength(2);
    expect(parsed.reports[0]).toMatchObject({ frequencyHz: 14_074_125, observedAt: NOW - 60_000, senderLocator: "EM38AB", snr: -12 });
    expect(parsed.reports[1]).toMatchObject({ receiverLocator: null, snr: null });
    expect(canonicalPskCallsign(" ea8/n0test/p ")).toBe("EA8/N0TEST/P");
    for (const bad of ["", "TEST", "123", "N0TEST*", "N0TEST//P", "N0TEST?x=1"]) expect(canonicalPskCallsign(bad)).toBeNull();
  });

  it("filters exact callsign, expired/future rows and invalid frequencies without fabricating data", () => {
    const parsed = parsePskStationXml(xml(
      report().replace("N0TEST", "N0TEST/P"),
      report().replace(String(seconds - 60), String(seconds - 86_401)),
      report().replace(String(seconds - 60), String(seconds + 6)),
      report().replace("14074125", "14074125.5"),
      report().replace("N0TEST", "W2ABC").replace("W1AW", "N0TEST"),
    ), "N0TEST", NOW);
    expect(parsed.discarded).toBe(4);
    expect(parsed.reports).toHaveLength(1);
    expect(parsed.reports[0].receiverCallsign).toBe("N0TEST");
  });

  it("rejects malformed, error, nested and entity documents; accepts an honest empty feed", () => {
    for (const bad of ["", "<html/>", "<receptionReports>", "<receptionReports><error>busy</error></receptionReports>", `<!DOCTYPE receptionReports [<!ENTITY x "boom">]>${xml()}`, xml(`<nested>${report()}</nested>`), xml(report()).replace("W1AW", "W1&amp;bogus;AW") + "<extra/>"]) {
      expect(() => parsePskStationXml(bad, "N0TEST", NOW)).toThrow();
    }
    expect(parsePskStationXml(xml(), "N0TEST", NOW)).toEqual({ reports: [], limited: false, discarded: 0 });
  });

  it("retains the newest thousand even when upstream ignores rptlimit and returns unordered rows", () => {
    const rows = Array.from({ length: 1_002 }, (_, i) => report().replace(String(seconds - 60), String(seconds - 2_000 + i)));
    const parsed = parsePskStationXml(xml(...rows), "N0TEST", NOW);
    expect(parsed.limited).toBe(true);
    expect(parsed.reports).toHaveLength(1_000);
    expect(parsed.reports[0].observedAt).toBe((seconds - 999) * 1_000);
    expect(() => parsePskStationXml(xml(...rows) + "broken", "N0TEST", NOW)).toThrow();
  });
});

describe("PSK station handler", () => {
  it("coalesces simultaneous requests and reuses one callsign snapshot for all view controls", async () => {
    const fetcher = vi.fn(async (_url: URL, _options: RequestInit) => new Response(xml(report())));
    vi.stubGlobal("fetch", fetcher);
    const handle = createPskStationHandler();
    const responses = await Promise.all([handle(request()), handle(request("n0test")), handle(new Request(request().url + "&window=15&direction=by&band=20m"))]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const upstream = new URL(String(fetcher.mock.calls[0][0]));
    expect(upstream.searchParams.get("callsign")).toBe("N0TEST");
    expect(upstream.searchParams.get("flowStartSeconds")).toBe("-86400");
    expect(await responses[0].json()).toMatchObject({ status: "ok", fetchedAt: NOW, retryAt: NOW + 300_000, reports: [{ frequencyHz: 14_074_125 }] });
    vi.setSystemTime(NOW + 299_000);
    expect((await handle(request())).headers.get("Cache-Control")).toContain("s-maxage=1");
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 300_000);
    await handle(request());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps last success visibly stale on failure and observes the same five-minute failure cooldown", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(xml(report()))).mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetcher);
    const handle = createPskStationHandler();
    await handle(request());
    vi.setSystemTime(NOW + 300_000);
    const stale = await (await handle(request())).json();
    expect(stale).toMatchObject({ status: "stale", fetchedAt: NOW, checkedAt: NOW + 300_000, retryAt: NOW + 600_000 });
    expect(stale.reports).toHaveLength(1);
    await handle(request());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("distinguishes unavailable from a successful zero-report snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("oops", { status: 503 })).mockResolvedValueOnce(new Response(xml())));
    const handle = createPskStationHandler();
    const failed = await handle(request());
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ status: "unavailable", fetchedAt: null });
    vi.setSystemTime(NOW + 300_000);
    expect(await (await handle(request())).json()).toMatchObject({ status: "ok", reports: [], fetchedAt: NOW + 300_000 });
  });

  it("rejects oversized bodies and invalid methods/calls before fetching", async () => {
    const fetcher = vi.fn(async () => new Response("x".repeat(2 * 1024 * 1024 + 1)));
    vi.stubGlobal("fetch", fetcher);
    const handle = createPskStationHandler();
    expect((await handle(request("*"))).status).toBe(400);
    expect((await handle(new Request(request(), { method: "POST" }))).status).toBe(405);
    expect((await handle(new Request(request(), { method: "OPTIONS" }))).status).toBe(204);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await handle(request())).status).toBe(502);
  });

  it("bounds station cache capacity without evicting entries during their cooldown", async () => {
    const fetcher = vi.fn(async () => new Response(xml()));
    vi.stubGlobal("fetch", fetcher);
    const handle = createPskStationHandler();
    for (let i = 0; i < 128; i++) expect((await handle(request(`N${i}TEST`))).status).toBe(200);
    const starts = () => vi.mocked(sharedPskStationCache.claim).mock.calls.length;
    expect(starts()).toBe(128);
    expect((await handle(request("W1AW"))).status).toBe(503);
    expect(starts()).toBe(128);
    await handle(request("N0TEST"));
    expect(fetcher).toHaveBeenCalledTimes(128);
    vi.setSystemTime(NOW + 300_000);
    expect((await handle(request("W1AW"))).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(129);
  });

  it("coordinates different calls and independent handler instances through the shared gate", async () => {
    let reserved = false;
    const gate = {
      claim: vi.fn(async () => {
        const token = reserved ? null : "lease";
        reserved = true;
        return { token, snapshot: null, retryAt: NOW + 310_000 };
      }),
      finish: vi.fn(async (_call: string, _token: string, snapshot: import("../../../src/lib/hamclock/pskStation").PskStationSnapshot) => snapshot),
    };
    const fetcher = vi.fn(async () => new Response(xml())); vi.stubGlobal("fetch", fetcher);
    const [first, second] = await Promise.all([createPskStationHandler(gate)(request()), createPskStationHandler(gate)(request("W1AW"))]);
    expect(first.status).toBe(200); expect(second.status).toBe(502);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await second.json()).toMatchObject({ status: "unavailable", fetchedAt: null, retryAt: NOW + 310_000 });
  });

  it("reuses a snapshot from another process without spending a provider lease", async () => {
    const snapshot = { callsign: "N0TEST", reports: [], status: "ok" as const, fetchedAt: NOW, checkedAt: NOW,
      retryAt: NOW + 300_000, windowMinutes: 1440 as const, limit: 1000, limited: false, discarded: 0 };
    vi.mocked(sharedPskStationCache.claim).mockResolvedValueOnce({ token: null, snapshot, retryAt: snapshot.retryAt });
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await (await createPskStationHandler()(request())).json()).toEqual(snapshot);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not call the provider when shared coordination fails or the start deadline has expired", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    vi.mocked(sharedPskStationCache.claim).mockRejectedValueOnce(new Error("cache offline"));
    expect((await createPskStationHandler()(request())).status).toBe(502);
    vi.mocked(sharedPskStationCache.claim).mockResolvedValueOnce({ token: "lease", snapshot: null, retryAt: NOW + 299_000 });
    expect((await createPskStationHandler()(request())).status).toBe(502);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps the deadline active while reading the response body", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: URL, { signal }: RequestInit) => new Response(new ReadableStream({
      start(controller) { signal!.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError"))); },
    }))));
    const pending = createPskStationHandler()(request());
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).status).toBe(502);
  });
});
