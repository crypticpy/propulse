import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mapTarget: null as { name?: string; grid?: string; lat: number; lon: number } | null,
  // `undefined` = no override (real pass-through); an explicit value stands
  // in for the scoped runtime's bound target.
  boundTargetOverride: undefined as
    | { name?: string; grid?: string; lat: number; lon: number }
    | null
    | undefined,
}));

vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (state: { target: typeof mocks.mapTarget }) => unknown) =>
    selector({ target: mocks.mapTarget }),
}));
vi.mock("@/hooks/useBoundMapSelection", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/hooks/useBoundMapSelection")
  >();
  return {
    ...actual,
    useBoundVisualTarget: (mapTarget: unknown) =>
      mocks.boundTargetOverride === undefined
        ? mapTarget
        : mocks.boundTargetOverride,
  };
});
vi.mock("@/stores/userStore", () => ({
  useUserStore: () => ({
    station: { lat: 30.27, lon: -97.74, grid: "EM10", callsign: "K5ABC" },
  }),
}));
vi.mock("@/hooks/useActiveStationGain", () => ({
  useActiveStationGain: () => ({
    antennaType: "dipole",
    txPowerWatts: 100,
    systemLossDb: 0,
    physicsMode: "digital",
  }),
}));
vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: (selector: (state: { noiseEnvironment: string }) => unknown) =>
    selector({ noiseEnvironment: "residential" }),
}));
vi.mock("@/hooks/useSolarData", () => ({
  useKIndex: () => ({ data: [{ kp_index: 2 }], isLoading: false }),
  useSolarFlux: () => ({ data: [{ flux: 150 }], isLoading: false }),
}));

import { OptimalBandsPanel } from "./OptimalBandsPanel";

describe("OptimalBandsPanel", () => {
  beforeEach(() => {
    mocks.mapTarget = { name: "Tokyo", grid: "PM95", lat: 35.68, lon: 139.65 };
    mocks.boundTargetOverride = undefined;
  });

  it("renders nothing when there is no target at all", () => {
    mocks.mapTarget = null;
    const { container } = render(<OptimalBandsPanel displayTime={new Date("2026-09-09T00:00:00Z")} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the mapStore target's label when there is no bound override", () => {
    render(<OptimalBandsPanel displayTime={new Date("2026-09-09T00:00:00Z")} />);
    expect(screen.getByText(/Tokyo/)).toBeTruthy();
  });

  it("reads the scoped view runtime's bound target, not the raw mapStore target (#707)", () => {
    mocks.boundTargetOverride = { name: "Sydney", grid: "QF56", lat: -33.87, lon: 151.21 };

    render(<OptimalBandsPanel displayTime={new Date("2026-09-09T00:00:00Z")} />);

    expect(screen.getByText(/Sydney/)).toBeTruthy();
    expect(screen.queryByText(/Tokyo/)).toBeNull();
  });
});
