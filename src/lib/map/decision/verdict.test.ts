import { describe, expect, it } from "vitest";
import type { DXSpot } from "@/types/dxcluster";
import {
  bandIntersectsWindow,
  buildDecisionReport,
  buildVerdict,
  favoredNowCastHint,
  highestBandBelow,
  highestBandInWindow,
  MIN_NOWCAST_SCORE,
} from "./verdict";
import type { GreylineSummary, NearbySpotsResult, PathMufSample } from "./types";

const NY = { lat: 40.7, lon: -74.0, grid: "FN30" };
const LONDON = { lat: 51.5, lon: -0.1, grid: "IO91", name: "G4ABC" };
const AFTERNOON = new Date("2026-06-21T16:00:00Z");
const COMPUTED = new Date("2026-06-21T16:05:00Z");

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

const quietGreyline: GreylineSummary = {
  active: false,
  start: null,
  end: null,
  label: "No mutual grey-line in the next day",
  evidence: { basis: "test", observedAt: null, fetchedAt: COMPUTED.toISOString() },
};

const emptyNearby: NearbySpotsResult = {
  radiusKm: 500,
  count: 0,
  byBand: {},
  hits: [],
  evidence: {
    basis: "Observed spots within 500 km of the target (spot store)",
    observedAt: null,
    fetchedAt: COMPUTED.toISOString(),
  },
};

function fakeMuf(overrides: Partial<PathMufSample> = {}): PathMufSample {
  return {
    muf: 14.5,
    fot: 12.325,
    luf: 5,
    hpf: 16.675,
    hopCount: 2,
    limitingHop: 0,
    limitingLat: 45,
    limitingLon: -40,
    hops: [],
    evidence: {
      basis: "ITU-R P.533 ray-trace test",
      observedAt: "2026-06-21T15:00:00.000Z",
      fetchedAt: "2026-06-21T15:02:00.000Z",
    },
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<Parameters<typeof buildDecisionReport>[0]> = {},
): Parameters<typeof buildDecisionReport>[0] {
  return {
    qth: NY,
    target: LONDON,
    date: AFTERNOON,
    computedAt: COMPUTED,
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
    ...overrides,
  };
}

describe("highestBandBelow", () => {
  it("returns the highest band whose lower edge is under the MUF", () => {
    expect(highestBandBelow(21.5)).toBe("15m");
    expect(highestBandBelow(14.2)).toBe("20m");
    expect(highestBandBelow(3)).toBe("160m");
    expect(highestBandBelow(1)).toBeNull();
  });
});

describe("highestBandInWindow", () => {
  it("picks the highest band that intersects (LUF, MUF)", () => {
    expect(highestBandInWindow(5, 14.5)).toBe("20m");
    expect(highestBandInWindow(12, 21.5)).toBe("15m");
  });

  it("returns null when LUF is at or above MUF", () => {
    expect(highestBandInWindow(16, 14)).toBeNull();
    expect(highestBandInWindow(14.5, 14.5)).toBeNull();
    expect(bandIntersectsWindow("20m", 16, 14)).toBe(false);
  });
});

describe("favoredNowCastHint", () => {
  it("ignores physics fallback rows and scores below the floor", () => {
    const predictions = new Map([
      [
        "20m",
        {
          band: "20m",
          profile: "physics",
          personalized_probability: 0.9,
          core_probability: 0.9,
          issue_time: "2026-06-21T15:00:00.000Z",
        },
      ],
      [
        "40m",
        {
          band: "40m",
          profile: "nowcast",
          personalized_probability: 0.2,
          core_probability: 0.2,
          issue_time: "2026-06-21T15:00:00.000Z",
        },
      ],
      [
        "15m",
        {
          band: "15m",
          profile: "nowcast",
          personalized_probability: 0.6,
          core_probability: 0.55,
          issue_time: "2026-06-21T15:00:00.000Z",
        },
      ],
    ]);
    expect(
      favoredNowCastHint(["20m", "40m", "15m"], predictions, MIN_NOWCAST_SCORE),
    ).toEqual({
      band: "15m",
      issueTime: "2026-06-21T15:00:00.000Z",
      fetchedAt: "2026-06-21T15:00:00.000Z",
    });
  });
});

describe("buildVerdict", () => {
  it("is closed when LUF exceeds MUF", () => {
    const verdict = buildVerdict(
      baseInput({ nowCast: null, spots: [] }),
      fakeMuf({ muf: 12, luf: 16, fot: 10.2, hpf: 13.8 }),
      emptyNearby,
      quietGreyline,
    );
    expect(verdict.tone).toBe("closed");
    expect(verdict.bestBand).toBeNull();
    expect(verdict.line).toMatch(/Closed now/i);
  });

  it("does not override the physics band when NowCast is outside the window", () => {
    const verdict = buildVerdict(
      baseInput({
        nowCast: {
          band: "10m",
          issueTime: "2026-06-21T15:00:00.000Z",
          fetchedAt: "2026-06-21T16:01:00.000Z",
        },
        spots: [],
      }),
      fakeMuf(),
      emptyNearby,
      quietGreyline,
    );
    expect(verdict.tone).toBe("open");
    expect(verdict.bestBand).toBe("20m");
    expect(verdict.line).toMatch(/NowCast names 10m/);
    expect(verdict.line).not.toMatch(/NowCast agrees/);
    expect(verdict.line).not.toMatch(/NowCast favors 10m/);
  });

  it("says NowCast agrees when it matches the physics band", () => {
    const verdict = buildVerdict(
      baseInput({ spots: [] }),
      fakeMuf(),
      emptyNearby,
      quietGreyline,
    );
    expect(verdict.bestBand).toBe("20m");
    expect(verdict.line).toMatch(/NowCast agrees/);
  });

  it("favors an in-window NowCast band that differs from physics", () => {
    const verdict = buildVerdict(
      baseInput({
        nowCast: {
          band: "40m",
          issueTime: "2026-06-21T15:00:00.000Z",
          fetchedAt: "2026-06-21T16:01:00.000Z",
        },
        spots: [],
      }),
      fakeMuf(),
      emptyNearby,
      quietGreyline,
    );
    expect(verdict.bestBand).toBe("40m");
    expect(verdict.line).toMatch(/NowCast favors 40m/);
  });

  it("uses window tone only when greyline starts within two hours", () => {
    const soon = buildVerdict(
      baseInput({ nowCast: null, spots: [] }),
      fakeMuf({ muf: 8.5, luf: 3, fot: 7.2, hpf: 9.8 }),
      emptyNearby,
      {
        ...quietGreyline,
        start: "2026-06-21T17:30:00.000Z",
        end: "2026-06-21T18:10:00.000Z",
        label: "Mutual grey-line 17:30–18:10z",
      },
    );
    expect(soon.tone).toBe("window");
    expect(soon.line).toMatch(/try 40m/);

    const far = buildVerdict(
      baseInput({ nowCast: null, spots: [] }),
      fakeMuf({ muf: 8.5, luf: 3, fot: 7.2, hpf: 9.8 }),
      emptyNearby,
      {
        ...quietGreyline,
        start: "2026-06-22T12:00:00.000Z",
        end: "2026-06-22T12:40:00.000Z",
        label: "Mutual grey-line 12:00–12:40z",
      },
    );
    expect(far.tone).toBe("open");
    expect(far.line).toMatch(/Workable now/);
  });
});

describe("buildDecisionReport", () => {
  it("assembles almanac, path-sampled MUF, nearby spots, and a one-line verdict with links", () => {
    const report = buildDecisionReport(baseInput());

    expect(report.generatedAt).toBe(COMPUTED.toISOString());
    expect(report.almanac.qth.utcTime).toBe("16:00");
    expect(report.almanac.qth.evidence.fetchedAt).toBe(COMPUTED.toISOString());
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

  it("returns unknown with no path MUF when SFI is missing", () => {
    const report = buildDecisionReport(baseInput({ sfi: null, nowCast: null }));
    expect(report.pathMuf).toBeNull();
    expect(report.verdict.tone).toBe("unknown");
    expect(report.verdict.line).toMatch(/Need solar flux/i);
    expect(report.verdict.line).not.toMatch(/Workable now/i);
  });

  it("does not throw on an invalid display date", () => {
    const report = buildDecisionReport(
      baseInput({ date: new Date("not-a-date"), sfi: 150 }),
    );
    expect(report.pathMuf).toBeNull();
    expect(report.almanac.qth.utcTime).toBe("—");
    expect(report.generatedAt).toBe(COMPUTED.toISOString());
  });
});
