import { describe, expect, it } from "vitest";

import {
  PHYSICS_ALGO_VERSION,
  buildPhysicsSnapshotRows,
  computePhysicsBandScores,
  hourBucketUtc,
} from "./forecastSnapshot.js";

describe("computePhysicsBandScores", () => {
  it("scores all 11 bands with p_open in [0, 1]", () => {
    const scores = computePhysicsBandScores(3, 150);
    expect(scores).toHaveLength(11);
    for (const score of scores) {
      expect(score.pOpen).toBeGreaterThanOrEqual(0);
      expect(score.pOpen).toBeLessThanOrEqual(1);
    }
  });

  it("matches the frontend calculation for 20m at kp=2 sfi=150", () => {
    // base = (150/200) * (1 - 2/9) = 0.5833; day ×0.8 = 0.467 → Good,
    // night ×0.7 = 0.408 → Fair; p_open = (0.7 + 0.45) / 2
    const band20 = computePhysicsBandScores(2, 150).find((s) => s.band === "20m");
    expect(band20?.dayCondition).toBe("Good");
    expect(band20?.nightCondition).toBe("Fair");
    expect(band20?.pOpen).toBeCloseTo(0.575, 5);
  });

  it("keeps 160m day-dead and scores only its night side", () => {
    const band160 = computePhysicsBandScores(2, 150).find(
      (s) => s.band === "160m",
    );
    expect(band160?.dayCondition).toBe("Poor");
    expect(band160?.nightCondition).toBe("Good");
    expect(band160?.pOpen).toBeCloseTo(0.45, 5);
  });

  it("halves effective SFI below a band's minSfi gate (10m at sfi=90)", () => {
    const band10 = computePhysicsBandScores(2, 90).find((s) => s.band === "10m");
    expect(band10?.dayCondition).toBe("Poor");
    expect(band10?.nightCondition).toBe("Poor");
    expect(band10?.pOpen).toBeCloseTo(0.2, 5);
  });

  it("flags 6m Aurora at kp>=5 regardless of SFI", () => {
    const band6 = computePhysicsBandScores(5, 300).find((s) => s.band === "6m");
    expect(band6?.dayCondition).toBe("Aurora");
    expect(band6?.nightCondition).toBe("Poor");
    expect(band6?.pOpen).toBeCloseTo(0.2, 5);
  });
});

describe("hourBucketUtc", () => {
  it("truncates to the UTC hour boundary", () => {
    expect(hourBucketUtc(Date.parse("2026-08-29T12:34:56.789Z"))).toBe(
      "2026-08-29T12:00:00.000Z",
    );
    expect(hourBucketUtc(Date.parse("2026-08-29T12:00:00.000Z"))).toBe(
      "2026-08-29T12:00:00.000Z",
    );
  });
});

describe("buildPhysicsSnapshotRows", () => {
  it("builds one physics row per band for the current hour", () => {
    const rows = buildPhysicsSnapshotRows(
      Date.parse("2026-08-29T12:34:00Z"),
      2,
      150,
      "2026-08-29T12:30:00Z",
    );

    expect(rows).toHaveLength(11);
    for (const row of rows) {
      expect(row.hour_utc).toBe("2026-08-29T12:00:00.000Z");
      expect(row.source).toBe("physics");
      expect(row.horizon_hours).toBe(0);
      expect(row.p_open).toBeGreaterThanOrEqual(0);
      expect(row.p_open).toBeLessThanOrEqual(1);
      expect(row.meta.algo).toBe(PHYSICS_ALGO_VERSION);
      expect(row.meta.kp).toBe(2);
      expect(row.meta.sfi).toBe(150);
      expect(row.meta.solar_captured_at).toBe("2026-08-29T12:30:00Z");
    }
    expect(new Set(rows.map((r) => r.band)).size).toBe(11);
  });
});
