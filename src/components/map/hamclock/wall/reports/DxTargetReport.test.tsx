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
  weather: {
    weather: null as {
      temperature: number;
      windSpeed: number;
      windDirection: number;
      humidity: number;
      weatherCode: number;
      isDay: boolean;
      observedAt: Date | null;
    } | null,
    isLoading: false,
    error: null as Error | null,
    hasLocation: true,
  },
}));

vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: () => ({ lat: 30.27, lon: -97.74 }),
}));
vi.mock("@/hooks/useLocalWeather", () => ({
  useLocationWeather: () => mocks.weather,
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

import { verdictScale } from "../tokens";
import { DxTargetReport } from "./DxTargetReport";

const NOW = Date.parse("2026-09-05T13:00:00Z");

describe("DxTargetReport", () => {
  beforeEach(() => {
    vi.setSystemTime(NOW);
    mocks.mapTarget = { name: "Tokyo", grid: "PM95", lat: 35.68, lon: 139.65 };
    mocks.boundTargetOverride = undefined;
    mocks.weather = {
      weather: null,
      isLoading: false,
      error: null,
      hasLocation: true,
    };
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

  it("uses reportFooter with Open-Meteo observedAt, not the condition word", () => {
    mocks.weather = {
      weather: {
        temperature: 22,
        windSpeed: 12,
        windDirection: 90,
        humidity: 55,
        weatherCode: 0,
        isDay: true,
        observedAt: new Date("2026-09-05T12:45:00Z"),
      },
      isLoading: false,
      error: null,
      hasLocation: true,
    };

    render(<DxTargetReport open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    const footSpans = dialog.querySelectorAll(".hcr-foot span");
    expect(footSpans[0].textContent).toBe(
      "DATA: OPEN-METEO AT THE TARGET · GREAT CIRCLE FROM THE QTH",
    );
    expect(footSpans[1].textContent).toBe("UPDATED 12:45 UTC · 15 MIN AGO");
    expect(footSpans[1].textContent).not.toContain("CLEAR");
  });

  it("keeps the SKY condition as a weather detail row alongside the timestamp footer (#1085 review)", () => {
    mocks.weather = {
      weather: {
        temperature: 22,
        windSpeed: 12,
        windDirection: 90,
        humidity: 55,
        weatherCode: 61,
        isDay: true,
        observedAt: new Date("2026-09-05T12:45:00Z"),
      },
      isLoading: false,
      error: null,
      hasLocation: true,
    };

    render(<DxTargetReport open onClose={vi.fn()} />);

    expect(screen.getByText("SKY")).toBeTruthy();
    expect(screen.getByText("RAIN")).toBeTruthy();
  });

  it("shows WAITING in the footer only while weather is still loading", () => {
    mocks.weather = {
      weather: null,
      isLoading: true,
      error: null,
      hasLocation: true,
    };

    render(<DxTargetReport open onClose={vi.fn()} />);

    const footSpans = screen.getByRole("dialog").querySelectorAll(".hcr-foot span");
    expect(footSpans[1].textContent).toBe("WAITING");
    expect(screen.getByText("Reading conditions at the target.")).toBeTruthy();
  });

  it("shrinks a long portable callsign in the verdict slot (#882)", () => {
    const longCall = "KH8/N0ABC";
    mocks.mapTarget = {
      name: longCall,
      grid: "QF56",
      lat: -33.87,
      lon: 151.21,
    };

    render(<DxTargetReport open onClose={vi.fn()} />);

    const verdict = screen.getByRole("dialog").querySelector(".hcr-verdict");
    expect(verdict?.textContent).toBe(longCall);
    expect(verdict?.getAttribute("style")).toContain(
      `--hcr-verdict-scale: ${verdictScale(longCall)}`,
    );
  });
});
