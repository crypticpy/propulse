import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PredictionsCard } from "@/components/dx/PredictionsCard";
import {
  getRankedBandPredictions,
  isDaytime,
} from "@/lib/propagation/bandRanking";

const mocks = vi.hoisted(() => ({
  longitude: -97,
  solarFlux: [{ flux: 180 }],
  kIndex: [{ kp_index: 1 }],
}));

vi.mock("@/hooks/useSolarData", () => ({
  useSolarFlux: () => ({ data: mocks.solarFlux, isLoading: false }),
  useKIndex: () => ({ data: mocks.kIndex, isLoading: false }),
}));

vi.mock("@/hooks/useStationCastContext", () => ({
  useStationCastContext: () => ({ location: { lon: mocks.longitude } }),
}));

beforeEach(() => {
  mocks.longitude = -97;
  mocks.solarFlux = [{ flux: 180 }];
  mocks.kIndex = [{ kp_index: 1 }];
});

describe("getRankedBandPredictions", () => {
  it("returns the best available bands when every condition is marginal", () => {
    const predictions = getRankedBandPredictions(1.33, 111, false, 3);

    expect(predictions).toHaveLength(3);
    expect(new Set(predictions.map((prediction) => prediction.band)).size).toBe(3);
    expect(predictions.every((prediction) => prediction.condition === "Fair")).toBe(true);
    expect(predictions.every((prediction) => !prediction.isOpening)).toBe(true);
  });

  it("keeps strong openings ahead of marginal bands", () => {
    const predictions = getRankedBandPredictions(1, 180, true, 3);

    expect(predictions.map((prediction) => prediction.band)).toEqual([
      "20m",
      "17m",
      "15m",
    ]);
    expect(predictions.every((prediction) => prediction.condition === "Excellent")).toBe(true);
  });

  it("uses the operator longitude for day and night", () => {
    const afternoonInTexas = new Date("2026-07-18T20:00:00Z");

    expect(isDaytime(-97, afternoonInTexas)).toBe(true);
    expect(isDaytime(120, afternoonInTexas)).toBe(false);
  });
});

describe("PredictionsCard", () => {
  it("uses the station longitude when rendering the day/night state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T20:00:00Z"));
    const { rerender } = render(<PredictionsCard />);
    expect(screen.getByText("Daytime")).toBeTruthy();

    mocks.longitude = 120;
    rerender(<PredictionsCard />);
    expect(screen.getByText("Nighttime")).toBeTruthy();
  });

  it("keeps one result visible when maxPredictions is non-positive", () => {
    render(<PredictionsCard maxPredictions={0} />);

    expect(screen.queryByText("Solar data unavailable")).toBeNull();
    expect(screen.getAllByText(/m$/)).toHaveLength(1);
  });
});
