import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleSpotsHeatmapBaseline, parseHeatmapBaselineRow } from "./heatmapBaseline.js";

const ROW = {
  band: "20m", continent: "EU", hour_of_day: 13,
  p25: 2, p50: 4, p75: 8, p95: 16, sample_count: 14,
  computed_at: "2026-09-08T00:00:00Z",
};
let client = 0;
const request = (method = "GET", ip = String(++client)) => new Request(
  "https://propulse.cloud/api/spots/heatmap-baseline",
  { method, headers: { "x-real-ip": ip } },
);
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
  vi.stubEnv("ALLOWED_ORIGIN", "https://allowed.example");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("heatmap baseline handler", () => {
  it("reads beyond the 1000-row cap with stable ordering and caches for one hour", async () => {
    const rows = Array.from({ length: 1848 }, (_, index) => ({
      ...ROW, band: `band-${Math.floor(index / 168)}`, hour_of_day: index % 24,
      continent: ["NA", "SA", "EU", "AF", "AS", "OC", "AN"][Math.floor(index / 24) % 7],
    }));
    const fetcher = vi.fn(async (input: URL, init: RequestInit) => {
      if (input.pathname === "/rest/v1/rpc/spot_aggregation_baseline_current") {
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body as string)).toEqual({ p_aggregation: "region_hourly", p_computed_at: ROW.computed_at });
        return json(true);
      }
      expect(input.pathname).toBe("/rest/v1/region_activity_climatology");
      expect(input.searchParams.get("order")).toBe("band.asc,continent.asc,hour_of_day.asc");
      expect(input.searchParams.get("limit")).toBe("1000");
      expect(init.headers).toMatchObject({ apikey: "test-anon-key", Prefer: "count=exact" });
      const offset = Number(input.searchParams.get("offset"));
      const page = rows.slice(offset, offset + 1000);
      return json(page, 200, { "Content-Range": `${offset}-${offset + page.length - 1}/${rows.length}` });
    });
    vi.stubGlobal("fetch", fetcher);
    const response = await handleSpotsHeatmapBaseline(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600, s-maxage=3600");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://allowed.example");
    expect((await response.json()).rows).toEqual(rows);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("continues a short page when Content-Range reports more rows", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json([ROW], 200, { "Content-Range": "0-0/2" }))
      .mockResolvedValueOnce(json([{ ...ROW, hour_of_day: 14 }], 200, { "Content-Range": "1-1/2" }))
      .mockResolvedValueOnce(json(true));
    vi.stubGlobal("fetch", fetcher);
    const response = await handleSpotsHeatmapBaseline(request());
    expect((await response.json()).rows).toHaveLength(2);
    expect(fetcher.mock.calls[1][0].searchParams.get("offset")).toBe("1");
  });

  it("serves empty baselines honestly and excludes invalid rows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([null, { ...ROW, p50: -1 }])));
    expect((await (await handleSpotsHeatmapBaseline(request())).json()).rows).toEqual([]);
  });

  it.each([
    { ...ROW, hour_of_day: 24 }, { ...ROW, hour_of_day: 1.5 },
    { ...ROW, continent: "XX" }, { ...ROW, p50: NaN },
    { ...ROW, sample_count: -1 }, { ...ROW, p50: "4" }, null,
    { ...ROW, computed_at: null }, { ...ROW, computed_at: "invalid" },
  ])("rejects malformed data: %j", (row) => {
    expect(parseHeatmapBaselineRow(row)).toBeNull();
  });

  it("retains low-sample rows for the client to qualify", () => {
    expect(parseHeatmapBaselineRow({ ...ROW, sample_count: 13 })?.sample_count).toBe(13);
  });

  it("suppresses a snapshot invalidated by a newer aggregation gap", async () => {
    const older = { ...ROW, hour_of_day: 12, computed_at: "2026-09-07T00:00:00Z" };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json([ROW, older]))
      .mockResolvedValueOnce(json(false));
    vi.stubGlobal("fetch", fetcher);
    const response = await handleSpotsHeatmapBaseline(request());
    expect(response.status).toBe(200);
    expect((await response.json()).rows).toEqual([]);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      p_aggregation: "region_hourly", p_computed_at: older.computed_at,
    });
  });

  it.each([false, true])("fails closed when the guard fails (malformed=%s)", async (malformed) => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json([ROW]))
      .mockResolvedValueOnce(malformed ? json({ current: true }) : json({}, 500)));
    const response = await handleSpotsHeatmapBaseline(request());
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).rows).toEqual([]);
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
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => json([])));
    const ip = `rate-limit-${++client}`;
    for (let i = 0; i < 30; i += 1) {
      expect((await handleSpotsHeatmapBaseline(request("GET", ip))).status).toBe(200);
    }
    expect((await handleSpotsHeatmapBaseline(request("GET", ip))).status).toBe(429);
  });

  it("returns 503 when storage is not configured", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    expect((await handleSpotsHeatmapBaseline(request())).status).toBe(503);
  });

  it("fails the whole fetch if a later page fails, without caching partial data", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json([ROW], 200, { "Content-Range": "0-0/2" }))
      .mockResolvedValueOnce(json({ message: "unavailable" }, 500)));
    const response = await handleSpotsHeatmapBaseline(request());
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).rows).toEqual([]);
  });

  it("rejects malformed and oversized upstream payloads", async () => {
    for (const response of [json({ wrong: [] }), json([], 200, { "Content-Length": "999999" })]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      expect((await handleSpotsHeatmapBaseline(request())).status).toBe(502);
    }
  });

  it("aborts a stalled upstream request", async () => {
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
