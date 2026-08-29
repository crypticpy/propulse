import { describe, expect, it } from "vitest";
import { partitionBySeverity, type Volcano } from "@/hooks/useVolcanoes";

function makeVolcano(overrides: Partial<Volcano>): Volcano {
  return {
    volcanoName: "Test Peak",
    obsAbbr: "TST",
    alertLevel: "NORMAL",
    colorCode: "GREEN",
    lat: null,
    lon: null,
    lastUpdate: null,
    ...overrides,
  };
}

describe("partitionBySeverity", () => {
  it("buckets WATCH/WARNING alert levels as severe", () => {
    const watch = makeVolcano({ volcanoName: "Watch Peak", alertLevel: "WATCH" });
    const warning = makeVolcano({
      volcanoName: "Warning Peak",
      alertLevel: "WARNING",
    });

    const { severe, elevated } = partitionBySeverity([watch, warning]);

    expect(severe).toEqual([watch, warning]);
    expect(elevated).toEqual([]);
  });

  it("buckets ORANGE/RED color codes as severe even with a lower alert level", () => {
    const orange = makeVolcano({
      volcanoName: "Orange Peak",
      alertLevel: "ADVISORY",
      colorCode: "ORANGE",
    });
    const red = makeVolcano({
      volcanoName: "Red Peak",
      alertLevel: "ADVISORY",
      colorCode: "RED",
    });

    const { severe } = partitionBySeverity([orange, red]);

    expect(severe).toEqual([orange, red]);
  });

  it("buckets ADVISORY/YELLOW as elevated, not severe", () => {
    const advisory = makeVolcano({
      volcanoName: "Advisory Peak",
      alertLevel: "ADVISORY",
      colorCode: "YELLOW",
    });

    const { severe, elevated } = partitionBySeverity([advisory]);

    expect(severe).toEqual([]);
    expect(elevated).toEqual([advisory]);
  });

  it("drops NORMAL/GREEN entries from both buckets", () => {
    const normal = makeVolcano({ volcanoName: "Quiet Peak" });

    const { severe, elevated } = partitionBySeverity([normal]);

    expect(severe).toEqual([]);
    expect(elevated).toEqual([]);
  });
});
