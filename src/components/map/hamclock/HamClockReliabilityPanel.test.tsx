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
  now: new Date("2026-08-31T12:30:00.000Z"),
  timeOffset: 0,
  colorBlindMode: "none" as
    | "none"
    | "deuteranopia"
    | "protanopia"
    | "tritanopia",
  chain: null as {
    id: string;
    name: string;
    operatingPowerWatts: number;
    nodes: Array<{ type: "antenna"; antennaId: string }>;
  } | null,
  antennas: [] as Array<{
    id: string;
    name: string;
    gainPatternType: "hex_beam";
  }>,
  updateChain: vi.fn(),
}));

vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: () => ({ lat: 41.9, lon: -87.6 }),
}));
vi.mock("@/hooks/useSolarData", () => ({
  useKIndex: () => ({ data: [{ kp_index: 2 }], isLoading: false }),
  useSolarFlux: () => ({ data: [{ flux: 150 }], isLoading: false }),
}));
vi.mock("@/hooks/useUTCClock", () => ({
  useUTCClock: () => mocks.now,
}));
vi.mock("@/stores/mapStore", () => ({
  useMapStore: (
    selector: (state: {
      target: typeof mocks.target;
      timeOffset: number;
    }) => unknown,
  ) => selector({ target: mocks.target, timeOffset: mocks.timeOffset }),
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
    selector: (state: {
      noiseEnvironment: "residential";
      colorBlindMode: typeof mocks.colorBlindMode;
    }) => unknown,
  ) =>
    selector({
      noiseEnvironment: "residential",
      colorBlindMode: mocks.colorBlindMode,
    }),
}));
vi.mock("@/stores/shackStore", () => ({
  useActiveChain: () => mocks.chain,
  useUserAntennas: () => mocks.antennas,
  useShackStore: (
    selector: (state: { updateChain: typeof mocks.updateChain }) => unknown,
  ) => selector({ updateChain: mocks.updateChain }),
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
    mocks.now = new Date("2026-08-31T12:30:00.000Z");
    mocks.timeOffset = 0;
    mocks.colorBlindMode = "none";
    mocks.chain = null;
    mocks.antennas = [];
    mocks.updateChain.mockReset();
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
    render(<HamClockReliabilityPanel />);

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
    render(<HamClockReliabilityPanel />);

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
    render(<HamClockReliabilityPanel />);

    expect(screen.getByText(/Select a DX target/)).toBeTruthy();
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it("rolls the highlighted hour and forecast day while preserving map offset", () => {
    mocks.timeOffset = 2;
    mocks.now = new Date("2026-08-31T22:30:00.000Z");
    const { rerender } = render(<HamClockReliabilityPanel />);

    expect(mocks.build).toHaveBeenLastCalledWith(
      expect.objectContaining({
        baseTime: new Date("2026-09-01T00:00:00.000Z"),
      }),
    );
    expect(screen.getByLabelText("0:00 UTC").className).toContain(
      "text-plasma-orange",
    );

    mocks.now = new Date("2026-09-01T23:30:00.000Z");
    rerender(<HamClockReliabilityPanel />);

    expect(mocks.build).toHaveBeenLastCalledWith(
      expect.objectContaining({
        baseTime: new Date("2026-09-02T00:00:00.000Z"),
      }),
    );
    expect(screen.getByLabelText("1:00 UTC").className).toContain(
      "text-plasma-orange",
    );
  });

  it("uses the color-vision palette with redundant cell patterns", () => {
    mocks.colorBlindMode = "deuteranopia";
    mocks.build.mockReturnValue([
      {
        band: "20m",
        hour: 12,
        score: 52,
        snrEstimate: -8,
        confidence: 70,
        status: "good",
      },
    ]);

    render(<HamClockReliabilityPanel />);

    const cell = screen.getByLabelText(
      "20m 12:00 UTC: reliability 52 of 100, SNR -8 dB, confidence 70 percent",
    );
    expect(cell.getAttribute("data-reliability-tier")).toBe("workable");
    expect(cell.getAttribute("style")).toContain("rgb(0, 119, 187)");
    expect(cell.getAttribute("style")).toContain("repeating-linear-gradient");
    expect(screen.getByText("Workable").textContent).toBe("\u2713Workable");
  });

  it("quantizes chain power for the matrix and does not mutate the chain", () => {
    mocks.chain = {
      id: "home",
      name: "Home",
      operatingPowerWatts: 75,
      nodes: [{ type: "antenna", antennaId: "a1" }],
    };
    mocks.antennas = [
      { id: "a1", name: "Hexbeam", gainPatternType: "hex_beam" },
    ];

    render(<HamClockReliabilityPanel />);

    expect(mocks.build).toHaveBeenCalledWith(
      expect.objectContaining({
        powerWatts: 100,
        antennaType: "hex_beam",
      }),
    );
    expect(mocks.updateChain).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Reliability antenna")).toBeNull();
    expect(screen.getByText("Hexbeam")).toBeTruthy();
    expect(screen.getByText(/Live path Home at 75 W/)).toBeTruthy();
  });
});
