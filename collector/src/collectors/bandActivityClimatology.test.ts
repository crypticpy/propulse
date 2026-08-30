import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CLIMATOLOGY_BASELINE_DAYS,
  computeBandActivityClimatology,
} from "./bandActivityClimatology.js";

interface FakeDbState {
  rpcCalls: { fn: string; args: unknown }[];
  healthInserts: unknown[];
}

function fakeDb(
  rpcResult: { data: unknown; error: { message: string } | null },
): { db: SupabaseClient; state: FakeDbState } {
  const state: FakeDbState = { rpcCalls: [], healthInserts: [] };
  const db = {
    rpc(fn: string, args: unknown) {
      state.rpcCalls.push({ fn, args });
      if (fn === "compute_band_activity_climatology") {
        return Promise.resolve(rpcResult);
      }
      return Promise.resolve({ data: null, error: null });
    },
    from(table: string) {
      if (table !== "collector_health") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        insert(row: unknown) {
          state.healthInserts.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, state };
}

describe("computeBandActivityClimatology", () => {
  it("calls the recompute RPC with the baseline window and reports ok", async () => {
    const { db, state } = fakeDb({ data: 264, error: null });
    await computeBandActivityClimatology(db);

    expect(
      state.rpcCalls.filter((c) => c.fn === "compute_band_activity_climatology"),
    ).toEqual([
      {
        fn: "compute_band_activity_climatology",
        args: { baseline_days: CLIMATOLOGY_BASELINE_DAYS },
      },
    ]);
    expect(state.healthInserts).toHaveLength(1);
    expect(state.healthInserts[0]).toMatchObject({
      source: "band-climatology",
      status: "ok",
      spots_ingested: 264,
    });
  });

  it("reports an error when the RPC fails", async () => {
    const { db, state } = fakeDb({
      data: null,
      error: { message: "permission denied" },
    });
    await computeBandActivityClimatology(db);

    expect(state.healthInserts).toHaveLength(1);
    expect(state.healthInserts[0]).toMatchObject({
      source: "band-climatology",
      status: "error",
    });
  });

  it("treats zero rows written as an error, not silent success", async () => {
    const { db, state } = fakeDb({ data: 0, error: null });
    await computeBandActivityClimatology(db);

    expect(state.healthInserts[0]).toMatchObject({
      source: "band-climatology",
      status: "error",
    });
  });
});
