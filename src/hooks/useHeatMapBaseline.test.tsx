import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baselineKey, computeRatio } from "@/lib/widgets/heatmap/baseline";
import { buildHeatMapBaseline, useHeatMapBaseline } from "./useHeatMapBaseline";

const ROW = { band: "20m", continent: "EU", hour_of_day: 13, p50: 4, sample_count: 14 };
afterEach(() => vi.unstubAllGlobals());

describe("baseline lookup", () => {
  it("maps the median into meanCount at the correct UTC hour, including zero", () => {
    const lookup = buildHeatMapBaseline([ROW, { ...ROW, hour_of_day: 0, p50: 0 }]);
    expect(lookup.get(baselineKey("20m", "EU", 13))).toBe(4);
    expect(lookup.get(baselineKey("20m", "EU", 0))).toBe(0);
    expect(lookup.get(baselineKey("20m", "EU", 14))).toBeUndefined();
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

it("shares a one-hour cache and disables retained data after a failed refetch", async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ rows: [ROW] })));
  vi.stubGlobal("fetch", fetcher);
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const first = renderHook(() => useHeatMapBaseline(), { wrapper });
  await waitFor(() => expect(first.result.current.baseline.size).toBe(1));
  expect(first.result.current.unavailableLabel).toBeNull();
  expect(client.getQueryCache().find({ queryKey: ["heatmap-baseline"] })?.isStaleByTime(3600000)).toBe(false);
  const second = renderHook(() => useHeatMapBaseline(), { wrapper });
  expect(second.result.current.baseline.size).toBe(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("/api/spots/heatmap-baseline");

  fetcher.mockImplementation(async () => new Response("unavailable", { status: 502 }));
  await act(async () => { await first.result.current.refetch(); });
  await waitFor(() => expect(first.result.current.isError).toBe(true));
  expect(first.result.current.data?.size).toBe(1);
  expect(first.result.current.baseline.size).toBe(0);
  expect(first.result.current.unavailableLabel).toBe("BASELINE UNAVAILABLE");

  fetcher.mockImplementation(async () => new Response(JSON.stringify({ rows: [ROW] })));
  await act(async () => { await first.result.current.refetch(); });
  await waitFor(() => expect(first.result.current.baseline.size).toBe(1));
  first.unmount();
  second.unmount();
  client.clear();
});

it("explains loading and empty qualified data", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ rows: [{ ...ROW, sample_count: 13 }] }))));
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, unmount } = renderHook(() => useHeatMapBaseline(), { wrapper });
  expect(result.current.unavailableLabel).toBe("BASELINE LOADING");
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.baseline.size).toBe(0);
  expect(result.current.unavailableLabel).toBe("NEEDS 14 BASELINE SAMPLES");
  unmount();
  client.clear();
});
