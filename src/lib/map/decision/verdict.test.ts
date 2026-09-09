import { describe, expect, it } from "vitest";
import type { DXSpot } from "@/types/dxcluster";
import { highestBandBelow, buildDecisionReport } from "./verdict";

const NY = { lat: 40.7, lon: -74.0, grid: "FN30" };
const LONDON = { lat: 51.5, lon: -0.1, grid: "IO91", name: "G4ABC" };
const AFTERNOON = new Date("2026-06-21T16:00:00Z");

const nearbySpot: DXSpot = {
  id: "s1",
  spotter: "W1AW",
  dx: "G4ABC",
  frequency: 14074,
  comment: "",
  time: new Date("2026-06-21T15:50:00Z"),
  band: "20m",
  dxLat: 51.6,
  dxLon: -0.2,
};

describe("highestBandBelow", () => {
  it("returns the highest band whose lower edge is under the MUF", () => {
    expect(highestBandBelow(21.5)).toBe("15m");
    expect(highestBandBelow(14.2)).toBe("20m");
    expect(highestBandBelow(3)).toBe("160m");
    expect(highestBandBelow(1)).toBeNull();
  });
});

describe("buildDecisionReport", () => {
  it("assembles almanac, path-sampled MUF, nearby spots, and a one-line verdict with links", () => {
    const report = buildDecisionReport({
      qth: NY,
      target: LONDON,
      date: AFTERNOON,
      pathMode: "short",
      sfi: 150,
      sfiObservedAt: "2026-06-21T15:00:00.000Z",
      sfiFetchedAt: "2026-06-21T15:02:00.000Z",
      kp: 2,
      txPowerWatts: 100,
      mode: "FT8",
      spots: [nearbySpot],
      spotsObservedAt: Date.parse("2026-06-21T15:50:00Z"),
      spotsFetchedAt: Date.parse("2026-06-21T15:51:00Z"),
      radiusKm: 500,
      nowCast: {
        band: "20m",
        issueTime: "2026-06-21T15:00:00.000Z",
        fetchedAt: "2026-06-21T16:01:00.000Z",
      },
    });

    expect(report.almanac.qth.utcTime).toBe("16:00");
    expect(report.almanac.target.localMeanTime).toBeTruthy();
    expect(report.pathMuf).not.toBeNull();
    expect(report.pathMuf!.evidence.basis).toMatch(/ITU-R P\.533/);
    expect(report.pathMuf!.evidence.basis).not.toMatch(/VOACAP/i);
    expect(report.nearby.count).toBe(1);
    expect(report.verdict.tone).toBe("open");
    expect(report.verdict.line).toMatch(/Workable now/i);
    expect(report.verdict.wizardHref).toContain("/dx?");
    expect(report.verdict.wizardHref).toContain("lat=51.5");
    expect(report.verdict.plannerHref).toMatch(/^\/planner\?grid=/);
    expect(report.verdict.evidence.observedAt).toBe("2026-06-21T15:00:00.000Z");
  });

  it("does not treat an assumed SFI as an observation", () => {
    const report = buildDecisionReport({
      qth: NY,
      target: LONDON,
      date: AFTERNOON,
      pathMode: "short",
      sfi: null,
      kp: 2,
      txPowerWatts: 100,
      mode: "SSB",
      spots: [],
      radiusKm: 500,
    });
    expect(report.pathMuf!.evidence.basis).toContain("assumed SFI");
    expect(report.pathMuf!.evidence.observedAt).toBeNull();
  });
});
