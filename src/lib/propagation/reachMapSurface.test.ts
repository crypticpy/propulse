import { describe, expect, it } from "vitest";
import {
  buildReachMapGrid,
  buildReachMapRequest,
  chunkReachMapSurfaceRequest,
  predictionsToReachMapCells,
  reachMapProfileLabel,
  reachMapProbabilityColor,
  summarizeReachMapPredictions,
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

    const [coreCell] = predictionsToReachMapCells([prediction], grid, false);
    expect(coreCell.value).toBe(0.4);
    expect(coreCell.label).toContain("40%");
  });

  it("splits the global surface into two stable bounded requests", () => {
    const { request } = buildReachMapRequest({
      origin: { lat: 30.3, lon: -97.7 },
      band: "20m",
      validTime: new Date("2026-07-16T12:00:00Z"),
      declaredPowerWatts: 5,
      personalizationEnabled: false,
      deriveEnvelope: () => null,
    });
    const chunks = chunkReachMapSurfaceRequest(request);
    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.cells.length)).toEqual([144, 144]);
    expect(chunks.flatMap((chunk) => chunk.cells)).toEqual(request.cells);
    expect(() => chunkReachMapSurfaceRequest(request, 0)).toThrow("between 1 and 4,096");
  });

  it("summarizes actual fallback and stale-input evidence", () => {
    const grid = buildReachMapGrid();
    const base: PropagationPrediction = {
      model_version: "v4-test",
      feature_contract: "station-chain-v1",
      issue_time: "2026-07-16T12:00:00Z",
      valid_time: "2026-07-16T12:00:00Z",
      band: "20m",
      mode: "WSPR",
      target_grid4: grid[0].targetGrid4,
      core_probability: 0.4,
      personalized_probability: 0.5,
      confidence: 0.7,
      ood_flags: [],
      data_freshness: {},
      top_factors: [],
      assumptions: [],
      profile: "nowcast",
    };
    expect(summarizeReachMapPredictions([
      base,
      {
        ...base,
        target_grid4: grid[1].targetGrid4,
        profile: "physics",
        ood_flags: ["recent_network_stale_physics_fallback"],
      },
    ])).toMatchObject({
      modelVersion: "v4-test",
      profile: "mixed",
      fallbackCellCount: 1,
      staleInputCellCount: 1,
    });
  });
});
