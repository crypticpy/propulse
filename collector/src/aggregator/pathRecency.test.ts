import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PATH_RECENCY_TRANSFORM_VERSION,
  computePathRecency,
  resetPathRecencyCursor,
} from "./pathRecency.js";

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
  } = {},
): FakeDb {
  const calls: RpcCall[] = [];
  const db = {
    from(table: string) {
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
  beforeEach(() => {
    resetPathRecencyCursor();
  });

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

  it("skips the recompute when the watermark has not advanced", async () => {
    const { db, calls } = fakeDb("2026-09-06T14:00:00+00:00");

    await computePathRecency(db);
    const afterFirst = calls.length;
    const rows = await computePathRecency(db);

    expect(afterFirst).toBe(2);
    expect(calls).toHaveLength(2);
    expect(rows).toBe(0);
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
