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
  options: { rowsWritten?: number; rpcError?: string } = {},
): FakeDb {
  const calls: RpcCall[] = [];
  const db = {
    from(table: string) {
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
