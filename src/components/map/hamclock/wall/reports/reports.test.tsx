import { useDXStore } from "@/stores/dxStore";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { createMemoryWorkingStorage, type ScopedViewRuntime } from "@/lib/views/runtime";
import { useHamClockStore } from "@/stores/hamclockStore";
import { BandActivityTile } from "../tiles/BandActivityTile";
import { BandActivityReport } from "./BandActivityReport";
import { DxTargetReport } from "./DxTargetReport";
import { WeatherReport } from "./WeatherReport";

let capturedRuntime: ScopedViewRuntime | null = null;

function RuntimeCapture() {
  capturedRuntime = useViewRuntime();
  return null;
}

// BandActivityReport/BandActivityTile patch spot filters through the bound
// view runtime (SP-09 round 2), so they need a `ViewProvider` ancestor just
// like their production mount inside `<BoundViewHost slot="hamclock">`.
function renderInView(ui: ReactElement) {
  capturedRuntime = null;
  const utils = render(
    <ViewProvider ownerId="owner-test" slot="hamclock" storage={createMemoryWorkingStorage()}>
      <RuntimeCapture />
      {ui}
    </ViewProvider>,
  );
  return { ...utils, get runtime() { return capturedRuntime!; } };
}

const mocks = vi.hoisted(() => ({
  verdicts: vi.fn(),
  activity: vi.fn(),
  reliability: vi.fn(),
  location: vi.fn(),
  sfi: vi.fn(),
  kIndex: vi.fn(),
  sunspots: vi.fn(),
  solar: vi.fn(),
  weather: vi.fn(),
  alerts: vi.fn(),
  target: vi.fn(),
}));

vi.mock("@/hooks/useBandHistory", () => ({ useBandHistory: () => ({ data: undefined, isError: false }) }));
vi.mock("@/hooks/useBandVerdicts", () => ({ useBandVerdicts: mocks.verdicts }));
vi.mock("@/hooks/useBandActivity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useBandActivity")>()),
  useBandActivity: mocks.activity,
}));
// Partial mock: the tiles/reports get a scripted matrix, but the pure
// selectors (`wallBestBand`, `wallReliabilityScore`, `wallScoreTone`) stay
// real so a test exercises the code that actually picks the hero.
vi.mock("../tiles/useWallReliability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tiles/useWallReliability")>()),
  useWallReliability: mocks.reliability,
}));
vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: mocks.location,
}));
vi.mock("@/hooks/useMUFData", () => ({ useCurrentSFI: mocks.sfi }));
vi.mock("@/hooks/useSolarData", () => ({
  useKIndex: mocks.kIndex,
  useSunspots: mocks.sunspots,
}));
vi.mock("@/hooks/useSolarResource", () => ({
  useSolarResource: (sourceId: string) => mocks.solar(sourceId),
}));
vi.mock("@/hooks/useLocalWeather", () => ({
  useLocationWeather: mocks.weather,
}));
vi.mock("@/hooks/useWeatherAlerts", () => ({
  useWeatherAlerts: mocks.alerts,
}));
vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (state: unknown) => unknown) =>
    selector({
      spotFilters: { bands: [], modes: [] },
      timeOffset: 0,
      absoluteTime: null,
      target: mocks.target(),
    }),
}));

const EMPTY_RESOURCE = { data: undefined, isError: false, isPending: true };

function activitySnapshot() {
  const map = new Map([
    ["20m", { band: "20m", count60m: 470 }],
    ["40m", { band: "40m", count60m: 416 }],
  ]);
  return Object.assign(map, { fetchedAt: Date.parse("2026-09-05T13:00:00Z") });
}

/** Austin, TX — the QTH shared by the report fixtures below. */
const AUSTIN = {
  id: "home",
  name: "Austin",
  grid: "EM10dg",
  lat: 30.27,
  lon: -97.74,
  timezone: "America/Chicago",
  type: "home" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-09-05T13:00:00Z"));
  mocks.verdicts.mockReturnValue({
    bands: [],
    ready: true,
    scope: { id: "regional:NA", label: "North America", type: "regional" },
    activityScope: { type: "regional", continent: "NA" },
  });
  mocks.activity.mockReturnValue({
    data: activitySnapshot(),
    isPending: false,
    isError: false,
  });
  mocks.reliability.mockReturnValue({
    status: "ready",
    cells: new Map(),
    hour: 13,
    hourIndex: 0,
    targetLabel: "DX target",
    mode: "SSB",
  });
  mocks.location.mockReturnValue(AUSTIN);
  mocks.sfi.mockReturnValue(140);
  mocks.kIndex.mockReturnValue({ data: [{ kp_index: 2 }], isLoading: false });
  mocks.sunspots.mockReturnValue({ data: [] });
  mocks.solar.mockReturnValue(EMPTY_RESOURCE);
  mocks.weather.mockReturnValue({
    weather: null,
    isLoading: true,
    error: null,
    hasLocation: true,
  });
  mocks.alerts.mockReturnValue({ alerts: [], isLoading: false, error: null });
  mocks.target.mockReturnValue(null);
});

describe("wall reports", () => {
  it("renders the report shell as a modal dialog", () => {
    renderInView(<BandActivityReport open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.className).toContain("hcr");
    // Hero, verdict and one fact, at report size.
    expect(dialog.querySelector(".hcr-hero")?.textContent).toBe("20M");
    expect(dialog.querySelector(".hcr-verdict")?.textContent).toBe("LEADS");
    // The total also appears in the chart's screen-reader table twin.
    expect(dialog.querySelector(".hcr-facts")?.textContent).toContain("886");
  });

  it("closes on Escape", () => {
    const close = vi.fn();
    renderInView(<BandActivityReport open onClose={close} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(close).toHaveBeenCalledOnce();
  });

  it("opens from its tile and hands focus back on close", async () => {
    const user = userEvent.setup();
    renderInView(<BandActivityTile />);

    const trigger = screen.getByRole("button", {
      name: /open the band activity report/i,
    });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector(".hcr-hero")?.textContent).toBe("20M");

    await user.click(screen.getByRole("button", { name: /esc/i }));

    expect(screen.queryByRole("dialog")).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("routes a band button click through the bound view runtime, not mapStore (SP-09 round 2)", async () => {
    const originalBandFocus = useHamClockStore.getState().bandFocus;
    try {
      const user = userEvent.setup();
      const { runtime } = renderInView(<BandActivityReport open onClose={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: /20M/ }));

      expect(useHamClockStore.getState().bandFocus).toEqual(["20m"]);
      expect(runtime.getSnapshot().config.spots.filters.bands).toEqual(["20m"]);
    } finally {
      useHamClockStore.setState({ bandFocus: originalBandFocus });
    }
  });

  it("renders without a ViewProvider (a pinned report re-mounts on /workspace with no bound view, PR #615 review finding 1)", () => {
    expect(() =>
      render(<BandActivityReport open onClose={vi.fn()} initialView="dx" />),
    ).not.toThrow();

    const dialog = screen.getByRole("dialog", {
      name: "Band activity report · TOP DX FROM HOME",
    });
    expect(dialog).toBeTruthy();
  });

  // PR #615 round 5 review nb3: with no runtime above, a band chip click is a
  // no-op (`useOptionalViewSpotFilterPatch` no-ops there), so it must not
  // look live.
  it("disables the band chips when re-hosted with no ViewProvider", () => {
    render(<BandActivityReport open onClose={vi.fn()} />);

    expect(
      (screen.getByRole("button", { name: /20M/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: /40M/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("keeps the band chips enabled when bound to a view runtime", () => {
    renderInView(<BandActivityReport open onClose={vi.fn()} />);

    expect(
      (screen.getByRole("button", { name: /20M/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (screen.getByRole("button", { name: /40M/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});

describe("WeatherReport focus", () => {
  const severeAlert = {
    id: "a",
    event: "Tornado Warning",
    headline: "Tornado warning",
    severity: "Extreme" as const,
    lat: 40,
    lon: -100,
    areaDesc: "Somewhere else, KS",
    urgency: "Immediate" as const,
    certainty: "Observed" as const,
    response: "",
    instruction: "",
    polygon: null,
  };

  beforeEach(() => {
    mocks.weather.mockReturnValue({
      weather: {
        temperature: 25,
        windSpeed: 10,
        windDirection: 180,
        humidity: 40,
        pressure: 1012,
        precipitationProbability: 5,
        precipitation: 0,
        weatherCode: 0,
        isDay: true,
      },
      isLoading: false,
      error: null,
      hasLocation: true,
    });
  });

  it("keeps the local weather tone even with a severe nationwide alert", () => {
    mocks.alerts.mockReturnValue({
      alerts: [severeAlert],
      isLoading: false,
      error: null,
    });

    render(<WeatherReport open onClose={vi.fn()} focus="weather" />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-hero")?.className).toContain(
      "hc-info-text",
    );
    expect(dialog.querySelector(".hcr-hero")?.className).not.toContain(
      "hc-bad",
    );
    expect(dialog.querySelector(".hcr-verdict")?.textContent).toBe("CLEAR SKY");
  });

  it("still uses the alert severity tone for the alerts focus", () => {
    mocks.alerts.mockReturnValue({
      alerts: [severeAlert],
      isLoading: false,
      error: null,
    });

    render(<WeatherReport open onClose={vi.fn()} focus="alerts" />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-hero")?.className).toContain("hc-bad");
  });
});

describe("DxTargetReport", () => {
  const TOKYO = {
    lat: 35.6895,
    lon: 139.6917,
    grid: "PM95tj",
    name: "JA1ABC",
  };

  it("shows a neutral empty state when no target is chosen", () => {
    render(<DxTargetReport open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-verdict")?.textContent).toBe("NO TARGET");
    expect(screen.getByText(/Pick a target on the map/i)).toBeTruthy();
  });

  it("facts the target's callsign, grid, coordinates and both path bearings", () => {
    mocks.target.mockReturnValue(TOKYO);

    render(<DxTargetReport open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-verdict")?.textContent).toBe("JA1ABC");
    expect(screen.getByText("CALLSIGN")).toBeTruthy();
    expect(screen.getAllByText("JA1ABC").length).toBeGreaterThan(0);
    expect(screen.getByText("GRID")).toBeTruthy();
    expect(screen.getAllByText("PM95tj").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SHORT PATH").length).toBeGreaterThan(0);
    expect(screen.getAllByText("LONG PATH").length).toBeGreaterThan(0);
  });

  it("renders the target's weather when Open-Meteo has data", () => {
    mocks.target.mockReturnValue(TOKYO);
    mocks.weather.mockReturnValue({
      weather: {
        temperature: 22,
        windSpeed: 12,
        windDirection: 90,
        humidity: 55,
        pressure: 1010,
        precipitationProbability: 0,
        precipitation: 0,
        weatherCode: 1,
        isDay: true,
      },
      isLoading: false,
      error: null,
      hasLocation: true,
    });

    render(<DxTargetReport open onClose={vi.fn()} />);

    expect(screen.getByText("TEMPERATURE")).toBeTruthy();
    expect(screen.getByText("WIND")).toBeTruthy();
    expect(screen.getByText("HUMIDITY")).toBeTruthy();
    expect(screen.getByText("55%")).toBeTruthy();
  });
});


describe("Band history completeness", () => {
  it("keeps partial hourly totals out of the numeric peak", async () => {
    const { BandHistoryChart } = await import("./BandHistoryChart");
    render(<BandHistoryChart snapshot={{ scope: "global", windowStart: "2026-09-06T14:00:00Z", windowEnd: "2026-09-06T20:00:00Z", fetchedAt: "2026-09-06T20:10:00Z", rows: [{ hour: "2026-09-06T19:00:00.000Z", band: "20m", count: 123, sources: {}, modes: {} }] }} live={{ samples: [], now: Date.parse("2026-09-06T20:10:00Z") }} />);
    expect(screen.getByText(/PEAK UNKNOWN/)).toBeTruthy();
    expect(screen.getByText("PARTIAL")).toBeTruthy();
  });
  it("does not turn absent contributing source keys into measured zero", () => {
    renderInView(<BandActivityReport open onClose={vi.fn()} />);
    expect(screen.getByText(/PSKREPORTER WAITING · RBN WAITING · DXCLUSTER WAITING/)).toBeTruthy();
  });
});


it.each(["rest", "bridge"] as const)("TOP DX uses its own %s source timestamp and context", (source) => {
  const previous = useDXStore.getState();
  useDXStore.setState({
    spots: [{
      id: "timestamp",
      spotter: "N0TEST",
      dx: "JA1TEST",
      frequency: 14_074.125,
      mode: "CW",
      comment: "fixture",
      time: new Date("2026-09-05T12:00:00Z"),
      band: "20m",
      dxGrid: "PM95",
      dxLocApprox: false,
    }],
    spotSource: source,
  });
  try {
    renderInView(<BandActivityReport open onClose={vi.fn()} initialView="dx" />);
    expect(screen.getByRole("dialog", { name: "Band activity report · TOP DX FROM HOME" })).toBeTruthy();
    expect(screen.getByText(new RegExp(`DX CLUSTER · ${source.toUpperCase()} · LOADED · LAST SPOT`))).toBeTruthy();
    expect(screen.getByText(/12:00 UTC/)).toBeTruthy();
    expect(screen.queryByText("SPOTS · 60 MIN")).toBeNull();
  } finally { useDXStore.setState(previous); }
});
