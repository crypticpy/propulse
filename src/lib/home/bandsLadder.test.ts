import { describe, expect, it } from "vitest";
import {
  buildBandsLadder,
  dominantMode,
  formatRatio,
  formatShare,
  LADDER_BANDS,
  typicalRatio,
  verdictIsCurrent,
  VERDICT_MAX_AGE_MS,
} from "./bandsLadder";
import type { BandActivityStatus } from "@/hooks/useBandActivity";
import type { LadderState } from "@/lib/verdict/ladder";

function status(
  band: string,
  overrides: Partial<BandActivityStatus> = {},
): BandActivityStatus {
  return {
    band,
    count60m: 0,
    obs20m: 0,
    reporters20m: 0,
    count10mRecent: 0,
    count10mPrior: 0,
    sourceCounts60m: {},
    modeObs20m: {},
    thresholds: null,
    median60m: null,
    sampleCount: null,
    level: null,
    trend: "steady",
    crowded: false,
    ...overrides,
  };
}

describe("buildBandsLadder", () => {
  it("renders every HF band 160 to 10 m in wavelength order, feed or no feed", () => {
    const rows = buildBandsLadder([status("20m", { obs20m: 5 })], new Map());
    expect(rows.map((row) => row.band)).toEqual([...LADDER_BANDS]);
    expect(rows[0].band).toBe("160m");
    expect(rows[9].band).toBe("10m");
    expect(rows[0].obs20m).toBe(0);
    expect(rows[0].verdict).toBeNull();
  });

  it("keeps bands above the HF ladder after 10 m instead of dropping them", () => {
    const rows = buildBandsLadder(
      [status("6m", { obs20m: 3 }), status("2m", { obs20m: 1 })],
      new Map(),
    );
    expect(rows.slice(10).map((row) => row.band)).toEqual(["6m", "2m"]);
  });

  it("computes share of the window and the bar relative to the busiest band", () => {
    const rows = buildBandsLadder(
      [
        status("40m", { obs20m: 75 }),
        status("20m", { obs20m: 25 }),
        status("80m", { obs20m: 0 }),
      ],
      new Map(),
    );
    const byBand = new Map(rows.map((row) => [row.band, row]));
    expect(byBand.get("40m")!.share).toBeCloseTo(0.75);
    expect(byBand.get("40m")!.relative).toBe(1);
    expect(byBand.get("20m")!.share).toBeCloseTo(0.25);
    expect(byBand.get("20m")!.relative).toBeCloseTo(1 / 3);
    expect(byBand.get("80m")!.share).toBe(0);
    expect(byBand.get("80m")!.relative).toBe(0);
  });

  it("leaves share and bar at zero rather than dividing by an empty window", () => {
    const rows = buildBandsLadder([status("20m")], new Map());
    expect(rows.every((row) => row.share === 0 && row.relative === 0)).toBe(
      true,
    );
  });

  it("carries the scored verdict for the bands the feed scored, and null elsewhere", () => {
    const verdicts = new Map<string, LadderState>([
      ["20m", "verified"],
      ["40m", "hot"],
    ]);
    const rows = buildBandsLadder([status("20m", { obs20m: 4 })], verdicts);
    const byBand = new Map(rows.map((row) => [row.band, row]));
    expect(byBand.get("20m")!.verdict).toBe("verified");
    expect(byBand.get("40m")!.verdict).toBe("hot");
    expect(byBand.get("15m")!.verdict).toBeNull();
  });

  it("reports no verdict for every band when the ladder feed is empty", () => {
    const rows = buildBandsLadder([status("20m", { obs20m: 4 })], new Map());
    expect(rows.every((row) => row.verdict === null)).toBe(true);
  });

  it("takes the ratio, trend and top mode from the row's own feed entry", () => {
    const rows = buildBandsLadder(
      [
        status("20m", {
          count60m: 320,
          obs20m: 40,
          median60m: 200,
          sampleCount: 88,
          trend: "rising",
          modeObs20m: { digital: 30, cw: 8, phone: 2 },
        }),
      ],
      new Map(),
    );
    const row = rows.find((entry) => entry.band === "20m")!;
    expect(row.ratio).toBeCloseTo(1.6);
    expect(row.trend).toBe("rising");
    expect(row.topMode).toEqual({ label: "Digital", count: 30 });
  });
});

describe("typicalRatio", () => {
  it("withholds the ratio when the climatology cell is thin, absent or zero", () => {
    expect(typicalRatio(100, 50, 88)).toBe(2);
    expect(typicalRatio(100, 50, 13)).toBeNull();
    expect(typicalRatio(100, 50, null)).toBeNull();
    expect(typicalRatio(100, null, 88)).toBeNull();
    expect(typicalRatio(100, 0, 88)).toBeNull();
  });
});

describe("dominantMode", () => {
  it("names the busiest mode class and ignores empty maps", () => {
    expect(dominantMode({ cw: 4, digital: 9 })).toEqual({
      label: "Digital",
      count: 9,
    });
    expect(dominantMode({ digital: 0 })).toBeNull();
    expect(dominantMode(undefined)).toBeNull();
  });
});

describe("formatShare / formatRatio", () => {
  it("never rounds a band that was heard down to a flat zero", () => {
    expect(formatShare(0)).toBe("0.0%");
    expect(formatShare(0.0004)).toBe("<0.1%");
    expect(formatShare(0.061)).toBe("6.1%");
    expect(formatRatio(1.62)).toBe("1.6× typical");
    expect(formatRatio(0.02)).toBe("<0.1× typical");
    expect(formatRatio(0)).toBe("0.0× typical");
  });
});

describe("verdictIsCurrent", () => {
  it("treats a ladder that has stopped ticking, or never landed, as no verdict", () => {
    const now = Date.parse("2026-09-07T12:00:00Z");
    expect(verdictIsCurrent(now - 60_000, now)).toBe(true);
    expect(verdictIsCurrent(now - VERDICT_MAX_AGE_MS, now)).toBe(false);
    expect(verdictIsCurrent(undefined, now)).toBe(false);
    expect(verdictIsCurrent(Number.NaN, now)).toBe(false);
  });
});
