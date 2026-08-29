import { describe, expect, it } from "vitest";
import { evaluateDbSize, type DbSizeReport } from "./dbSizeGuard.js";

const MB = 1024 * 1024;

function report(databaseMb: number): DbSizeReport {
  return {
    database_bytes: databaseMb * MB,
    captured_at: "2026-08-29T22:00:00Z",
    tables: [
      { table_name: "path_hourly_stats", total_bytes: 557 * MB, approx_rows: 3_000_000 },
      { table_name: "collector_health", total_bytes: 38 * MB, approx_rows: 300_000 },
      { table_name: "spot_history", total_bytes: 28 * MB, approx_rows: 40_000 },
      { table_name: "band_hourly_stats", total_bytes: 9 * MB, approx_rows: 22_000 },
    ],
  };
}

describe("evaluateDbSize", () => {
  it("passes when the database is within budget", () => {
    const verdict = evaluateDbSize(report(671), 3072);
    expect(verdict.ok).toBe(true);
    expect(verdict.totalMb).toBe(671);
    expect(verdict.budgetMb).toBe(3072);
    expect(verdict.message).toContain("within");
  });

  it("fails when the database exceeds the budget", () => {
    const verdict = evaluateDbSize(report(3500), 3072);
    expect(verdict.ok).toBe(false);
    expect(verdict.totalMb).toBe(3500);
    expect(verdict.message).toContain("EXCEEDS");
  });

  it("names the top offending tables in the message", () => {
    const verdict = evaluateDbSize(report(3500), 3072);
    expect(verdict.message).toContain("path_hourly_stats=557MB");
    expect(verdict.message).toContain("collector_health=38MB");
    expect(verdict.message).toContain("spot_history=28MB");
    expect(verdict.message).not.toContain("band_hourly_stats");
  });

  it("treats exactly-at-budget as within budget", () => {
    expect(evaluateDbSize(report(3072), 3072).ok).toBe(true);
    expect(evaluateDbSize(report(3073), 3072).ok).toBe(false);
  });
});
