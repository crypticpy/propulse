import { describe, expect, it } from "vitest";
import {
  buildReachMapGrid,
  predictionsToReachMapCells,
  reachMapProfileLabel,
  reachMapProbabilityColor,
} from "./reachMapSurface";
import type { PropagationPrediction } from "./modelClient";

describe("ReachMap surface contract", () => {
  it("builds a stable 15-degree global grid", () => {
    const cells = buildReachMapGrid();
    expect(cells).toHaveLength(288);
    expect(new Set(cells.map((cell) => cell.id)).size).toBe(288);
    expect(cells.every((cell) => /^[A-R]{2}[0-9]{2}$/.test(cell.targetGrid4))).toBe(true);
  });

  it("uses a distinct ordered probability palette", () => {
    expect([0.1, 0.3, 0.5, 0.7, 0.9].map(reachMapProbabilityColor)).toEqual([
      "#dc2626",
      "#f97316",
      "#facc15",
      "#22c55e",
      "#06b6d4",
    ]);
  });

  it("never labels physics fallback as NowCast", () => {
    expect(reachMapProfileLabel("nowcast")).toBe("NowCast");
    expect(reachMapProfileLabel("physics")).toBe("Physics fallback");
    expect(reachMapProfileLabel(null)).toBe("Pending");
  });

  it("maps personalized probability and confidence into the overlay", () => {
    const grid = buildReachMapGrid();
    const prediction: PropagationPrediction = {
      model_version: "v4-test",
      feature_contract: "station-chain-v1",
      issue_time: "2026-07-12T00:00:00Z",
      valid_time: "2026-07-12T00:00:00Z",
      band: "20m",
      mode: "WSPR",
      target_grid4: grid[0].targetGrid4,
      core_probability: 0.4,
      personalized_probability: 0.7,
      confidence: 0.8,
      ood_flags: [],
      data_freshness: {},
      top_factors: [],
      assumptions: [],
      profile: "physics",
    };
    const [cell] = predictionsToReachMapCells([prediction], grid);
    expect(cell.value).toBe(0.7);
    expect(cell.opacity).toBeCloseTo(0.56);
    expect(cell.label).toContain("70%");
  });
});
