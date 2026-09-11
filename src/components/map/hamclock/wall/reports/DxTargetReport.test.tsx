import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mapTarget: null as {
    name?: string;
    grid?: string;
    lat: number;
    lon: number;
    approximate?: boolean;
  } | null,
  // `undefined` = no override (real pass-through); an explicit value stands
  // in for the scoped runtime's bound target.
  boundTargetOverride: undefined as
    | {
        name?: string;
        grid?: string;
        lat: number;
        lon: number;
        approximate?: boolean;
      }
    | null
    | undefined,
}));

vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: () => ({ lat: 30.27, lon: -97.74 }),
}));
vi.mock("@/hooks/useLocalWeather", () => ({
  useLocationWeather: () => ({
    weather: null,
    isLoading: false,
    error: null,
    hasLocation: true,
  }),
}));
vi.mock("@/stores/hamclockDisplayStore", () => ({
  useHamClockDisplayStore: (selector: (state: { units: string }) => unknown) =>
    selector({ units: "auto" }),
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

import { DxTargetReport } from "./DxTargetReport";

describe("DxTargetReport", () => {
  beforeEach(() => {
    mocks.mapTarget = { name: "Tokyo", grid: "PM95", lat: 35.68, lon: 139.65 };
    mocks.boundTargetOverride = undefined;
  });

  it("shows the mapStore target's grid when there is no bound override", () => {
    render(<DxTargetReport open onClose={vi.fn()} />);
    expect(screen.getAllByText("PM95").length).toBeGreaterThan(0);
  });

  it("reads the scoped view runtime's bound target, not the raw mapStore target (#707)", () => {
    mocks.boundTargetOverride = { name: "Sydney", grid: "QF56", lat: -33.87, lon: 151.21 };

    render(<DxTargetReport open onClose={vi.fn()} />);

    expect(screen.getAllByText("QF56").length).toBeGreaterThan(0);
    expect(screen.queryByText("PM95")).toBeNull();
  });

  it("falls back to the no-target state when the bound target is null", () => {
    mocks.boundTargetOverride = null;

    render(<DxTargetReport open onClose={vi.fn()} />);

    expect(screen.getByText("NO TARGET")).toBeTruthy();
  });

  it("labels a prefix-centroid target as approximate (#861)", () => {
    mocks.mapTarget = {
      name: "PY2ABC",
      lat: -15,
      lon: -47.9,
      approximate: true,
    };

    render(<DxTargetReport open onClose={vi.fn()} />);

    expect(screen.getByText("APPROXIMATE")).toBeTruthy();
    expect(screen.queryByText("REPORTED")).toBeNull();
  });

  it("labels a reported locator as reported when the producer says so", () => {
    mocks.mapTarget = {
      name: "Tokyo",
      grid: "PM95",
      lat: 35.68,
      lon: 139.65,
      approximate: false,
    };

    render(<DxTargetReport open onClose={vi.fn()} />);

    expect(screen.getByText("REPORTED")).toBeTruthy();
    expect(screen.queryByText("APPROXIMATE")).toBeNull();
  });

  it("omits the LOCATION fact when no producer classified the target (#993 review)", () => {
    // The default fixture is a plain map click / saved pin / mini-map target:
    // `approximate` is absent, which means unknown, not "reported".
    expect(mocks.mapTarget?.approximate).toBeUndefined();

    render(<DxTargetReport open onClose={vi.fn()} />);

    expect(screen.queryByText("LOCATION")).toBeNull();
    expect(screen.queryByText("REPORTED")).toBeNull();
    expect(screen.queryByText("APPROXIMATE")).toBeNull();
  });

  it("still renders the surrounding facts when LOCATION is omitted", () => {
    render(<DxTargetReport open onClose={vi.fn()} />);

    expect(screen.getByText("CALLSIGN")).toBeTruthy();
    expect(screen.getByText("GRID")).toBeTruthy();
    expect(screen.getByText("COORDINATES")).toBeTruthy();
    // SHORT/LONG PATH also appear in the body's path <dl>.
    expect(screen.getAllByText("SHORT PATH").length).toBeGreaterThan(0);
    expect(screen.getAllByText("LONG PATH").length).toBeGreaterThan(0);
  });
});
