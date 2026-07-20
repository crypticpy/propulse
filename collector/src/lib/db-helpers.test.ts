import { describe, expect, it, vi } from "vitest";
import { insertSpots } from "./db-helpers.js";
import type { NormalizedSpot } from "../types.js";

function spot(index: number): NormalizedSpot {
  return {
    source: "pskreporter",
    spotted_at: `2026-07-19T12:${String(index % 60).padStart(2, "0")}:00Z`,
    tx_callsign: `TX${index}`,
    tx_grid: "FN31",
    tx_lat: 41,
    tx_lon: -72,
    rx_callsign: `RX${index}`,
    rx_grid: "EM10",
    rx_lat: 30,
    rx_lon: -97,
    frequency_khz: 14074,
    band: "20m",
    mode: "FT8",
    snr: -10,
    wpm: null,
    comment: null,
    dxcc: null,
    continent: null,
  };
}

describe("insertSpots", () => {
  it("uses bounded 500-row calls to the audited hot-store RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const db = { rpc };
    const rows = Array.from({ length: 501 }, (_, index) => spot(index));

    await expect(
      insertSpots(db as never, rows, "pskreporter"),
    ).resolves.toBe(501);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "ingest_spot_history_rows", {
      p_rows: rows.slice(0, 500),
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "ingest_spot_history_rows", {
      p_rows: rows.slice(500),
    });
  });

  it("preserves the database error in the collector failure", async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({
        error: { message: "partition missing" },
      }),
    };
    await expect(insertSpots(db as never, [spot(1)], "pskreporter"))
      .rejects.toThrow("[pskreporter] Insert failed: partition missing");
  });
});
