import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { globalLitFraction } from "../lib/sun.js";

import {
  PHYSICS_ALGO_VERSION,
  SNAPSHOT_HORIZONS_H,
  blendPOpen,
  buildPhysicsHorizonRows,
  buildPhysicsSnapshotRows,
  collectForecastSnapshot,
  computePhysicsBandScores,
  hourBucketUtc,
} from "./forecastSnapshot.js";

describe("computePhysicsBandScores", () => {
  it("scores all 11 bands with blended p_open in [0, 1]", () => {
    const scores = computePhysicsBandScores(3, 150);
    expect(scores).toHaveLength(11);
    for (const score of scores) {
      for (const fLit of [0, 0.25, 0.5, 1]) {
        const pOpen = blendPOpen(score, fLit);
        expect(pOpen).toBeGreaterThanOrEqual(0);
        expect(pOpen).toBeLessThanOrEqual(1);
      }
    }
  });

  it("matches the frontend calculation for 20m at kp=2 sfi=150", () => {
    // base = (150/200) * (1 - 2/9) = 0.5833; day ×0.8 = 0.467 → Good,
    // night ×0.7 = 0.408 → Fair; fLit 0.5 reproduces the v1 mean.
    const band20 = computePhysicsBandScores(2, 150).find((s) => s.band === "20m");
    expect(band20?.dayCondition).toBe("Good");
    expect(band20?.nightCondition).toBe("Fair");
    expect(blendPOpen(band20!, 0.5)).toBeCloseTo(0.575, 5);
    expect(blendPOpen(band20!, 1)).toBeCloseTo(0.7, 5);
    expect(blendPOpen(band20!, 0)).toBeCloseTo(0.45, 5);
  });

  it("keeps 160m day-dead and scores only its night side", () => {
    const band160 = computePhysicsBandScores(2, 150).find(
      (s) => s.band === "160m",
    );
    expect(band160?.dayCondition).toBe("Poor");
    expect(band160?.nightCondition).toBe("Good");
    expect(blendPOpen(band160!, 0.5)).toBeCloseTo(0.45, 5);
    // Full daylight: only the dead day side remains.
    expect(blendPOpen(band160!, 1)).toBeCloseTo(0.2, 5);
  });

  it("halves effective SFI below a band's minSfi gate (10m at sfi=90)", () => {
    const band10 = computePhysicsBandScores(2, 90).find((s) => s.band === "10m");
    expect(band10?.dayCondition).toBe("Poor");
    expect(band10?.nightCondition).toBe("Poor");
    expect(blendPOpen(band10!, 0.5)).toBeCloseTo(0.2, 5);
  });

  it("flags 6m Aurora at kp>=5 regardless of SFI", () => {
    const band6 = computePhysicsBandScores(5, 300).find((s) => s.band === "6m");
    expect(band6?.dayCondition).toBe("Aurora");
    expect(band6?.nightCondition).toBe("Poor");
    expect(blendPOpen(band6!, 0.5)).toBeCloseTo(0.2, 5);
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

describe("collectForecastSnapshot", () => {
  interface FakeDb {
    db: SupabaseClient;
    upserts: unknown[];
    healthInserts: Array<Record<string, unknown>>;
  }

  function fakeDb(solarRow: Record<string, unknown> | null): FakeDb {
    const upserts: unknown[] = [];
    const healthInserts: Array<Record<string, unknown>> = [];
    const db = {
      from(table: string) {
        if (table === "solar_snapshots") {
          return {
            select: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: solarRow, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "forecast_snapshots") {
          return {
            upsert: async (rows: unknown) => {
              upserts.push(rows);
              return { error: null };
            },
          };
        }
        if (table === "collector_health") {
          return {
            insert: async (row: Record<string, unknown>) => {
              healthInserts.push(row);
              return { error: null };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
      rpc: async () => ({ error: null }),
    } as unknown as SupabaseClient;
    return { db, upserts, healthInserts };
  }

  it("writes snapshot rows for a fresh solar reading", async () => {
    const { db, upserts, healthInserts } = fakeDb({
      captured_at: new Date(Date.now() - 10 * 60_000).toISOString(),
      kp_index: 2,
      sfi: 150,
    });

    await collectForecastSnapshot(db);

    expect(upserts).toHaveLength(1);
    // 10 HF bands × (horizon 0 + the BH3 lead-time horizons)
    expect(upserts[0]).toHaveLength(10 * (1 + SNAPSHOT_HORIZONS_H.length));
    expect(healthInserts[0]?.status).toBe("ok");
  });

  it("rejects a solar timestamp from the future without writing rows", async () => {
    const { db, upserts, healthInserts } = fakeDb({
      captured_at: new Date(Date.now() + 3600_000).toISOString(),
      kp_index: 2,
      sfi: 150,
    });

    await collectForecastSnapshot(db);

    expect(upserts).toHaveLength(0);
    expect(healthInserts[0]?.status).toBe("error");
    expect(healthInserts[0]?.error_message).toMatch(/stale or in the future/);
  });

  it("rejects a stale solar timestamp without writing rows", async () => {
    const { db, upserts, healthInserts } = fakeDb({
      captured_at: new Date(Date.now() - 4 * 3600_000).toISOString(),
      kp_index: 2,
      sfi: 150,
    });

    await collectForecastSnapshot(db);

    expect(upserts).toHaveLength(0);
    expect(healthInserts[0]?.status).toBe("error");
  });
});

describe("buildPhysicsSnapshotRows", () => {
  it("builds one physics row per HF band for the current hour", () => {
    const rows = buildPhysicsSnapshotRows(
      Date.parse("2026-08-29T12:34:00Z"),
      2,
      150,
      "2026-08-29T12:30:00Z",
    );

    expect(rows).toHaveLength(10);
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
      expect(row.meta.f_lit).toBeGreaterThanOrEqual(0);
      expect(row.meta.f_lit).toBeLessThanOrEqual(1);
    }
    // 12:34Z: EU + eastern NA in daylight — the ham-weighted planet is
    // majority-lit, so the blend must lean day-side, not sit at 0.5.
    expect(rows[0].meta.f_lit).toBeGreaterThan(0.5);
    expect(new Set(rows.map((r) => r.band)).size).toBe(10);
    // The collector never ingests VHF, so band_hourly_stats has no 6m truth
    // — logging a 6m snapshot would poison the eval with fabricated zeros.
    expect(rows.some((r) => r.band === "6m")).toBe(false);
  });
});

describe("buildPhysicsHorizonRows", () => {
  it("targets future hour buckets with the lit fraction of the target hour", () => {
    const nowMs = Date.parse("2026-08-29T12:34:00Z");
    const rows = buildPhysicsHorizonRows(nowMs, 2, 150, "2026-08-29T12:30:00Z");

    expect(rows).toHaveLength(10 * SNAPSHOT_HORIZONS_H.length);
    for (const horizon of SNAPSHOT_HORIZONS_H) {
      const horizonRows = rows.filter((r) => r.horizon_hours === horizon);
      expect(horizonRows).toHaveLength(10);
      for (const row of horizonRows) {
        // hour_utc is the TARGET hour (eval joins truth on the row's own
        // hour); horizon_hours records how early the call was issued.
        expect(row.hour_utc).toBe(
          hourBucketUtc(nowMs + horizon * 3600_000),
        );
        expect(row.source).toBe("physics");
        expect(row.p_open).toBeGreaterThanOrEqual(0);
        expect(row.p_open).toBeLessThanOrEqual(1);
        expect(row.meta.algo).toBe(PHYSICS_ALGO_VERSION);
      }
    }

    // Solar persistence: kp/sfi (and so the condition words) are pinned,
    // but f_lit is evaluated at each row's own target hour, not at now.
    const h6 = rows.find((r) => r.horizon_hours === 6 && r.band === "20m")!;
    expect(h6.meta.f_lit).toBe(
      Math.round(globalLitFraction(Date.parse(h6.hour_utc)) * 1000) / 1000,
    );
    const h0fLit = buildPhysicsSnapshotRows(nowMs, 2, 150, "x")[0].meta.f_lit;
    expect(h6.meta.f_lit).not.toBe(h0fLit);
  });

  it("never logs VHF horizons", () => {
    const rows = buildPhysicsHorizonRows(Date.now(), 2, 150, "x");
    expect(rows.some((r) => r.band === "6m")).toBe(false);
  });
});
