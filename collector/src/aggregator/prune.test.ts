import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectorConfig } from "../types.js";
import { pruneOldData } from "./prune.js";

function config(
  pruningEnabled: boolean,
  forecastCompactionEnabled = false,
): CollectorConfig {
  return {
    supabaseUrl: "https://example.supabase.co",
    supabaseServiceKey: "test-service-key",
    logLevel: "error",
    enabledSources: new Set(),
    healthPort: 8080,
    aggregationSettleMinutes: 20,
    pollIntervals: {
      pskreporter: 300_000,
      rbn: 300_000,
      dxcluster: 120_000,
      solar: 900_000,
      forecasts: 21_600_000,
      satellites: 7_200_000,
      aggregator: 300_000,
      forecastSnapshot: 300_000,
      prune: 3_600_000,
      dbSizeGuard: 21_600_000,
      pathArchive: 3_600_000,
      bandClimatology: 86_400_000,
    },
    retention: { spots: 7, health: 7, solar: 120, tle: 7 },
    archive: {
      pruningEnabled,
      forecastCompactionEnabled,
      pruneBatchSize: 12_345,
      pathStats: { hotDays: 90, pruneEnabled: false, maxDaysPerRun: 2 },
    },
    dbSizeBudgetMb: 3072,
  };
}

describe("archive-gated retention maintenance", () => {
  it("does not call any deletion path while the environment gate is false", async () => {
    const rpc = vi.fn();
    const db = { rpc } as unknown as SupabaseClient;

    await pruneOldData(db, config(false), new Date("2026-07-20T01:00:00Z"));

    expect(rpc).not.toHaveBeenCalled();
  });

  it("delegates one bounded run to the database safety contract", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { archived: null }, error: null });
    const db = { rpc } as unknown as SupabaseClient;
    const now = new Date("2026-07-21T01:00:00Z");

    await pruneOldData(db, config(true), now);

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "run_propagation_retention_maintenance",
      {
        p_archive_pruning_enabled: true,
        p_batch_size: 12_345,
        p_now: now.toISOString(),
      },
    );
  });

  it("uses a separate bounded RPC for enabled forecast compaction", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { archived: null }, error: null })
      .mockResolvedValueOnce({ data: { compacted_rows: 2 }, error: null });
    const db = { rpc } as unknown as SupabaseClient;
    const now = new Date("2026-07-24T01:00:00Z");

    await pruneOldData(db, config(true, true), now);

    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "run_propagation_forecast_payload_compaction",
      {
        p_archive_forecast_compaction_enabled: true,
        p_batch_size: 10_000,
        p_now: now.toISOString(),
      },
    );
  });

  it("can compact forecast payloads without enabling row pruning", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { compacted_rows: 2 },
      error: null,
    });
    const db = { rpc } as unknown as SupabaseClient;
    const now = new Date("2026-07-25T01:00:00Z");

    await pruneOldData(db, config(false, true), now);

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "run_propagation_forecast_payload_compaction",
      {
        p_archive_forecast_compaction_enabled: true,
        p_batch_size: 10_000,
        p_now: now.toISOString(),
      },
    );
  });

  it("surfaces database gate failures instead of reporting success", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: "dataset restore gate has not passed",
        code: "P0001",
        details: "restore fixture missing",
        hint: "run the isolated restore drill",
      },
    });
    const db = { rpc } as unknown as SupabaseClient;

    await expect(
      pruneOldData(db, config(true), new Date("2026-07-22T01:00:00Z")),
    ).rejects.toThrow("dataset restore gate has not passed");
    await expect(
      pruneOldData(db, config(true), new Date("2026-07-23T01:00:00Z")),
    ).rejects.toMatchObject({ postgresCode: "P0001" });
  });
});
