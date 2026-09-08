import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeHourlyStats } from "./hourly.js";
import { computePathHourlyStats } from "./pathHourly.js";
import { recoverHourly } from "./recoverHourly.js";
import { computeRegionHourlyStats } from "./regionHourly.js";

type RpcResult = { data: unknown; error: { message: string } | null };

function fakeDb(options: {
  watermark?: string | null;
  rpc?: (name: string, args: Record<string, unknown>) => RpcResult | Promise<RpcResult>;
} = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
    calls.push({ name, args });
    return options.rpc?.(name, args) ?? {
      data: name === "compute_retained_spot_hour"
        ? { status: "retained", rows: 1 }
        : null,
      error: null,
    };
  });
  const maybeSingle = vi.fn(async () => ({
    data: options.watermark == null ? null : { hour_utc: options.watermark },
    error: null,
  }));
  const db = {
    rpc,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    })),
  } as unknown as SupabaseClient;
  return { db, calls, rpc };
}

describe("recoverHourly", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime("2026-09-07T12:30:00Z"));
  afterEach(() => vi.useRealTimers());

  it("persists an expired gap before processing a later retained hour", async () => {
    const { db, calls } = fakeDb({ watermark: "2026-09-07T07:00:00Z" });
    await expect(recoverHourly(db, "band_hourly", new Date("2026-09-07T11:00:00Z")))
      .rejects.toThrow("recovery has expired raw input");
    expect(calls.map((call) => call.name)).toEqual([
      "record_spot_aggregation_gap",
      "compute_retained_spot_hour",
    ]);
    expect(calls[0].args).toMatchObject({
      p_start_hour: "2026-09-07T08:00:00.000Z",
      p_end_hour: "2026-09-07T10:00:00.000Z",
    });
    expect(calls[1].args.p_hour).toBe("2026-09-07T11:00:00.000Z");
  });

  it("fails closed without computing when durable gap recording fails", async () => {
    const { db, calls } = fakeDb({
      watermark: "2026-09-07T07:00:00Z",
      rpc: (name) => name === "record_spot_aggregation_gap"
        ? { data: null, error: { message: "ledger unavailable" } }
        : { data: { status: "retained", rows: 1 }, error: null },
    });
    await expect(recoverHourly(db, "path_hourly", new Date("2026-09-07T11:00:00Z")))
      .rejects.toThrow("Cannot persist path_hourly recovery gap: ledger unavailable");
    expect(calls.map((call) => call.name)).toEqual(["record_spot_aggregation_gap"]);
  });

  it("treats database-expired metadata as degraded without a client watermark write", async () => {
    vi.setSystemTime("2026-09-07T10:30:00Z");
    const { db, calls } = fakeDb({
      watermark: "2026-09-07T09:00:00Z",
      rpc: () => ({ data: { status: "expired", rows: 0 }, error: null }),
    });
    await expect(recoverHourly(db, "region_hourly", new Date("2026-09-07T09:00:00Z")))
      .rejects.toThrow("recovery has expired raw input");
    expect(calls.some((call) => call.name === "record_collector_aggregation_watermark"))
      .toBe(false);
  });

  it("replays the same retained watermark so late rows can change the aggregate", async () => {
    vi.setSystemTime("2026-09-07T10:30:00Z");
    const { db, calls } = fakeDb({
      watermark: "2026-09-07T09:00:00Z",
      rpc: () => ({ data: { status: "retained", rows: 7 }, error: null }),
    });
    await expect(recoverHourly(db, "path_hourly", new Date("2026-09-07T09:00:00Z")))
      .resolves.toBe(7);
    expect(calls[0].args.p_hour).toBe("2026-09-07T09:00:00.000Z");
  });

  it("does not fall back to an unprotected compute RPC after wrapper failure", async () => {
    vi.setSystemTime("2026-09-07T10:30:00Z");
    const { db, calls } = fakeDb({
      rpc: () => ({ data: null, error: { message: "lock failed" } }),
    });
    await expect(recoverHourly(db, "band_hourly", new Date("2026-09-07T09:00:00Z")))
      .rejects.toThrow("protected aggregation failed: lock failed");
    expect(calls.map((call) => call.name)).toEqual(["compute_retained_spot_hour"]);
  });

  it.each([
    null,
    {},
    { status: "unknown", rows: 1 },
    { status: "retained", rows: -1 },
    { status: "retained", rows: 1.5 },
  ])("rejects invalid wrapper metadata %#", async (data) => {
    vi.setSystemTime("2026-09-07T10:30:00Z");
    const { db } = fakeDb({ rpc: () => ({ data, error: null }) });
    await expect(recoverHourly(db, "band_hourly", new Date("2026-09-07T09:00:00Z")))
      .rejects.toThrow("returned invalid recovery metadata");
  });

  it("allows a retained zero-row result without claiming completeness", async () => {
    vi.setSystemTime("2026-09-07T10:30:00Z");
    const { db } = fakeDb({
      rpc: () => ({ data: { status: "retained", rows: 0 }, error: null }),
    });
    await expect(recoverHourly(db, "band_hourly", new Date("2026-09-07T09:00:00Z")))
      .resolves.toBe(0);
  });

  it("routes all three public aggregators through their protected names", async () => {
    vi.setSystemTime("2026-09-08T10:30:00Z");
    const { db, calls } = fakeDb();
    await computeHourlyStats(db);
    await computePathHourlyStats(db);
    await computeRegionHourlyStats(db);
    const protectedCalls = calls.filter((call) => call.name === "compute_retained_spot_hour");
    expect(protectedCalls.map((call) => call.args.p_aggregation)).toEqual([
      "band_hourly",
      "path_hourly",
      "region_hourly",
    ]);
    expect(calls.some((call) => call.name === "compute_band_hourly_stats")).toBe(false);
    expect(calls.some((call) => call.name === "compute_path_hourly_stats")).toBe(false);
    expect(calls.some((call) => call.name === "compute_region_hourly_stats")).toBe(false);
  });
});
