import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ from: supabaseMocks.from }),
}));

import {
  HOURLY_STATS_PAGE_SIZE,
  queryBandHourlyStats,
  queryPathHourlyStats,
} from "@/lib/propagation/hourlyStats";

type PageResponse = {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
};

/**
 * Chainable fake for the PostgREST builder: filter/order calls are recorded
 * and return the builder; `range` resolves with the next canned response.
 */
function makeBuilder(responses: PageResponse[]) {
  let page = 0;
  const calls: Array<[string, unknown[]]> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  for (const method of ["select", "eq", "gte", "order"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  builder.range = (...args: unknown[]) => {
    calls.push(["range", args]);
    const response = responses[Math.min(page, responses.length - 1)];
    page += 1;
    return Promise.resolve(response);
  };
  return { builder, calls };
}

function rowsOf(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, i) => ({ id: i }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-29T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("queryBandHourlyStats", () => {
  it("filters by band and hour_utc window, ordered oldest-first", async () => {
    const { builder, calls } = makeBuilder([
      { data: [{ band: "20m", hour_utc: "2026-08-28T12:00:00Z" }], error: null },
    ]);
    supabaseMocks.from.mockReturnValue(builder);

    const rows = await queryBandHourlyStats("20m", 24);

    expect(supabaseMocks.from).toHaveBeenCalledWith("band_hourly_stats");
    expect(calls).toContainEqual(["eq", ["band", "20m"]]);
    expect(calls).toContainEqual([
      "gte",
      ["hour_utc", "2026-08-28T12:00:00.000Z"],
    ]);
    expect(calls).toContainEqual(["order", ["hour_utc", { ascending: true }]]);
    expect(rows).toHaveLength(1);
    expect(rows[0].band).toBe("20m");
  });

  it("pages through full pages until a short page arrives", async () => {
    const { builder, calls } = makeBuilder([
      { data: rowsOf(HOURLY_STATS_PAGE_SIZE), error: null },
      { data: rowsOf(5), error: null },
    ]);
    supabaseMocks.from.mockReturnValue(builder);

    const rows = await queryBandHourlyStats("40m");

    expect(rows).toHaveLength(HOURLY_STATS_PAGE_SIZE + 5);
    const ranges = calls.filter(([method]) => method === "range");
    expect(ranges).toEqual([
      ["range", [0, HOURLY_STATS_PAGE_SIZE - 1]],
      ["range", [HOURLY_STATS_PAGE_SIZE, 2 * HOURLY_STATS_PAGE_SIZE - 1]],
    ]);
  });

  it("surfaces PostgREST errors with the table name", async () => {
    const { builder } = makeBuilder([
      { data: null, error: { message: "canceling statement" } },
    ]);
    supabaseMocks.from.mockReturnValue(builder);

    await expect(queryBandHourlyStats("20m")).rejects.toThrow(
      "band_hourly_stats query failed: canceling statement",
    );
  });
});

describe("queryPathHourlyStats", () => {
  it("applies only the provided filters and uppercases Maidenhead fields", async () => {
    const { builder, calls } = makeBuilder([{ data: [], error: null }]);
    supabaseMocks.from.mockReturnValue(builder);

    await queryPathHourlyStats({ band: "20m", txField: "fn" });

    expect(supabaseMocks.from).toHaveBeenCalledWith("path_hourly_stats");
    expect(calls).toContainEqual(["eq", ["band", "20m"]]);
    expect(calls).toContainEqual(["eq", ["tx_field", "FN"]]);
    const eqColumns = calls
      .filter(([method]) => method === "eq")
      .map(([, args]) => args[0]);
    expect(eqColumns).not.toContain("mode_class");
    expect(eqColumns).not.toContain("rx_field");
  });

  it("defaults to a 24h hour_utc window", async () => {
    const { builder, calls } = makeBuilder([{ data: [], error: null }]);
    supabaseMocks.from.mockReturnValue(builder);

    await queryPathHourlyStats({ band: "20m" });

    expect(calls).toContainEqual([
      "gte",
      ["hour_utc", "2026-08-28T12:00:00.000Z"],
    ]);
  });

  it("surfaces PostgREST errors with the table name", async () => {
    const { builder } = makeBuilder([
      { data: null, error: { message: "permission denied" } },
    ]);
    supabaseMocks.from.mockReturnValue(builder);

    await expect(
      queryPathHourlyStats({ band: "20m", modeClass: "digital" }),
    ).rejects.toThrow("path_hourly_stats query failed: permission denied");
  });
});
