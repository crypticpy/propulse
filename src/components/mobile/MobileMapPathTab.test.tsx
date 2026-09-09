import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserStation } from "@/types/user";

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

import { MobileMapPathTab } from "./MobileMap";

const station: UserStation = {
  callsign: "K5ABC",
  homeLocationId: "home",
  activeLocationId: null,
  savedLocations: [],
  grid: "EM10",
  lat: 30.27,
  lon: -97.74,
};

describe("MobileMapPathTab", () => {
  beforeEach(() => {
    mocks.mapTarget = { name: "Tokyo", grid: "PM95", lat: 35.68, lon: 139.65 };
    mocks.boundTargetOverride = undefined;
  });

  it("shows the mapStore target's grid when there is no bound override", () => {
    render(<MobileMapPathTab station={station} />);
    expect(screen.getByText("PM95")).toBeTruthy();
  });

  it("reads the scoped view runtime's bound target, not the raw mapStore target (#707)", () => {
    mocks.boundTargetOverride = { name: "Sydney", grid: "QF56", lat: -33.87, lon: 151.21 };

    render(<MobileMapPathTab station={station} />);

    expect(screen.getByText("QF56")).toBeTruthy();
    expect(screen.queryByText("PM95")).toBeNull();
  });

  it("falls back to the no-target state when the bound target is null", () => {
    mocks.boundTargetOverride = null;

    render(<MobileMapPathTab station={station} />);

    expect(
      screen.getByText(/No target selected\. Tap a location on the map/),
    ).toBeTruthy();
  });
});
