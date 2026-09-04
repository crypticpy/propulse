import { describe, expect, it } from "vitest";
import { stationRankCredit } from "@/lib/station/stationRank";

const inventory = {
  radioIds: ["r1", "r2"],
  antennaIds: ["a1"],
  feedlineIds: ["f1"],
  accessoryIds: [] as string[],
  inlineIds: [] as string[],
  chainIds: ["c-home", "c-pota"],
};

describe("useOperatorRank stationRankCredit", () => {
  it("keeps legacy inventory counts when no QSO is stamped", () => {
    expect(
      stationRankCredit(inventory, { qsoCountById: {}, stampedQsoCount: 0 }),
    ).toEqual({ equipmentCount: 4, signalPathCount: 2 });
  });

  it("credits only QSO-linked radios, antennas, and chains after a stamp", () => {
    expect(
      stationRankCredit(inventory, {
        stampedQsoCount: 3,
        qsoCountById: { r1: 2, a1: 3, "c-home": 3 },
      }),
    ).toEqual({ equipmentCount: 3, signalPathCount: 1 });
  });
});
