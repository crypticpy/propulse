import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleSpotsHeatmapBaseline, parseHeatmapBaselineRow, parseRegionalHourRow } from "./heatmapBaseline.js";

const NOW = "2026-09-09T13:00:00.000Z";
const HOUR = "2026-09-09T12:00:00.000Z";
const ROW = {
  band: "20m", continent: "EU", hour_of_day: 12,
  p25: 2, p50: 1000, p75: 1200, p95: 1600, sample_count: 14,
  computed_at: "2026-09-09T00:00:00Z",
};
const CURRENT = { band: "20m", continent: "EU", hour_utc: HOUR, spot_count: 1000 };
let client = 0;
const request = (method = "GET", ip = String(++client)) => new Request(
  "https://propulse.cloud/api/spots/heatmap-baseline",
  { method, headers: { "x-real-ip": ip } },
);
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

function upstream({ baseline = [ROW] as unknown[], current = [CURRENT] as unknown[], baselineGuard = true as unknown, hourGuard = true as unknown, pageSize = 1000 } = {}) {
  const fetcher = vi.fn(async (input: URL, init: RequestInit) => {
    expect(init.headers).toMatchObject({ apikey: "test-anon-key" });
    if (input.pathname.endsWith("/rpc/spot_aggregation_baseline_current")) {
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string).p_aggregation).toBe("region_hourly");
      return json(baselineGuard);
    }
    if (input.pathname.endsWith("/rpc/spot_aggregation_hour_readable")) {
      expect(JSON.parse(init.body as string)).toEqual({ p_aggregation: "region_hourly", p_hour: HOUR });
      return json(hourGuard);
    }
    const isBaseline = input.pathname === "/rest/v1/region_activity_climatology";
    expect(input.pathname).toBe(isBaseline ? "/rest/v1/region_activity_climatology" : "/rest/v1/region_hourly_stats");
    expect(input.searchParams.get("order")).toBe(isBaseline ? "band.asc,continent.asc,hour_of_day.asc" : "band.asc,continent.asc");
    if (isBaseline) expect(input.searchParams.get("hour_of_day")).toBe("eq.12");
    if (!isBaseline) expect(input.searchParams.get("hour_utc")).toBe(`eq.${HOUR}`);
    expect(input.searchParams.get("limit")).toBe("1000");
    expect(init.headers).toMatchObject({ Prefer: "count=exact" });
    const rows = isBaseline ? baseline : current;
    const offset = Number(input.searchParams.get("offset"));
    const page = rows.slice(offset, offset + pageSize);
    return json(page, 200, { "Content-Range": `${offset}-${offset + page.length - 1}/${rows.length}` });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

beforeEach(() => {
  vi.setSystemTime(new Date(NOW));
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
  vi.stubEnv("ALLOWED_ORIGIN", "https://allowed.example");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("heatmap regional snapshot handler", () => {
  it("filters climatology to the measured UTC hour and reads at most one 77-row page", async () => {
    const rows = Array.from({ length: 77 }, (_, index) => ({
      ...ROW, band: `band-${Math.floor(index / 7)}`,
      continent: ["NA", "SA", "EU", "AF", "AS", "OC", "AN"][index % 7],
    }));
    const fetcher = upstream({ baseline: rows });
    const response = await handleSpotsHeatmapBaseline(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600, s-maxage=3600");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://allowed.example");
    expect(await response.json()).toMatchObject({
      baseline: rows, current: [CURRENT],
      meta: { schemaVersion: 2, hour_utc: HOUR, computedAt: ROW.computed_at, fetchedAt: NOW },
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("continues short pages when Content-Range reports more rows", async () => {
    const fetcher = upstream({ baseline: [ROW, { ...ROW, band: "40m" }], pageSize: 1 });
    expect((await (await handleSpotsHeatmapBaseline(request())).json()).baseline).toHaveLength(2);
    expect(fetcher.mock.calls[1][0].searchParams.get("offset")).toBe("1");
  });

  it("expires HTTP cache at the next UTC boundary rather than serving a previous hour", async () => {
    vi.setSystemTime(new Date("2026-09-09T13:59:30Z"));
    upstream();
    expect((await handleSpotsHeatmapBaseline(request())).headers.get("Cache-Control")).toBe("public, max-age=30, s-maxage=30");
  });

  it("requests the previous day's 23:00 hour at midnight", async () => {
    vi.setSystemTime(new Date("2026-09-09T00:00:00Z"));
    const fetcher = vi.fn(async () => json([]));
    vi.stubGlobal("fetch", fetcher);
    const result = await (await handleSpotsHeatmapBaseline(request())).json();
    expect(result.meta.hour_utc).toBe("2026-09-08T23:00:00.000Z");
    expect(fetcher.mock.calls).toHaveLength(2);
  });

  it.each([{ current: [] }, { current: [null, { ...CURRENT, hour_utc: NOW }] }])("does not invent an empty or malformed regional hour: %j", async ({ current }) => {
    upstream({ current });
    const response = await handleSpotsHeatmapBaseline(request());
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).current).toEqual([]);
  });

  it.each([
    { ...ROW, hour_of_day: 24 }, { ...ROW, hour_of_day: 1.5 },
    { ...ROW, continent: "XX" }, { ...ROW, p50: NaN },
    { ...ROW, sample_count: -1 }, { ...ROW, p50: "4" }, null,
    { ...ROW, computed_at: null }, { ...ROW, computed_at: "invalid" },
  ])("rejects malformed climatology: %j", (row) => {
    expect(parseHeatmapBaselineRow(row)).toBeNull();
  });

  it.each([{ ...CURRENT, spot_count: -1 }, { ...CURRENT, spot_count: 1.5 }, { ...CURRENT, hour_utc: NOW }, null])("rejects malformed or wrong-hour counts: %j", (row) => {
    expect(parseRegionalHourRow(row, HOUR)).toBeNull();
  });

  it("retains zero counts and low-sample baselines for client qualification", () => {
    expect(parseHeatmapBaselineRow({ ...ROW, sample_count: 13 })?.sample_count).toBe(13);
    expect(parseRegionalHourRow({ ...CURRENT, spot_count: 0 }, HOUR)?.spot_count).toBe(0);
  });

  it("uses the oldest baseline timestamp and suppresses invalidated climatology", async () => {
    const older = { ...ROW, band: "40m", computed_at: "2026-09-08T00:00:00Z" };
    const fetcher = upstream({ baseline: [ROW, older], baselineGuard: false });
    const response = await handleSpotsHeatmapBaseline(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ baseline: [], current: [CURRENT], meta: { computedAt: null } });
    const guardCall = fetcher.mock.calls.find(([url]) => url.pathname.endsWith("/spot_aggregation_baseline_current"));
    expect(JSON.parse(guardCall![1].body as string)).toEqual({ p_aggregation: "region_hourly", p_computed_at: older.computed_at });
  });

  it("suppresses a regional hour inside a recorded aggregation gap", async () => {
    upstream({ hourGuard: false });
    const response = await handleSpotsHeatmapBaseline(request());
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ baseline: [ROW], current: [] });
  });

  it.each(["baselineGuard", "hourGuard"] as const)("fails closed when %s is malformed", async (key) => {
    upstream({ [key]: { current: true } });
    const response = await handleSpotsHeatmapBaseline(request());
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ baseline: [], current: [] });
  });

  it("handles OPTIONS and rejects non-GET requests before querying", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const options = await handleSpotsHeatmapBaseline(request("OPTIONS"));
    expect(options.status).toBe(204);
    expect(options.headers.get("Access-Control-Allow-Origin")).toBe("https://allowed.example");
    expect((await handleSpotsHeatmapBaseline(request("POST"))).status).toBe(405);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rate limits repeated requests", async () => {
    upstream({ baseline: [], current: [] });
    const ip = `rate-limit-${++client}`;
    for (let i = 0; i < 30; i += 1) expect((await handleSpotsHeatmapBaseline(request("GET", ip))).status).toBe(200);
    expect((await handleSpotsHeatmapBaseline(request("GET", ip))).status).toBe(429);
  });

  it("returns 503 when storage is not configured", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    expect((await handleSpotsHeatmapBaseline(request())).status).toBe(503);
  });

  it("fails the whole snapshot if current data fails, without caching a partial response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json([ROW])).mockResolvedValueOnce(json({}, 500)));
    const response = await handleSpotsHeatmapBaseline(request());
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ baseline: [], current: [] });
  });

  it("rejects malformed and oversized upstream payloads", async () => {
    for (const response of [json({ wrong: [] }), json([], 200, { "Content-Length": "999999" })]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      expect((await handleSpotsHeatmapBaseline(request())).status).toBe(502);
    }
  });

  it("aborts a stalled upstream request", async () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_input: URL, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const pending = handleSpotsHeatmapBaseline(request());
    await vi.advanceTimersByTimeAsync(5000);
    const response = await pending;
    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe("Spot store timed out");
  });
});
