import { beforeEach, describe, expect, it, vi } from "vitest";

const modelMocks = vi.hoisted(() => ({
  calculateDistance: vi.fn(() => 5_000),
  enhanced: vi.fn(),
  antennaGain: vi.fn(() => 4.5),
}));

vi.mock("@/lib/utils/bands", () => ({
  calculateGreatCircleDistance: modelMocks.calculateDistance,
  getEnhancedBandConditions: modelMocks.enhanced,
}));

vi.mock("@/lib/data/antennas", () => ({
  getAntennaGainForPath: modelMocks.antennaGain,
}));

import {
  buildReliabilityForecast,
  scoreReliability,
} from "./reliabilityForecast";

describe("HamClock reliability forecast", () => {
  beforeEach(() => {
    modelMocks.calculateDistance.mockClear();
    modelMocks.antennaGain.mockClear();
    modelMocks.enhanced.mockReset();
    modelMocks.enhanced.mockReturnValue([
      {
        band: "20m",
        status: "good",
        snrEstimate: -6,
        signalPrediction: { confidence: 80 },
      },
      {
        band: "60m",
        status: "fair",
        snrEstimate: -10,
        signalPrediction: { confidence: 70 },
      },
    ]);
  });

  it("scores the same modeled SNR against the selected mode threshold", () => {
    const ft8 = scoreReliability(-10, 80, "FT8", "good");
    const cw = scoreReliability(-10, 80, "CW", "good");
    const ssb = scoreReliability(-10, 80, "SSB", "good");

    expect(ft8).toBeGreaterThan(cw);
    expect(cw).toBeGreaterThan(ssb);
    expect(scoreReliability(20, 100, "FT8", "closed")).toBe(0);
  });

  it("runs the enhanced model for every UTC hour with selected inputs", () => {
    const cells = buildReliabilityForecast({
      origin: { lat: 41.9, lon: -87.6 },
      target: { lat: 51.5, lon: -0.1 },
      kp: 2,
      sfi: 150,
      baseTime: new Date("2026-08-31T19:45:00.000Z"),
      mode: "CW",
      powerWatts: 25,
      antennaType: "hex_beam",
      noiseEnvironment: "residential",
    });

    expect(modelMocks.enhanced).toHaveBeenCalledTimes(24);
    expect(modelMocks.antennaGain).toHaveBeenCalledWith("hex_beam", 5_000);
    expect(modelMocks.enhanced.mock.calls[0][6].toISOString()).toBe(
      "2026-08-31T00:00:00.000Z",
    );
    expect(modelMocks.enhanced.mock.calls[23][6].toISOString()).toBe(
      "2026-08-31T23:00:00.000Z",
    );
    expect(modelMocks.enhanced.mock.calls[0].slice(7, 11)).toEqual([
      25,
      "CW",
      4.5,
      "residential",
    ]);
    expect(cells).toHaveLength(24);
    expect(cells.every((cell) => cell.band === "20m")).toBe(true);
  });
});
