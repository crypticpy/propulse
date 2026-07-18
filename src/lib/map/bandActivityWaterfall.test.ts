import { describe, expect, it } from "vitest";
import {
  buildBandActivityHistory,
  createBandActivitySnapshot,
} from "@/lib/map/bandActivityWaterfall";

const NOW = Date.UTC(2026, 6, 18, 21, 20, 0);

describe("band activity waterfall", () => {
  it("builds real chronological rows from spot timestamps", () => {
    const rows = buildBandActivityHistory(
      [
        { band: "20m", time: new Date(NOW - 10_000) },
        { band: "20m", time: new Date(NOW - 20_000) },
        { band: "40M", time: new Date(NOW - 45_000).toISOString() },
        { band: "unknown", time: new Date(NOW - 5_000) },
      ],
      NOW,
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].timestamp).toBeLessThan(rows[1].timestamp);
    expect(rows[0].bands["40m"]).toBe(50);
    expect(rows[1].bands["20m"]).toBe(100);
  });

  it("does not invent activity when the feeds are empty", () => {
    expect(buildBandActivityHistory([], NOW)).toEqual([]);
    expect(createBandActivitySnapshot([], NOW)).toBeNull();
  });

  it("keeps low-volume real activity visible", () => {
    const row = createBandActivitySnapshot(
      [{ band: "6m", time: new Date(NOW) }],
      NOW,
    );
    expect(row?.bands["6m"]).toBe(100);
    expect(row?.bands["20m"]).toBe(0);
  });

  it("rejects invalid bucket contracts", () => {
    expect(() => buildBandActivityHistory([], NOW, 0)).toThrow(
      "bucketMs must be a positive finite number",
    );
    expect(() => buildBandActivityHistory([], NOW, Number.NaN)).toThrow(
      "bucketMs must be a positive finite number",
    );
  });
});
