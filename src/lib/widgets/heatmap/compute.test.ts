import { describe, expect, it } from "vitest";
import { BAND_ORDER } from "@/lib/data/bandRanges";
import { LADDER_RANK, type LadderState } from "@/lib/verdict/ladder";
import { PHYSICS_OPEN_ENTER } from "@/lib/verdict/verdictEngine";
import type { DXSpot } from "@/types/dxcluster";
import { buildBaselineLookup } from "./baseline";
import {
  bucketFor,
  computeHeatmap,
  DEFAULT_HEATMAP_WINDOW_MS,
  dxSpotToHeatmapInput,
  LADDER_HUE_PRESET,
  physicsScoreKey,
  PRESETS,
  RATIO_DIVERGING_PRESET,
} from "./compute";
import { HEATMAP_CONTINENTS, type HeatmapCell, type HeatmapSpotInput } from "./types";

const NOW = 1_756_500_000_000; // fixed instant; matches ladder test fixture style
const MIN = 60 * 1000;

// Placeholder callsigns matching the worked examples already in
// src/lib/utils/multipliers.ts's getContinent doc comment.
const NA_DX = "W1ABC";
const EU_DX = "DL2XYZ";
const AS_DX = "JA1ABC";
const OC_DX = "VK2ABC";
const SA_DX = "LU1ABC";
const AF_DX = "ZS1ABC";

function spot(overrides: Partial<HeatmapSpotInput> = {}): HeatmapSpotInput {
  return {
    dx: NA_DX,
    spotter: "K1ABC",
    band: "20m",
    time: new Date(NOW),
    ...overrides,
  };
}

function cell(cells: ReturnType<typeof computeHeatmap>, band: string, continent: string) {
  const found = cells.find((c) => c.band === band && c.continent === continent);
  if (!found) throw new Error(`no cell for ${band}/${continent}`);
  return found;
}

describe("computeHeatmap matrix shape", () => {
  it("returns every band x continent pair even with no spots", () => {
    const cells = computeHeatmap([], { now: NOW });
    expect(cells).toHaveLength(BAND_ORDER.length * HEATMAP_CONTINENTS.length);
    for (const band of BAND_ORDER) {
      for (const continent of HEATMAP_CONTINENTS) {
        const c = cell(cells, band, continent);
        expect(c.count).toBe(0);
        expect(c.reporters).toBe(0);
        expect(c.ladder).toBe("closed");
        expect(c.ratio).toBeNull();
        expect(c.crowded).toBe(false);
        expect(c.window).toEqual({
          startMs: NOW - DEFAULT_HEATMAP_WINDOW_MS,
          endMs: NOW,
        });
      }
    }
  });

  it("resolves continent from the dx callsign when dxContinent is omitted", () => {
    const cells = computeHeatmap(
      [
        spot({ dx: EU_DX, band: "40m" }),
        spot({ dx: AS_DX, band: "40m" }),
        spot({ dx: OC_DX, band: "40m" }),
        spot({ dx: SA_DX, band: "40m" }),
        spot({ dx: AF_DX, band: "40m" }),
      ],
      { now: NOW },
    );
    expect(cell(cells, "40m", "EU").count).toBe(1);
    expect(cell(cells, "40m", "AS").count).toBe(1);
    expect(cell(cells, "40m", "OC").count).toBe(1);
    expect(cell(cells, "40m", "SA").count).toBe(1);
    expect(cell(cells, "40m", "AF").count).toBe(1);
  });

  it("trusts an explicit dxContinent override over the callsign lookup", () => {
    const cells = computeHeatmap(
      [spot({ dx: "XX1FAKE", dxContinent: "OC", band: "15m" })],
      { now: NOW },
    );
    expect(cell(cells, "15m", "OC").count).toBe(1);
  });

  it("drops spots whose continent cannot be resolved instead of throwing", () => {
    expect(() =>
      computeHeatmap([spot({ dx: "###", band: "20m" })], { now: NOW }),
    ).not.toThrow();
    const cells = computeHeatmap([spot({ dx: "###", band: "20m" })], { now: NOW });
    expect(cells.every((c) => c.count === 0)).toBe(true);
  });
});

describe("dedup", () => {
  it("counts the same DX callsign once regardless of spotter count, but counts each spotter", () => {
    const cells = computeHeatmap(
      [
        spot({ dx: NA_DX, spotter: "K1ABC", band: "20m" }),
        spot({ dx: NA_DX, spotter: "K2DEF", band: "20m" }),
        spot({ dx: NA_DX, spotter: "k2def", band: "20m" }), // case-insensitive same spotter
      ],
      { now: NOW },
    );
    const c = cell(cells, "20m", "NA");
    expect(c.count).toBe(1);
    expect(c.reporters).toBe(2);
  });

  it("counts distinct DX callsigns separately", () => {
    const cells = computeHeatmap(
      [spot({ dx: NA_DX, band: "20m" }), spot({ dx: "W9ZZZ", band: "20m" })],
      { now: NOW },
    );
    expect(cell(cells, "20m", "NA").count).toBe(2);
  });
});

describe("windowing", () => {
  it("excludes spots older than the window", () => {
    const cells = computeHeatmap(
      [spot({ time: new Date(NOW - DEFAULT_HEATMAP_WINDOW_MS - MIN) })],
      { now: NOW },
    );
    expect(cell(cells, "20m", "NA").count).toBe(0);
  });

  it("excludes spots after `now`", () => {
    const cells = computeHeatmap([spot({ time: new Date(NOW + MIN) })], { now: NOW });
    expect(cell(cells, "20m", "NA").count).toBe(0);
  });

  it("includes a spot exactly at the window start", () => {
    const cells = computeHeatmap(
      [spot({ time: new Date(NOW - DEFAULT_HEATMAP_WINDOW_MS) })],
      { now: NOW },
    );
    expect(cell(cells, "20m", "NA").count).toBe(1);
  });

  it("accepts a spot time that arrived as a JSON string, not just a Date", () => {
    const cells = computeHeatmap(
      [spot({ time: new Date(NOW).toISOString() })],
      { now: NOW },
    );
    expect(cell(cells, "20m", "NA").count).toBe(1);
  });

  it("honors a custom windowMs", () => {
    const windowMs = 5 * MIN;
    const cells = computeHeatmap([spot({ time: new Date(NOW - 6 * MIN) })], {
      now: NOW,
      windowMs,
    });
    expect(cell(cells, "20m", "NA").count).toBe(0);
    expect(cell(cells, "20m", "NA").window).toEqual({
      startMs: NOW - windowMs,
      endMs: NOW,
    });
  });
});

describe("ladder verdict", () => {
  it("is closed with no activity and no physics forecast", () => {
    const cells = computeHeatmap([], { now: NOW });
    expect(cell(cells, "20m", "NA").ladder).toBe("closed");
  });

  it("promotes to forecast when a physics score is supplied for that cell", () => {
    const cells = computeHeatmap([], {
      now: NOW,
      physicsScores: { [physicsScoreKey("20m", "NA")]: PHYSICS_OPEN_ENTER },
    });
    expect(cell(cells, "20m", "NA").ladder).toBe("forecast");
    // untouched cells still default to 0 -> closed
    expect(cell(cells, "40m", "NA").ladder).toBe("closed");
  });

  it("reaches verified (not hot) with enough deduplicated obs and reporters but a falling trend", () => {
    const spots: HeatmapSpotInput[] = [];
    const callsigns = ["W1AAA", "W2BBB", "W3CCC", "W4DDD", "W5EEE", "W6FFF"];
    const spotters = ["K1A", "K2A", "K3A"];
    for (let i = 0; i < callsigns.length; i++) {
      // All in the prior half of the window: count10mRecent=0, count10mPrior=6
      // -> falling trend, so verified activity does not also read as "hot".
      spots.push(
        spot({
          dx: callsigns[i],
          spotter: spotters[i % spotters.length],
          band: "20m",
          time: new Date(NOW - 15 * MIN),
        }),
      );
    }
    const cells = computeHeatmap(spots, { now: NOW });
    const c = cell(cells, "20m", "NA");
    expect(c.count).toBe(6);
    expect(c.reporters).toBe(3);
    expect(c.ladder).toBe("verified");
  });

  it("reaches hot when verified activity is concentrated in the recent half of the window", () => {
    const spotters = ["K1A", "K2A", "K3A", "K4A"];
    const spots: HeatmapSpotInput[] = [];
    // 2 dx in the prior 10 min, 6 more (distinct) in the recent 10 min
    const priorCalls = ["W1AAA", "W2BBB"];
    const recentCalls = ["W3CCC", "W4DDD", "W5EEE", "W6FFF", "W7GGG", "W8HHH"];
    priorCalls.forEach((dx, i) =>
      spots.push(
        spot({ dx, spotter: spotters[i % spotters.length], band: "20m", time: new Date(NOW - 15 * MIN) }),
      ),
    );
    recentCalls.forEach((dx, i) =>
      spots.push(
        spot({ dx, spotter: spotters[i % spotters.length], band: "20m", time: new Date(NOW - 2 * MIN) }),
      ),
    );
    const cells = computeHeatmap(spots, { now: NOW });
    const c = cell(cells, "20m", "NA");
    expect(c.ladder).toBe("hot");
  });
});

describe("baseline ratio and crowded flag", () => {
  it("is null/false with no baseline supplied", () => {
    const cells = computeHeatmap([spot()], { now: NOW });
    const c = cell(cells, "20m", "NA");
    expect(c.ratio).toBeNull();
    expect(c.crowded).toBe(false);
  });

  it("computes a positive ratio and flags crowded above the floor", () => {
    const utcHour = new Date(NOW).getUTCHours();
    const baseline = buildBaselineLookup([
      { band: "20m", continent: "NA", utcHour, meanCount: 3 },
    ]);
    const spots = Array.from({ length: 19 }, (_, i) =>
      spot({ dx: `W${i}AAA`, spotter: `K${i}A`, band: "20m" }),
    );
    const cells = computeHeatmap(spots, { now: NOW, baseline });
    const c = cell(cells, "20m", "NA");
    expect(c.count).toBe(19);
    expect(c.ratio).not.toBeNull();
    expect(c.ratio).toBeGreaterThan(1);
    expect(c.crowded).toBe(true);
  });

  it("does not flag crowded when count is below the absolute floor even at a high ratio", () => {
    const utcHour = new Date(NOW).getUTCHours();
    const baseline = buildBaselineLookup([
      { band: "20m", continent: "NA", utcHour, meanCount: 1 },
    ]);
    const spots = ["W1AAA", "W2BBB", "W3CCC", "W4DDD", "W5EEE"].map((dx) =>
      spot({ dx }),
    );
    const cells = computeHeatmap(spots, { now: NOW, baseline });
    const c = cell(cells, "20m", "NA");
    expect(c.count).toBe(5);
    expect(c.ratio).toBeGreaterThan(1); // well above 2x a baseline of 1
    expect(c.crowded).toBe(false); // but count=5 fails the absolute floor of 10
  });
});

describe("dxSpotToHeatmapInput", () => {
  function makeDXSpot(overrides: Partial<DXSpot> = {}): DXSpot {
    return {
      id: "1",
      spotter: "K1ABC",
      dx: NA_DX,
      frequency: 14200,
      comment: "",
      time: new Date(NOW),
      band: "20m",
      ...overrides,
    };
  }

  it("maps the fields this lib needs", () => {
    const input = dxSpotToHeatmapInput(makeDXSpot());
    expect(input).toEqual({
      dx: NA_DX,
      spotter: "K1ABC",
      band: "20m",
      time: new Date(NOW),
    });
  });

  it("returns null when the spot has no derived band", () => {
    expect(dxSpotToHeatmapInput(makeDXSpot({ band: undefined }))).toBeNull();
  });

  it("round-trips through computeHeatmap", () => {
    const dxSpot = makeDXSpot();
    const input = dxSpotToHeatmapInput(dxSpot);
    expect(input).not.toBeNull();
    const cells = computeHeatmap([input!], { now: NOW });
    expect(cell(cells, "20m", "NA").count).toBe(1);
  });
});

function baseCell(overrides: Partial<HeatmapCell> = {}): HeatmapCell {
  return {
    band: "20m",
    continent: "NA",
    count: 0,
    reporters: 0,
    ladder: "closed",
    ratio: null,
    crowded: false,
    window: { startMs: NOW - DEFAULT_HEATMAP_WINDOW_MS, endMs: NOW },
    ...overrides,
  };
}

describe("bucketFor", () => {
  it("puts a value below every threshold in bucket 0", () => {
    expect(bucketFor(baseCell({ count: 3 }), { metric: "count", thresholds: [10, 20] })).toBe(0);
  });

  it("puts a value above every threshold in the last bucket", () => {
    expect(bucketFor(baseCell({ count: 100 }), { metric: "count", thresholds: [10, 20] })).toBe(2);
  });

  it("a value exactly at a cut point goes to the upper bucket", () => {
    const scale = { metric: "count" as const, thresholds: [10, 20] };
    expect(bucketFor(baseCell({ count: 9 }), scale)).toBe(0);
    expect(bucketFor(baseCell({ count: 10 }), scale)).toBe(1);
    expect(bucketFor(baseCell({ count: 19 }), scale)).toBe(1);
    expect(bucketFor(baseCell({ count: 20 }), scale)).toBe(2);
  });

  it("reads the reporters metric", () => {
    const scale = { metric: "reporters" as const, thresholds: [3] };
    expect(bucketFor(baseCell({ reporters: 2 }), scale)).toBe(0);
    expect(bucketFor(baseCell({ reporters: 3 }), scale)).toBe(1);
  });

  it("treats a missing ratio (no baseline) as the quietest bucket", () => {
    const scale = { metric: "ratio" as const, thresholds: [-1, 0, 1] };
    expect(bucketFor(baseCell({ ratio: null }), scale)).toBe(0);
    expect(bucketFor(baseCell({ ratio: -1 }), scale)).toBe(1);
    expect(bucketFor(baseCell({ ratio: 5 }), scale)).toBe(3);
  });

  it("orders the ladder metric by LADDER_RANK, one bucket per rung", () => {
    const scale = { metric: "ladder" as const, thresholds: [1, 2, 3, 4] };
    const states: LadderState[] = ["closed", "forecast", "stirring", "verified", "hot"];
    for (const state of states) {
      expect(bucketFor(baseCell({ ladder: state }), scale)).toBe(LADDER_RANK[state]);
    }
  });
});

describe("PRESETS", () => {
  it("exposes ladderHue and ratioDiverging, ladderHue first as the default", () => {
    expect(PRESETS.map((p) => p.id)).toEqual(["ladderHue", "ratioDiverging"]);
    expect(PRESETS[0]).toBe(LADDER_HUE_PRESET);
    expect(PRESETS[1]).toBe(RATIO_DIVERGING_PRESET);
  });

  it("every preset has one colour per bucket (thresholds.length + 1)", () => {
    for (const preset of PRESETS) {
      expect(preset.bucketColors).toHaveLength(preset.scale.thresholds.length + 1);
    }
  });

  it("never uses a pure-white colour", () => {
    for (const preset of PRESETS) {
      for (const color of preset.bucketColors) {
        expect(color.toLowerCase()).not.toMatch(/^#fff(fff)?$/);
        expect(color.toLowerCase()).not.toBe("white");
      }
    }
  });

  it("colours reference existing CSS custom properties, not hard-coded hex", () => {
    for (const preset of PRESETS) {
      for (const color of preset.bucketColors) {
        expect(color).toMatch(/^rgb\(var\(--su-[a-z-]+-rgb\)(?: \/ [\d.]+)?\)$/);
      }
    }
  });

  it("ladderHue thresholds put every ladder rung in its own bucket", () => {
    const states: LadderState[] = ["closed", "forecast", "stirring", "verified", "hot"];
    for (const state of states) {
      expect(bucketFor(baseCell({ ladder: state }), LADDER_HUE_PRESET.scale)).toBe(
        LADDER_RANK[state],
      );
    }
  });
});
