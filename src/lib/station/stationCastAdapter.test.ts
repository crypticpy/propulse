import { describe, expect, it } from "vitest";
import fixture from "../../../ml/fixtures/station_cast_v1.json";
import type { StationFeatureEnvelope } from "./stationChainEngine";
import { applyStationPhysicsAdapter } from "./stationCastAdapter";

describe("applyStationPhysicsAdapter", () => {
  for (const testCase of fixture.cases) {
    it(testCase.name, () => {
      const result = applyStationPhysicsAdapter(
        testCase.coreProbability,
        testCase.coreConfidence,
        testCase.coreReferencePowerWatts,
        testCase.envelope as StationFeatureEnvelope,
      );

      expect(result.personalizedProbability).toBeCloseTo(
        testCase.expected.personalizedProbability,
        10,
      );
      expect(result.confidence).toBeCloseTo(testCase.expected.confidence, 10);
      expect(result.linkAdjustmentDb).toBeCloseTo(
        testCase.expected.linkAdjustmentDb,
        10,
      );
    });
  }

  it("increases probability monotonically with EIRP", () => {
    const base = fixture.cases[0];
    const probabilities = [1, 10, 100, 1000].map((eirpWatts) =>
      applyStationPhysicsAdapter(
        base.coreProbability,
        base.coreConfidence,
        base.coreReferencePowerWatts,
        { ...base.envelope, eirpWatts } as StationFeatureEnvelope,
      ).personalizedProbability,
    );
    expect(probabilities).toEqual([...probabilities].sort((a, b) => a - b));
  });
});
