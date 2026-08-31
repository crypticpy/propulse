import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOptimalMapSignal } from "./useOptimalMapSignal";

const mocks = vi.hoisted(() => ({
  stationGain: vi.fn(),
  kIndex: vi.fn(),
  solarFlux: vi.fn(),
  distance: vi.fn(),
  antennaGain: vi.fn(),
  enhanced: vi.fn(),
  optimal: vi.fn(),
}));

vi.mock("@/hooks/useActiveStationGain", () => ({
  useActiveStationGain: mocks.stationGain,
}));
vi.mock("@/hooks/useSolarData", () => ({
  useKIndex: mocks.kIndex,
  useSolarFlux: mocks.solarFlux,
}));
vi.mock("@/lib/utils/path", () => ({ getDistance: mocks.distance }));
vi.mock("@/lib/data/antennas", () => ({
  getAntennaGainForPath: mocks.antennaGain,
}));
vi.mock("@/lib/utils/bands", () => ({
  getEnhancedBandConditions: mocks.enhanced,
}));
vi.mock("@/lib/utils/optimalBand", () => ({
  pickOptimalBandCondition: mocks.optimal,
}));
vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: (selector: (state: { noiseEnvironment: string }) => unknown) =>
    selector({ noiseEnvironment: "rural" }),
}));

describe("useOptimalMapSignal", () => {
  beforeEach(() => {
    mocks.stationGain.mockReturnValue({ antennaType: "dipole" });
    mocks.kIndex.mockReturnValue({
      data: [{ kp_index: 2 }, { kp_index: 4 }],
      isPlaceholderData: false,
    });
    mocks.solarFlux.mockReturnValue({
      data: [{ flux: 110 }, { flux: 135 }],
      isPlaceholderData: false,
    });
    mocks.distance.mockReturnValue(1_500);
    mocks.antennaGain.mockReturnValue(2.5);
    mocks.enhanced.mockReturnValue([{ band: "20m" }]);
    mocks.optimal.mockReturnValue({
      band: "20m",
      status: "good",
      sUnit: "S7",
      snrEstimate: -8,
      notes: "Stable path",
      signalPrediction: { confidence: 0.82 },
    });
  });

  it("uses the newest solar values and the enhanced engine for all projections", () => {
    const displayTime = new Date("2026-08-31T12:00:00.000Z");
    const { result } = renderHook(() =>
      useOptimalMapSignal({
        station: { lat: 30, lon: -97 },
        target: { lat: 51, lon: 0 },
        displayTime,
      }),
    );

    expect(mocks.antennaGain).toHaveBeenCalledWith("dipole", 1_500);
    expect(mocks.enhanced).toHaveBeenCalledWith(
      30,
      -97,
      51,
      0,
      4,
      135,
      displayTime,
      100,
      "FT8",
      2.5,
      "rural",
    );
    expect(result.current).toEqual({
      band: "20m",
      status: "good",
      sUnit: "S7",
      snrEstimate: -8,
      confidence: 0.82,
      notes: "Stable path",
      isEstimated: false,
    });
  });

  it("does not run the model when a projection has no visible target detail", () => {
    renderHook(() =>
      useOptimalMapSignal({
        station: { lat: 30, lon: -97 },
        target: { lat: 51, lon: 0 },
        displayTime: new Date("2026-08-31T12:00:00.000Z"),
        enabled: false,
      }),
    );

    expect(mocks.enhanced).not.toHaveBeenCalled();
    expect(mocks.optimal).not.toHaveBeenCalled();
  });
});
