import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baselineKey, computeRatio } from "@/lib/widgets/heatmap/baseline";
import { buildHeatMapBaseline, buildHeatMapSnapshot, useHeatMapBaseline } from "./useHeatMapBaseline";

vi.mock("./useUTCClock", () => ({ useUTCClock: () => new Date("2026-09-09T13:00:00Z") }));
const HOUR = "2026-09-09T12:00:00.000Z";
const ROW = { band: "20m", continent: "EU", hour_of_day: 12, p50: 1000, sample_count: 14 };
const CURRENT = { band: "20m", continent: "EU", hour_utc: HOUR, spot_count: 1000 };
const PAYLOAD = { baseline: [ROW], current: [CURRENT], meta: { hour_utc: HOUR, computedAt: "2026-09-09T00:00:00Z" } };
afterEach(() => vi.unstubAllGlobals());

describe("baseline lookup", () => {
  it("maps p50 into meanCount at the correct UTC hour, including zero", () => {
    const lookup = buildHeatMapBaseline([ROW, { ...ROW, hour_of_day: 0, p50: 0 }]);
    expect(lookup.get(baselineKey("20m", "EU", 12))).toBe(1000);
    expect(lookup.get(baselineKey("20m", "EU", 0))).toBe(0);
    expect(lookup.get(baselineKey("20m", "EU", 13))).toBeUndefined();
  });

  it("drops insufficient samples and malformed or unsupported cells", () => {
    expect(buildHeatMapBaseline([
      { ...ROW, sample_count: 13 }, { ...ROW, sample_count: null },
      { ...ROW, p50: null }, { ...ROW, p50: Infinity }, { ...ROW, p50: -1 },
      { ...ROW, hour_of_day: 24 }, { ...ROW, hour_of_day: 1.5 },
      { ...ROW, continent: "AN" }, { ...ROW, band: "bogus" }, null,
    ]).size).toBe(0);
  });

  it("clamps the smoothed log2 ratio to the owner's -3 to 3 display range", () => {
    expect(computeRatio(999, 0)).toBe(3);
    expect(computeRatio(0, 999)).toBe(-3);
    expect(computeRatio(4, 4)).toBe(0);
    expect(computeRatio(4, null)).toBeNull();
  });
});

describe("regional snapshot qualification", () => {
  it.each([
    [[], "NO BASELINE DATA"],
    [[{ ...ROW, sample_count: 13 }], "NEEDS 14 BASELINE SAMPLES"],
    [[{ ...ROW, band: "bogus" }], "NO COMPATIBLE BASELINE DATA"],
    [[{ ...ROW, p50: null }], "NO COMPATIBLE BASELINE DATA"],
    [[{ ...ROW, hour_of_day: 13 }], "NO BASELINE FOR THIS UTC HOUR"],
  ])("distinguishes baseline absence, qualification and compatibility: %j", (baseline, label) => {
    expect(buildHeatMapSnapshot({ ...PAYLOAD, baseline }).unavailableLabel).toBe(label);
  });

  it("distinguishes a missing complete hour from malformed regional counts", () => {
    expect(buildHeatMapSnapshot({ ...PAYLOAD, current: [] }).unavailableLabel).toBe("NO COMPLETE-HOUR DATA (COLLECTOR GAP)");
    expect(buildHeatMapSnapshot({ ...PAYLOAD, current: [{ ...CURRENT, hour_utc: "2026-09-09T13:00:00Z" }] }).unavailableLabel).toBe("NO COMPATIBLE REGIONAL DATA");
  });

  it("preserves zero regional counts and exposes baseline age", () => {
    const snapshot = buildHeatMapSnapshot({ ...PAYLOAD, current: [{ ...CURRENT, spot_count: 0 }] });
    expect(snapshot.current.get("20m|EU|12")).toBe(0);
    expect(snapshot.computedAt).toBe(PAYLOAD.meta.computedAt);
    expect(snapshot.unavailableLabel).toBeNull();
    expect(buildHeatMapSnapshot({ ...PAYLOAD, meta: { hour_utc: HOUR } }).unavailableLabel).toBe("BASELINE AGE UNAVAILABLE");
  });

  it.each([null, { rows: [ROW] }, { ...PAYLOAD, meta: { hour_utc: "bad" } }, { ...PAYLOAD, meta: { hour_utc: "2026-09-09T12:30:00Z" } }])("rejects incompatible snapshot envelopes", (payload) => {
    expect(() => buildHeatMapSnapshot(payload)).toThrow();
  });
});

it("shares an hourly cache, uses only regional counts, and disables retained data after a failed refetch", async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify(PAYLOAD)));
  vi.stubGlobal("fetch", fetcher);
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const first = renderHook(() => useHeatMapBaseline(), { wrapper });
  await waitFor(() => expect(first.result.current.available).toBe(true));
  expect(first.result.current.regionalCells.find((cell) => cell.band === "20m" && cell.continent === "EU")).toMatchObject({ count: 1000, ratio: 0 });
  expect(first.result.current.basisLabel).toBe("LAST FULL HOUR vs 90-DAY MEDIAN · as of 2026-09-09 12:00 UTC");
  expect(first.result.current.baselineAgeLabel).toBe("BASELINE AS OF 2026-09-09 00:00 UTC (13 H AGO)");
  expect(client.getQueryCache().find({ queryKey: ["heatmap-baseline", HOUR] })?.isStaleByTime(3600000)).toBe(false);
  const second = renderHook(() => useHeatMapBaseline(), { wrapper });
  expect(second.result.current.available).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("/api/spots/heatmap-baseline");

  fetcher.mockImplementation(async () => new Response("unavailable", { status: 502 }));
  await act(async () => { await first.result.current.refetch(); });
  await waitFor(() => expect(first.result.current.isError).toBe(true));
  expect(first.result.current.data?.baseline.size).toBe(1);
  expect(first.result.current.baseline.size).toBe(0);
  expect(first.result.current.regionalCells).toEqual([]);
  expect(first.result.current.unavailableLabel).toBe("REGIONAL DATA UNAVAILABLE");

  fetcher.mockImplementation(async () => new Response(JSON.stringify(PAYLOAD)));
  await act(async () => { await first.result.current.refetch(); });
  await waitFor(() => expect(first.result.current.available).toBe(true));
  first.unmount();
  second.unmount();
  client.clear();
});

it.each([
  [{ ...PAYLOAD, baseline: [{ ...ROW, sample_count: 13 }] }, "NEEDS 14 BASELINE SAMPLES"],
  [{ ...PAYLOAD, current: [] }, "NO COMPLETE-HOUR DATA (COLLECTOR GAP)"],
  [{ ...PAYLOAD, meta: { ...PAYLOAD.meta, hour_utc: "2026-09-09T11:00:00Z" } }, "REGIONAL HOUR OUT OF DATE"],
])("explains loading and unavailable snapshots", async (payload, explanation) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, unmount } = renderHook(() => useHeatMapBaseline(), { wrapper });
  expect(result.current.unavailableLabel).toBe("REGIONAL DATA LOADING");
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.available).toBe(false);
  expect(result.current.regionalCells).toEqual([]);
  expect(result.current.unavailableLabel).toBe(explanation);
  unmount();
  client.clear();
});
