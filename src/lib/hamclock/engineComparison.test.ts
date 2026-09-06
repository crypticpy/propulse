import { describe, expect, it } from "vitest";
import {
  bandFrequencyStepClassifier,
  compareEngines,
  ladderStepVerdict,
  probabilityStepClassifier,
  type EngineReading,
} from "./engineComparison";

function reading(
  comparable: EngineReading["comparable"],
  overrides: Partial<EngineReading> = {},
): EngineReading {
  return {
    value: "—",
    comparable,
    state: "ok",
    ...overrides,
  };
}

const none = reading({ kind: "none" });
const open = (value: number) => reading({ kind: "number", value, unit: "MHz" });

describe("compareEngines", () => {
  it("reads NO COMPARISON when fewer than two engines have data", () => {
    const result = compareEngines(
      none,
      none,
      open(14),
      bandFrequencyStepClassifier("20m"),
    );
    expect(result.word).toBe("NO COMPARISON");
    expect(result.tone).toBe("info");
  });

  it("reads NO COMPARISON when only physics reports", () => {
    const result = compareEngines(
      open(14),
      none,
      none,
      bandFrequencyStepClassifier("20m"),
    );
    expect(result.word).toBe("NO COMPARISON");
  });

  describe("two engines present", () => {
    const classify = probabilityStepClassifier();

    it("AGREEs when both land on the same step", () => {
      const result = compareEngines(
        reading({ kind: "number", value: 70, unit: "pct" }),
        none,
        reading({ kind: "number", value: 65, unit: "pct" }),
        classify,
      );
      expect(result.word).toBe("AGREE");
      expect(result.tone).toBe("good");
    });

    it("SPLITs when one step apart", () => {
      const result = compareEngines(
        reading({ kind: "number", value: 70, unit: "pct" }),
        reading({ kind: "number", value: 50, unit: "pct" }),
        none,
        classify,
      );
      expect(result.word).toBe("SPLIT");
      expect(result.tone).toBe("warn");
    });

    it("DISAGREEs when opposite ends of the ladder", () => {
      const result = compareEngines(
        none,
        reading({ kind: "number", value: 70, unit: "pct" }),
        reading({ kind: "number", value: 10, unit: "pct" }),
        classify,
      );
      expect(result.word).toBe("DISAGREE");
      expect(result.tone).toBe("bad");
    });
  });

  describe("three engines present", () => {
    const classify = bandFrequencyStepClassifier("20m", 2); // reference 14 MHz

    it("AGREEs when spread is at most one step", () => {
      const result = compareEngines(open(16), open(15), open(14), classify);
      expect(result.word).toBe("AGREE");
      expect(result.tone).toBe("good");
    });

    it("DISAGREEs when physics and nowcast sit on opposite sides of open/closed regardless of observed", () => {
      const result = compareEngines(open(9), open(20), open(14.5), classify);
      expect(result.word).toBe("DISAGREE");
      expect(result.tone).toBe("bad");
      expect(result.reason).toContain("model sees an opening");
    });

    it("names the physics-sees-more direction when nowcast is the closed outlier", () => {
      const result = compareEngines(open(20), open(9), open(14.5), classify);
      expect(result.word).toBe("DISAGREE");
      expect(result.reason).toContain("physics sees an opening");
    });

    it("SPLITs and names observed as the outlier when physics and nowcast agree but observed breaks away", () => {
      // physics + nowcast both "open" (>=16 MHz against a 14 MHz reference),
      // observed alone "closed" (<12 MHz). Physics and nowcast share a rank
      // so the physics/nowcast DISAGREE rule can never fire here — any other
      // pairing that ties two engines together always leaves physics and
      // nowcast two ranks apart, which the DISAGREE rule claims first.
      const result = compareEngines(open(17), open(17), open(9), classify);
      expect(result.word).toBe("SPLIT");
      expect(result.tone).toBe("warn");
      expect(result.reason).toContain("observed activity");
    });

    it("SPLITs with a generic reason when all three ranks are distinct", () => {
      // closed (9), marginal (13), open (18) — no tie to anchor an outlier
      const result = compareEngines(open(9), open(13), open(18), classify);
      expect(result.word).toBe("SPLIT");
      expect(result.reason).toBe(
        "the three engines spread across the usable range.",
      );
    });

    it("never lets an unavailable engine default to closed and skew the verdict", () => {
      // If a missing nowcast were ever treated as "closed" instead of
      // excluded, physics (open) and that phantom closed reading would be
      // two ranks apart and wrongly read DISAGREE.
      const result = compareEngines(open(20), none, open(19), classify);
      expect(result.word).toBe("AGREE");
    });
  });
});

describe("bandFrequencyStepClassifier", () => {
  it("classifies against the subject band's own frequency", () => {
    const classify = bandFrequencyStepClassifier("40m", 1); // 7 MHz reference
    expect(classify(9, "MHz")).toBe("open");
    expect(classify(7, "MHz")).toBe("marginal");
    expect(classify(5, "MHz")).toBe("closed");
  });

  it("treats an unknown band as reference zero rather than throwing", () => {
    const classify = bandFrequencyStepClassifier("not-a-band");
    expect(classify(5, "MHz")).toBe("open");
  });

  it("returns marginal for a non-MHz unit", () => {
    const classify = bandFrequencyStepClassifier("20m");
    expect(classify(50, "pct")).toBe("marginal");
  });
});

describe("ladderStepVerdict", () => {
  it("reads hot and verified as open", () => {
    expect(ladderStepVerdict("hot")).toBe("open");
    expect(ladderStepVerdict("verified")).toBe("open");
  });

  it("reads stirring as marginal", () => {
    expect(ladderStepVerdict("stirring")).toBe("marginal");
  });

  it("reads forecast and closed as closed", () => {
    expect(ladderStepVerdict("forecast")).toBe("closed");
    expect(ladderStepVerdict("closed")).toBe("closed");
  });
});

describe("probabilityStepClassifier", () => {
  it("uses the 40/60 default lines", () => {
    const classify = probabilityStepClassifier();
    expect(classify(61, "pct")).toBe("open");
    expect(classify(40, "pct")).toBe("marginal");
    expect(classify(39, "pct")).toBe("closed");
  });

  it("returns marginal for a non-pct unit", () => {
    const classify = probabilityStepClassifier();
    expect(classify(80, "MHz")).toBe("marginal");
  });
});
