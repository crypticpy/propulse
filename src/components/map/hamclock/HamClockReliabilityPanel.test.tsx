import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  target: { name: "London", grid: "IO91", lat: 51.5, lon: -0.1 } as {
    name?: string;
    grid?: string;
    lat: number;
    lon: number;
  } | null,
  setReliability: vi.fn(),
  build: vi.fn(),
}));

vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: () => ({ lat: 41.9, lon: -87.6 }),
}));
vi.mock("@/hooks/useSolarData", () => ({
  useKIndex: () => ({ data: [{ kp_index: 2 }], isLoading: false }),
  useSolarFlux: () => ({ data: [{ flux: 150 }], isLoading: false }),
}));
vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (state: { target: typeof mocks.target }) => unknown) =>
    selector({ target: mocks.target }),
}));
vi.mock("@/stores/hamclockStore", () => ({
  useHamClockStore: (
    selector: (state: {
      reliability: {
        mode: "FT8";
        powerWatts: 100;
        antennaType: "dipole";
      };
      setReliability: typeof mocks.setReliability;
    }) => unknown,
  ) =>
    selector({
      reliability: {
        mode: "FT8",
        powerWatts: 100,
        antennaType: "dipole",
      },
      setReliability: mocks.setReliability,
    }),
}));
vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: (
    selector: (state: { noiseEnvironment: "residential" }) => unknown,
  ) => selector({ noiseEnvironment: "residential" }),
}));
vi.mock("@/lib/hamclock/reliabilityForecast", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/hamclock/reliabilityForecast")
  >();
  return { ...actual, buildReliabilityForecast: mocks.build };
});
import { HamClockReliabilityPanel } from "./HamClockReliabilityPanel";

describe("HamClockReliabilityPanel", () => {
  beforeEach(() => {
    mocks.target = { name: "London", grid: "IO91", lat: 51.5, lon: -0.1 };
    mocks.setReliability.mockReset();
    mocks.build.mockReset();
    mocks.build.mockReturnValue([
      {
        band: "20m",
        hour: 12,
        score: 84,
        snrEstimate: -5,
        confidence: 82,
        status: "excellent",
      },
    ]);
  });

  it("renders the enhanced matrix and threads operator settings", () => {
    render(
      <HamClockReliabilityPanel
        displayTime={new Date("2026-08-31T12:30:00.000Z")}
      />,
    );

    expect(mocks.build).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "FT8",
        powerWatts: 100,
        antennaType: "dipole",
        kp: 2,
        sfi: 150,
      }),
    );
    expect(screen.getByText("to London")).toBeTruthy();
    expect(screen.getByText("20m 84")).toBeTruthy();
    expect(
      screen.getByLabelText(
        "20m 12:00 UTC: reliability 84 of 100, SNR -5 dB, confidence 82 percent",
      ),
    ).toBeTruthy();
  });

  it("persists mode, power, and antenna changes", () => {
    render(
      <HamClockReliabilityPanel
        displayTime={new Date("2026-08-31T12:30:00.000Z")}
      />,
    );

    fireEvent.change(screen.getByLabelText("Reliability mode"), {
      target: { value: "CW" },
    });
    fireEvent.change(screen.getByLabelText("Reliability power"), {
      target: { value: "25" },
    });
    fireEvent.change(screen.getByLabelText("Reliability antenna"), {
      target: { value: "hex_beam" },
    });

    expect(mocks.setReliability).toHaveBeenNthCalledWith(1, { mode: "CW" });
    expect(mocks.setReliability).toHaveBeenNthCalledWith(2, { powerWatts: 25 });
    expect(mocks.setReliability).toHaveBeenNthCalledWith(3, {
      antennaType: "hex_beam",
    });
  });

  it("prompts for a map target without running the model", () => {
    mocks.target = null;
    render(
      <HamClockReliabilityPanel
        displayTime={new Date("2026-08-31T12:30:00.000Z")}
      />,
    );

    expect(screen.getByText(/Select a DX target/)).toBeTruthy();
    expect(mocks.build).not.toHaveBeenCalled();
  });
});
