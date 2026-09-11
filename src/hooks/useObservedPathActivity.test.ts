/**
 * useObservedPathActivity (#1047, plan tests 24-25).
 *
 * The hook owns exactly two things the pure derivation cannot: pinning one
 * issuance instant across the three reads, and deciding what a failed read
 * means. Both are load-bearing — a per-read clock sample would let the three
 * queries disagree about which hours they covered, and a failed read rendered
 * as a zero would be the closure claim this leaf exists to refuse.
 */

import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  observedActivityIssueBucket,
  useObservedPathActivity,
} from "./useObservedPathActivity";

const readerMocks = vi.hoisted(() => ({
  queryPathHourlyStats: vi.fn(),
  queryPathCoverageHours: vi.fn(),
  queryReadableBandHours: vi.fn(),
}));

vi.mock("@/lib/propagation/hourlyStats", () => readerMocks);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

const HOURS = [
  "2026-09-11T12:00:00.000Z",
  "2026-09-11T13:00:00.000Z",
  "2026-09-11T14:00:00.000Z",
  "2026-09-11T15:00:00.000Z",
  "2026-09-11T16:00:00.000Z",
  "2026-09-11T17:00:00.000Z",
];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-11T18:03:20Z"));
  readerMocks.queryPathHourlyStats.mockReset();
  readerMocks.queryPathCoverageHours.mockReset();
  readerMocks.queryReadableBandHours.mockReset();
  readerMocks.queryPathHourlyStats.mockResolvedValue([]);
  readerMocks.queryPathCoverageHours.mockResolvedValue([]);
  readerMocks.queryReadableBandHours.mockResolvedValue(
    HOURS.map((hour_utc) => ({ hour_utc })),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("observedActivityIssueBucket", () => {
  it("advances on five-minute boundaries (test 24)", () => {
    expect(
      new Date(
        observedActivityIssueBucket(Date.parse("2026-09-11T18:04:59Z")),
      ).toISOString(),
    ).toBe("2026-09-11T18:00:00.000Z");
    expect(
      new Date(
        observedActivityIssueBucket(Date.parse("2026-09-11T18:05:00Z")),
      ).toISOString(),
    ).toBe("2026-09-11T18:05:00.000Z");
  });
});

describe("useObservedPathActivity", () => {
  it("pins one issuedAt across the three reads and does not churn (test 24)", async () => {
    const { result, rerender } = renderHook(
      () =>
        useObservedPathActivity({
          band: "20m",
          txGrid: "FN31pr",
          rxGrid: "IO91wm",
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.record).not.toBeNull());
    rerender();
    rerender();

    // One fetch each, whatever the render count.
    expect(readerMocks.queryPathHourlyStats).toHaveBeenCalledTimes(1);
    expect(readerMocks.queryPathCoverageHours).toHaveBeenCalledTimes(1);
    expect(readerMocks.queryReadableBandHours).toHaveBeenCalledTimes(1);

    // 18:03:20 buckets to 18:00, so the window opens six hours earlier and
    // all three reads state the same `since`.
    expect(result.current.issuedAt).toBe("2026-09-11T18:00:00.000Z");
    const since = [
      readerMocks.queryPathHourlyStats,
      readerMocks.queryPathCoverageHours,
      readerMocks.queryReadableBandHours,
    ].map((mock) => mock.mock.calls[0][0].since);
    expect(since).toEqual([
      "2026-09-11T12:00:00.000Z",
      "2026-09-11T12:00:00.000Z",
      "2026-09-11T12:00:00.000Z",
    ]);
    expect(result.current.record?.issuedAt).toBe("2026-09-11T18:00:00.000Z");
  });

  it("asks for the field pair of the two grids", async () => {
    const { result } = renderHook(
      () =>
        useObservedPathActivity({
          band: "20m",
          txGrid: "fn31pr",
          rxGrid: "io91wm",
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.record).not.toBeNull());
    expect(readerMocks.queryPathHourlyStats.mock.calls[0][0]).toMatchObject({
      band: "20m",
      txField: "FN",
      rxField: "IO",
    });
    // Coverage asks about the receiving field only: any transmitter proves a
    // receiver was there.
    expect(readerMocks.queryPathCoverageHours.mock.calls[0][0]).toMatchObject({
      band: "20m",
      rxField: "IO",
    });
    expect(
      readerMocks.queryPathCoverageHours.mock.calls[0][0].txField,
    ).toBeUndefined();
  });

  it("turns a failed read into unknown, never into a zero (test 25)", async () => {
    readerMocks.queryPathCoverageHours.mockRejectedValue(
      new Error("path_hourly_stats query failed: canceling statement"),
    );

    const { result } = renderHook(
      () =>
        useObservedPathActivity({
          band: "20m",
          txGrid: "FN31pr",
          rxGrid: "IO91wm",
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    const record = result.current.record;
    expect(record?.state).toBe("unknown");
    expect(record?.state).not.toBe("no_reports");
    expect(record && "count" in record).toBe(false);
    expect(record?.state === "unknown" && record.reason).toBe(
      "aggregate_read_failed",
    );
  });

  it("reads nothing until both endpoints are known", () => {
    const { result } = renderHook(
      () =>
        useObservedPathActivity({
          band: "20m",
          txGrid: "FN31pr",
          rxGrid: null,
        }),
      { wrapper },
    );

    expect(result.current.record).toBeNull();
    expect(readerMocks.queryPathHourlyStats).not.toHaveBeenCalled();
  });

  it("derives a verified-open record from the three reads", async () => {
    readerMocks.queryPathHourlyStats.mockResolvedValue([
      {
        hour_utc: HOURS[4],
        band: "20m",
        mode_class: "digital",
        tx_field: "FN",
        rx_field: "IO",
        spot_count: 5,
        unique_tx: 1,
        unique_rx: 3,
        avg_snr: null,
        median_snr: null,
        backfilled_count: 0,
      },
    ]);
    readerMocks.queryPathCoverageHours.mockResolvedValue([
      { hour_utc: HOURS[4], mode_class: "digital", tx_field: "FN", unique_rx: 3 },
    ]);

    const { result } = renderHook(
      () =>
        useObservedPathActivity({
          band: "20m",
          txGrid: "FN31pr",
          rxGrid: "IO91wm",
        }),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.record?.state).toBe("verified_open"),
    );
    const record = result.current.record;
    expect(record?.state === "verified_open" && record.count).toBe(5);
    expect(record?.state === "verified_open" && record.ageSeconds).toBe(3600);
  });
});
