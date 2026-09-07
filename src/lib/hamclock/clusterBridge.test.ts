import { describe, expect, it } from "vitest";
import { filterBridgeSpotAge, mergeClusterBridgeSpot, readClusterBridgeSpot } from "./clusterBridge";

const NOW = Date.parse("2026-09-07T19:00:00Z");
const payload = (id: string, offsetMs = 0) => ({
  id, dx: id, spotter: "N0TEST", frequency: 14_074, mode: "FT8", band: "20m",
  comment: "fixture", time: new Date(NOW + offsetMs).toISOString(),
});

describe("cluster bridge snapshot", () => {
  it("validates transport reports and accepts at most one minute of clock skew", () => {
    expect(readClusterBridgeSpot(payload("K1TEST", 60_000), NOW)?.dx).toBe("K1TEST");
    for (const invalid of [null, { ...payload("K1"), id: "" }, { ...payload("K1"), frequency: -1 },
      { ...payload("K1"), time: "bad" }, payload("K1", 60_001), { ...payload("K1"), dxGrid: [] }]) {
      expect(readClusterBridgeSpot(invalid, NOW)).toBeNull();
    }
  });

  it("deduplicates, ages, sorts and bounds a shared snapshot", () => {
    const older = readClusterBridgeSpot(payload("old", -30_000), NOW)!;
    const replacement = readClusterBridgeSpot(payload("old", 10_000), NOW)!;
    const current = readClusterBridgeSpot(payload("current"), NOW)!;
    expect(mergeClusterBridgeSpot([older, current], replacement, 30, 50, NOW).map((spot) => spot.id))
      .toEqual(["old", "current"]);
    const expired = readClusterBridgeSpot(payload("expired", -30 * 60_000 - 1), NOW)!;
    expect(filterBridgeSpotAge([expired], 30, NOW)).toEqual([]);
    const many = Array.from({ length: 25 }, (_, index) =>
      readClusterBridgeSpot(payload(`K${index}`, -index), NOW)!);
    expect(mergeClusterBridgeSpot(many, current, 30, 10, NOW)).toHaveLength(10);
  });
});
