import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baselineKey, computeRatio } from "@/lib/widgets/heatmap/baseline";
import {
  buildHeatMapBaseline, buildHeatMapSnapshot, heatMapRefetchDelayMs, useHeatMapBaseline,
  type HeatMapSnapshot,
} from "./useHeatMapBaseline";

vi.mock("./useUTCClock", () => ({ useUTCClock: () => new Date() }));
const HOUR = "2026-09-09T12:00:00.000Z";
const ROW = { band: "20m", continent: "EU", hour_of_day: 12, p50: 1000, sample_count: 14 };
const CURRENT = { band: "20m", continent: "EU", hour_utc: HOUR, spot_count: 1000 };
const PAYLOAD = { baseline: [ROW], current: [CURRENT], meta: { hour_utc: HOUR, computedAt: "2026-09-09T00:00:00Z", fetchedAt: "2026-09-09T13:00:00Z" } };
beforeEach(() => vi.setSystemTime(new Date(PAYLOAD.meta.fetchedAt)));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

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
    expect(buildHeatMapSnapshot({ ...PAYLOAD, meta: { ...PAYLOAD.meta, computedAt: null } }).unavailableLabel).toBe("BASELINE AGE UNAVAILABLE");
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
  expect(client.getQueryCache().find({ queryKey: ["heatmap-baseline"] })?.isStaleByTime(3600000)).toBe(false);
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

it.each([-6, 6])("accepts the server hour with a client clock skew of %i hours", async (offset) => {
  vi.setSystemTime(new Date(Date.parse(PAYLOAD.meta.fetchedAt) + offset * 3_600_000));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(PAYLOAD))));
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, unmount } = renderHook(() => useHeatMapBaseline(), { wrapper });
  await waitFor(() => expect(result.current.available).toBe(true));
  expect(result.current.hourUtc).toBe(HOUR);
  expect(result.current.baselineAgeLabel).toBe("BASELINE AS OF 2026-09-09 00:00 UTC (13 H AGO)");
  expect(client.getQueryCache().getAll()).toHaveLength(1);
  unmount();
  expect(client.getQueryCache().getAll()[0].getObserversCount()).toBe(0);
  client.clear();
});

describe("CDN Age correction (#695 item 1)", () => {
  // PAYLOAD.meta.fetchedAt (13:00:00Z) sits exactly on the hour the origin
  // computed, one hour after HOUR (12:00:00Z) — a fresh, valid snapshot.
  it("applies the Age offset to fetchedAt before validating the hour", () => {
    const fresh = buildHeatMapSnapshot(PAYLOAD);
    expect(fresh.fetchedAt).toBe("2026-09-09T13:00:00.000Z");
    expect(fresh.unavailableLabel).toBeNull();

    // A body cached at the CDN for a full hour (Age: 3600) is really being
    // read at 14:00, one hour past the origin's own hour boundary — the
    // snapshot's meta.hour_utc (12:00) is then stale.
    const stale = buildHeatMapSnapshot(PAYLOAD, 3_600_000);
    expect(stale.fetchedAt).toBe("2026-09-09T14:00:00.000Z");
    expect(stale.unavailableLabel).toBe("REGIONAL HOUR OUT OF DATE");
  });

  it("reads the response's Age header and folds it into the served snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(PAYLOAD), { headers: { Age: "3600" } })),
    );
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => useHeatMapBaseline(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.unavailableLabel).toBe("REGIONAL HOUR OUT OF DATE");
    unmount();
    client.clear();
  });
});

describe("polling back-off (#695 item 4)", () => {
  const fetchedAt = "2026-09-09T13:15:00.000Z";
  const dataUpdatedAt = Date.parse(fetchedAt);
  // 5 minutes after the data landed, 40 minutes short of the 14:00 boundary.
  const now = dataUpdatedAt + 5 * 60_000;
  const snapshotWith = (unavailableLabel: string | null): HeatMapSnapshot => ({
    baseline: new Map(), current: new Map(), hourUtc: HOUR, computedAt: null, fetchedAt, unavailableLabel,
  });

  it("backs the two baseline-pending states off to the hour boundary, same as the healthy state", () => {
    const healthy = heatMapRefetchDelayMs(snapshotWith(null), dataUpdatedAt, now);
    expect(healthy).toBe(40 * 60_000);
    expect(heatMapRefetchDelayMs(snapshotWith("NEEDS 14 BASELINE SAMPLES"), dataUpdatedAt, now)).toBe(healthy);
    expect(heatMapRefetchDelayMs(snapshotWith("NO BASELINE FOR THIS UTC HOUR"), dataUpdatedAt, now)).toBe(healthy);
  });

  it("keeps the collector-gap state (and other unavailable reasons) on the 60 s poll", () => {
    expect(heatMapRefetchDelayMs(snapshotWith("NO COMPLETE-HOUR DATA (COLLECTOR GAP)"), dataUpdatedAt, now)).toBe(60_000);
    expect(heatMapRefetchDelayMs(snapshotWith("REGIONAL HOUR OUT OF DATE"), dataUpdatedAt, now)).toBe(60_000);
    expect(heatMapRefetchDelayMs(undefined, dataUpdatedAt, now)).toBe(60_000);
  });
});
