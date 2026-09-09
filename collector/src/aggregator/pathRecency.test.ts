import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PATH_RECENCY_TRANSFORM_VERSION,
  computePathRecency,
  prunePathRecency,
} from "./pathRecency.js";
import type { PathArchiveControls } from "../types.js";

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

interface FakeDb {
  db: SupabaseClient;
  calls: RpcCall[];
}

function fakeDb(
  watermark: string | null,
  options: {
    rowsWritten?: number;
    rpcError?: string;
    newestStoredHour?: string | null;
    gaps?: { start_hour: string; end_hour: string }[];
    gapError?: boolean;
  } = {},
): FakeDb {
  const calls: RpcCall[] = [];
  const db = {
    from(table: string) {
      if (table === "collector_aggregation_gaps") {
        return { select: () => ({ eq: () => ({ lte: () => ({ gte: () => ({
          limit: async () => ({ data: options.gaps ?? [], error: options.gapError ? { message: "failed" } : null }),
        }) }) }) }) };
      }
      if (table === "path_recency_hourly") {
        const stored = options.newestStoredHour ?? null;
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: stored === null ? null : { hour_utc: stored },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table !== "collector_aggregation_watermarks") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: watermark === null ? null : { hour_utc: watermark },
              error: null,
            }),
          }),
        }),
      };
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (options.rpcError) {
        return { data: null, error: { message: options.rpcError } };
      }
      return { data: options.rowsWritten ?? 0, error: null };
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

describe("path recency aggregator", () => {
  it("recomputes the path_hourly watermark hour and the hour before it", async () => {
    const { db, calls } = fakeDb("2026-09-06T14:00:00+00:00", {
      rowsWritten: 3,
    });

    const rows = await computePathRecency(db);

    expect(rows).toBe(6);
    expect(calls.map((call) => call.fn)).toEqual([
      "compute_path_recency_hourly",
      "compute_path_recency_hourly",
    ]);
    expect(calls.map((call) => call.args.p_hour)).toEqual([
      "2026-09-06T13:00:00.000Z",
      "2026-09-06T14:00:00.000Z",
    ]);
    expect(calls[0].args.p_transform_version).toBe(
      PATH_RECENCY_TRANSFORM_VERSION,
    );
  });

  it("fills every hour between the newest stored hour and the watermark", async () => {
    // Collector outage: path aggregation caught up from 09:00 to 14:00 in
    // one go. Recency must not skip 10:00-12:00.
    const { db, calls } = fakeDb("2026-09-06T14:00:00+00:00", {
      newestStoredHour: "2026-09-06T09:00:00+00:00",
    });

    await computePathRecency(db);

    expect(calls.map((call) => call.args.p_hour)).toEqual([
      "2026-09-06T09:00:00.000Z",
      "2026-09-06T10:00:00.000Z",
      "2026-09-06T11:00:00.000Z",
      "2026-09-06T12:00:00.000Z",
      "2026-09-06T13:00:00.000Z",
      "2026-09-06T14:00:00.000Z",
    ]);
  });

  it("caps a huge gap to one tick's worth of hours", async () => {
    const { db, calls } = fakeDb("2026-09-06T14:00:00+00:00", {
      newestStoredHour: "2026-08-01T00:00:00+00:00",
    });

    await computePathRecency(db);

    expect(calls).toHaveLength(48);
    expect(calls[0].args.p_hour).toBe("2026-09-04T15:00:00.000Z");
    expect(calls[47].args.p_hour).toBe("2026-09-06T14:00:00.000Z");
  });

  it("replays recency for same-hour late path updates", async () => {
    const { db, calls } = fakeDb("2026-09-06T14:00:00+00:00");

    await computePathRecency(db);
    const afterFirst = calls.length;
    const rows = await computePathRecency(db);

    expect(afterFirst).toBe(2);
    expect(calls).toHaveLength(4);
    expect(rows).toBe(0);
  });


  it("skips known source gaps while allowing newer retained hours to recover", async () => {
    const { db, calls } = fakeDb("2026-09-06T14:00:00Z", {
      gaps: [{ start_hour: "2026-09-06T13:00:00Z", end_hour: "2026-09-06T13:00:00Z" }],
    });
    await expect(computePathRecency(db)).rejects.toThrow("skipped 1");
    expect(calls.map((call) => call.args.p_hour)).toEqual(["2026-09-06T14:00:00.000Z"]);
  });

  it("fails closed when gap metadata is unavailable", async () => {
    const { db, calls } = fakeDb("2026-09-06T14:00:00Z", { gapError: true });
    await expect(computePathRecency(db)).rejects.toThrow("Cannot verify");
    expect(calls).toHaveLength(0);
  });

  it("does nothing until the path aggregator has a watermark", async () => {
    const { db, calls } = fakeDb(null);

    await expect(computePathRecency(db)).resolves.toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("surfaces RPC failures without advancing the cursor", async () => {
    const failing = fakeDb("2026-09-06T14:00:00+00:00", {
      rpcError: "boom",
    });

    await expect(computePathRecency(failing.db)).rejects.toThrow("boom");

    const retry = fakeDb("2026-09-06T14:00:00+00:00", { rowsWritten: 1 });
    await expect(computePathRecency(retry.db)).resolves.toBe(2);
  });
});

interface RecencyPruneFake {
  db: SupabaseClient;
  fromCalls: number;
  deleted: { start: string; end: string }[];
}

function fakePruneDb(
  options: { deleteError?: string; countPerHour?: number } = {},
): RecencyPruneFake {
  const deleted: { start: string; end: string }[] = [];
  const fake: RecencyPruneFake = {
    fromCalls: 0,
    deleted,
    db: null as unknown as SupabaseClient,
  };
  fake.db = {
    from(table: string) {
      if (table !== "path_recency_hourly") {
        throw new Error(`unexpected table ${table}`);
      }
      fake.fromCalls += 1;
      return {
        delete: () => ({
          gte: (_column: string, start: string) => ({
            lt: async (_column: string, end: string) => {
              if (options.deleteError) {
                return { count: null, error: { message: options.deleteError } };
              }
              deleted.push({ start, end });
              return { count: options.countPerHour ?? 12, error: null };
            },
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
  return fake;
}

const HOT: PathArchiveControls = {
  hotDays: 90,
  pruneEnabled: true,
  maxDaysPerRun: 2,
};

describe("path recency prune", () => {
  it("does not touch the table until ARCHIVE_PATH_STATS_PRUNE is armed", async () => {
    const fake = fakePruneDb();
    await expect(
      prunePathRecency(fake.db, { ...HOT, pruneEnabled: false }, [
        "2026-04-01",
      ]),
    ).resolves.toEqual({ daysPruned: 0, rowsDeleted: 0 });
    expect(fake.fromCalls).toBe(0);
    expect(fake.deleted).toEqual([]);
  });

  // N1 (#609 review): prunePathRecency used to compute its own window from
  // path_recency_hourly's own oldest row, which could run ahead of what the
  // archive pass actually confirmed archived. It must now only ever delete
  // exactly the days it is handed.
  it("deletes only the days passed in, never a self-computed window", async () => {
    const fake = fakePruneDb();
    const result = await prunePathRecency(fake.db, HOT, ["2026-04-01"]);
    expect(result).toEqual({ daysPruned: 1, rowsDeleted: 12 * 24 });
    // Every delete stays within 2026-04-01's 24 hours.
    expect(fake.deleted).toHaveLength(24);
    expect(fake.deleted[0]).toEqual({
      start: "2026-04-01T00:00:00.000Z",
      end: "2026-04-01T01:00:00.000Z",
    });
    expect(fake.deleted[23]).toEqual({
      start: "2026-04-01T23:00:00.000Z",
      end: "2026-04-02T00:00:00.000Z",
    });
  });

  // N2 (#609 review): a day-wide DELETE on ~70k rows/day risks the default
  // 8s PostgREST statement timeout. Deletes must be hour-by-hour instead.
  it("deletes hour-by-hour rather than one day-wide statement", async () => {
    const fake = fakePruneDb();
    await prunePathRecency(fake.db, HOT, ["2026-04-01", "2026-04-02"]);
    // 2 days * 24 bounded hourly statements, never a single day-wide one.
    expect(fake.deleted).toHaveLength(48);
    for (const { start, end } of fake.deleted) {
      const spanMs = Date.parse(end) - Date.parse(start);
      expect(spanMs).toBe(3_600_000);
    }
  });

  it("bounds work to maxDaysPerRun, oldest first", async () => {
    const fake = fakePruneDb();
    const result = await prunePathRecency(fake.db, HOT, [
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
    ]);
    expect(result.daysPruned).toBe(2); // HOT.maxDaysPerRun = 2
    expect(fake.deleted.every((d) => !d.start.startsWith("2026-04-03"))).toBe(
      true,
    );
  });

  it("does nothing when handed no sealed days", async () => {
    const fake = fakePruneDb();
    await expect(prunePathRecency(fake.db, HOT, [])).resolves.toEqual({
      daysPruned: 0,
      rowsDeleted: 0,
    });
    expect(fake.fromCalls).toBe(0);
    expect(fake.deleted).toEqual([]);
  });
});
