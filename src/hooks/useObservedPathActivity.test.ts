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
import { InvalidObservedWindowError } from "@/lib/propagation/radioEvidence/coverage";
import {
  observedActivityIssueBucket,
  observedActivityQueryKey,
  useObservedPathActivity,
} from "./useObservedPathActivity";

const readerMocks = vi.hoisted(() => ({
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

/** One row of the single read, which answers coverage and the pair count. */
function coverageRow(
  overrides: Partial<Record<string, unknown>> & { hour_utc: string },
) {
  return {
    mode_class: "digital",
    tx_field: "FN",
    spot_count: 5,
    unique_tx: 1,
    unique_rx: 3,
    backfilled_count: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-11T18:03:20Z"));
  readerMocks.queryPathCoverageHours.mockReset();
  readerMocks.queryReadableBandHours.mockReset();
  readerMocks.queryPathCoverageHours.mockResolvedValue({
    rows: [],
    truncated: false,
  });
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
  it("pins one issuedAt across the reads and does not churn (test 24)", async () => {
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
    expect(readerMocks.queryPathCoverageHours).toHaveBeenCalledTimes(1);
    expect(readerMocks.queryReadableBandHours).toHaveBeenCalledTimes(1);

    // 18:03:20 buckets to 18:00, so the window opens six hours earlier and
    // both reads state the same `since`.
    expect(result.current.issuedAt).toBe("2026-09-11T18:00:00.000Z");
    const since = [
      readerMocks.queryPathCoverageHours,
      readerMocks.queryReadableBandHours,
    ].map((mock) => mock.mock.calls[0][0].since);
    expect(since).toEqual([
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
    expect(readerMocks.queryPathCoverageHours).not.toHaveBeenCalled();
  });

  it("derives a verified-open record from the two reads", async () => {
    readerMocks.queryPathCoverageHours.mockResolvedValue({
      rows: [coverageRow({ hour_utc: HOURS[4] })],
      truncated: false,
    });

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

  it("opens the query at the aligned window start, not at the bucket", async () => {
    // An 18:05 issuance answers over 12:00 to 18:00. Querying from 12:05
    // would drop the 12:00 hour from every read while the record went on
    // claiming it, which makes silence unreachable for most of every hour.
    vi.setSystemTime(new Date("2026-09-11T18:07:00Z"));
    readerMocks.queryPathCoverageHours.mockResolvedValue({
      rows: [coverageRow({ hour_utc: HOURS[0] })],
      truncated: false,
    });

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
    expect(result.current.issuedAt).toBe("2026-09-11T18:05:00.000Z");
    expect(readerMocks.queryPathCoverageHours.mock.calls[0][0].since).toBe(
      "2026-09-11T12:00:00.000Z",
    );
    // The bound the query used is the bound the record states.
    expect(record?.windowStartAt).toBe("2026-09-11T12:00:00.000Z");
    expect(record?.state === "verified_open" && record.count).toBe(5);
  });

  it("derives the pair rows from the one coverage read", async () => {
    // Two requests can straddle a recovery commit, so a report present in the
    // coverage snapshot but missing from a separate pair snapshot would cache
    // a false zero. The pair rows are the subset of these rows that are ours.
    readerMocks.queryPathCoverageHours.mockResolvedValue({
      rows: [
        coverageRow({ hour_utc: HOURS[4], tx_field: "DM", spot_count: 40 }),
        coverageRow({ hour_utc: HOURS[4], spot_count: 5 }),
      ],
      truncated: false,
    });

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
    expect(readerMocks.queryPathCoverageHours).toHaveBeenCalledTimes(1);
    // Only our transmitting field is counted; the other one is coverage only.
    expect(
      result.current.record?.state === "verified_open" &&
        result.current.record.count,
    ).toBe(5);
  });

  it("reads a readable hour with no coverage rows as unknown", async () => {
    // The readable-hours read stays separate, and may legitimately disagree
    // with the coverage snapshot. A mismatch there can only widen what is
    // unknown; it can never manufacture a zero.
    readerMocks.queryPathCoverageHours.mockResolvedValue({
      rows: [],
      truncated: false,
    });

    const { result } = renderHook(
      () =>
        useObservedPathActivity({
          band: "20m",
          txGrid: "FN31pr",
          rxGrid: "IO91wm",
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.record).not.toBeNull());
    const record = result.current.record;
    expect(record?.state).toBe("unknown");
    expect(record?.state).not.toBe("no_reports");
    expect(record && "count" in record).toBe(false);
  });
});

describe("observedActivityQueryKey", () => {
  const base = {
    band: "20m",
    txField: "FN",
    rxField: "IO",
    windowSeconds: 21_600,
    bucket: Date.parse("2026-09-11T18:00:00Z"),
  };

  it("separates two mode sets inside one issuance bucket", () => {
    // Same instant, same path, different question. Without the mode set in
    // the key the second question is answered from the first one's cache,
    // which is how a CW request ends up rendering digital evidence.
    expect(
      observedActivityQueryKey({ ...base, modeClasses: ["cw"] }),
    ).not.toEqual(
      observedActivityQueryKey({ ...base, modeClasses: ["digital"] }),
    );
  });

  it("treats the same set in a different order as one question", () => {
    expect(
      observedActivityQueryKey({ ...base, modeClasses: ["digital", "cw"] }),
    ).toEqual(
      observedActivityQueryKey({ ...base, modeClasses: ["cw", "digital"] }),
    );
  });

  it("spells an omitted set as the full one", () => {
    expect(observedActivityQueryKey(base)).toEqual(
      observedActivityQueryKey({
        ...base,
        modeClasses: ["phone", "cw", "digital"],
      }),
    );
  });
});

describe("window validation", () => {
  it("rejects a window that is not a whole number of hours", () => {
    // At the call site, not inside the query: a caller bug that surfaced as a
    // failed read would be filed as unknown evidence rather than as the
    // mistake it is.
    expect(() =>
      renderHook(
        () =>
          useObservedPathActivity({
            band: "20m",
            txGrid: "FN31pr",
            rxGrid: "IO91wm",
            windowSeconds: 5400,
          }),
        { wrapper },
      ),
    ).toThrow(InvalidObservedWindowError);
  });
});

describe("a truncated read cannot state silence", () => {
  /** A watched, quiet window whose rows filled the cap: rows are missing. */
  function truncatedWatch(extra: ReturnType<typeof coverageRow>[] = []) {
    return {
      rows: [
        ...HOURS.map((hour_utc) =>
          coverageRow({ hour_utc, tx_field: "DM", spot_count: 0 }),
        ),
        ...extra,
      ],
      truncated: true,
    };
  }

  it("refuses no_reports when the read filled the row cap", async () => {
    // Every hour looks watched and quiet, but rows were left behind by the
    // cap, and one of them could be a report on this very path.
    readerMocks.queryPathCoverageHours.mockResolvedValue(truncatedWatch());

    const { result } = renderHook(
      () =>
        useObservedPathActivity({
          band: "20m",
          txGrid: "FN31pr",
          rxGrid: "IO91wm",
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.record).not.toBeNull());
    const record = result.current.record;
    expect(record?.state).not.toBe("no_reports");
    expect(record?.state).toBe("unknown");
    expect(record?.state === "unknown" && record.reason).toBe(
      "aggregate_read_truncated",
    );
    expect(record && "count" in record).toBe(false);
  });

  it("still states verified_open from a truncated read, as a lower bound", async () => {
    // Reports that did arrive are real evidence. Only the claim that they are
    // all of them falls away.
    readerMocks.queryPathCoverageHours.mockResolvedValue(
      truncatedWatch([coverageRow({ hour_utc: HOURS[4], spot_count: 5 })]),
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

    await waitFor(() =>
      expect(result.current.record?.state).toBe("verified_open"),
    );
    const record = result.current.record;
    expect(record?.state === "verified_open" && record.count).toBe(5);
    expect(record?.state === "verified_open" && record.countIsLowerBound).toBe(
      true,
    );
  });

  it("leaves a complete read alone", async () => {
    readerMocks.queryPathCoverageHours.mockResolvedValue({
      rows: HOURS.map((hour_utc) =>
        coverageRow({ hour_utc, tx_field: "DM", spot_count: 0 }),
      ),
      truncated: false,
    });

    const { result } = renderHook(
      () =>
        useObservedPathActivity({
          band: "20m",
          txGrid: "FN31pr",
          rxGrid: "IO91wm",
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.record).not.toBeNull());
    expect(result.current.record?.state).toBe("no_reports");
  });
});
