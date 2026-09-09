import { useState, type ReactElement } from "react";
import { render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SolarMiniChart } from "@/components/solar/SolarMiniChart";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { createMemoryWorkingStorage, type ScopedViewRuntime } from "@/lib/views/runtime";
import { HamClockPinnedReportHost } from "./WallReport";
import { WeatherReport } from "./WeatherReport";
import { BestBandReport } from "./BestBandReport";
import { useHamClockSessionTrend } from "./sessionTrend";

let capturedRuntime: ScopedViewRuntime | null = null;

function RuntimeCapture() {
  capturedRuntime = useViewRuntime();
  return null;
}

/**
 * `BestBandReport` patches spot filters through the bound view runtime
 * (SP-09 round 2) when one is available. This mirrors its production mount
 * inside `<BoundViewHost slot="hamclock">`, so a click can be asserted
 * against the runtime instead of the retired `mapStore.setSpotFilters`.
 */
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
  weather: vi.fn(),
  alerts: vi.fn(),
  setBandFocus: vi.fn(),
  setSpotFilters: vi.fn(),
  horizonActivated: vi.fn(),
  stationCast: vi.fn(),
  nowCast: vi.fn(),
}));

vi.mock("@/hooks/useBandVerdicts", () => ({ useBandVerdicts: mocks.verdicts }));
vi.mock("@/hooks/useBandActivity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useBandActivity")>()),
  useBandActivity: mocks.activity,
}));
vi.mock("../tiles/useWallReliability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tiles/useWallReliability")>()),
  useWallReliability: mocks.reliability,
}));
vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: mocks.location,
}));
vi.mock("@/hooks/useMUFData", () => ({ useCurrentSFI: mocks.sfi }));
vi.mock("@/hooks/useLocalWeather", () => ({
  useLocationWeather: mocks.weather,
}));
vi.mock("@/hooks/useSolarData", () => ({
  useKIndex: () => ({ data: [{ kp_index: 2 }], isLoading: false }),
  useSunspots: () => ({ data: [] }),
}));
vi.mock("@/hooks/useWeatherAlerts", () => ({ useWeatherAlerts: mocks.alerts }));
vi.mock("@/hooks/useStationCastContext", () => ({
  useStationCastContext: mocks.stationCast,
}));
vi.mock("@/hooks/useNowCastBandPredictions", () => ({
  useNowCastBandPredictions: mocks.nowCast,
}));
vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (state: unknown) => unknown) =>
    selector({
      timeOffset: 0,
      absoluteTime: null,
      spotFilters: { bands: [] },
      setSpotFilters: mocks.setSpotFilters,
    }),
}));
vi.mock("@/stores/hamclockStore", () => ({
  useHamClockStore: (selector: (state: unknown) => unknown) =>
    selector({
      setBandFocus: mocks.setBandFocus,
      reliability: { mode: "FT8", powerWatts: 100, antennaType: "dipole" },
    }),
}));
vi.mock("@/lib/propagation/runtimeActivation", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/propagation/runtimeActivation")
  >()),
  propagationFutureCastHorizonIsActivated: (h: number) =>
    mocks.horizonActivated(h),
}));

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

function bandEntry(overrides: {
  band: string;
  stable: "hot" | "verified" | "stirring" | "forecast" | "closed";
  physicsOpen: boolean;
  physicsScore: number;
  obs20m: number;
  reporters20m: number;
  surprise: boolean;
}) {
  return {
    band: overrides.band,
    stable: overrides.stable,
    result: {
      scopeId: "regional:NA",
      band: overrides.band,
      evaluation: {
        state: overrides.stable,
        surprise: overrides.surprise,
        physicsOpen: overrides.physicsOpen,
        verified: overrides.stable === "verified" || overrides.stable === "hot",
        trend: "flat",
        why: [],
      },
      inputs: {
        physicsScore: overrides.physicsScore,
        obs20m: overrides.obs20m,
        reporters20m: overrides.reporters20m,
        count10mRecent: 0,
        count10mPrior: 0,
      },
      counts: {
        count60m: overrides.obs20m * 2,
        sourceCounts60m: { dxcluster: 3, rbn: 5, pskreporter: 0 },
        modeObs20m: {},
      },
      at: Date.now(),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-09-05T13:00:00Z"));
  mocks.location.mockReturnValue(AUSTIN);
  mocks.sfi.mockReturnValue(140);
  mocks.horizonActivated.mockReturnValue(false);
  mocks.activity.mockReturnValue({
    data: Object.assign(new Map(), {
      fetchedAt: Date.parse("2026-09-05T13:00:00Z"),
    }),
    isPending: false,
    isError: false,
  });
  mocks.weather.mockReturnValue({
    weather: null,
    isLoading: true,
    error: null,
    hasLocation: true,
  });
  mocks.alerts.mockReturnValue({ alerts: [], isLoading: false, error: null });
  mocks.stationCast.mockReturnValue({
    location: { grid: AUSTIN.grid, lat: AUSTIN.lat, lon: AUSTIN.lon },
    locationSource: "active_location",
    chain: null,
    hasConfiguredChain: false,
    deriveEnvelope: () => null,
  });
  mocks.nowCast.mockReturnValue({
    enabled: true,
    visible: true,
    available: false,
    personalized: false,
    pending: false,
    capabilityError: null,
    predictions: new Map(),
    stationEnvelopes: new Map(),
    errors: new Map(),
    requestedCount: 0,
    failedCount: 0,
    partial: false,
    fallbackBands: [],
    staleInputBands: [],
    nowcastBands: [],
  });
  mocks.reliability.mockReturnValue({
    status: "no-target",
    cells: new Map(),
    hour: 13,
    hourIndex: 500_000,
    targetLabel: "DX target",
    mode: "SSB",
  });
});

describe("chart theming (HW-29)", () => {
  it("SolarMiniChart draws its observed series through the --hcr-chart-* token with a station-token fallback", () => {
    const day = Date.parse("2026-09-05T00:00:00Z");
    const { container } = render(
      <SolarMiniChart
        label="Test"
        unit="MHz"
        maxGapMs={3_600_000}
        points={[
          { timestamp: new Date(day).toISOString(), value: 1 },
          { timestamp: new Date(day + 3_600_000).toISOString(), value: 2 },
        ]}
      />,
    );
    const path = container.querySelector("path");
    expect(path?.getAttribute("stroke")).toBe(
      "var(--hcr-chart-observed, var(--su-info))",
    );
  });

  it("carries the same var(--hcr-chart-*, --su-*) contract outside a [data-hamclock-theme] ancestor, so /solar follows the app theme", () => {
    // No data-hamclock-theme ancestor is present in this render — the CSS
    // scoping in hamclock-wall-report.css only rebinds the variable under
    // that attribute, so the /solar page falls back to the station token
    // (DS-03) instead of the report theme.
    const day = Date.parse("2026-09-05T00:00:00Z");
    const { container } = render(
      <SolarMiniChart
        label="Test"
        unit="MHz"
        maxGapMs={3_600_000}
        points={[
          { timestamp: new Date(day).toISOString(), value: 1 },
          { timestamp: new Date(day + 3_600_000).toISOString(), value: 2 },
        ]}
      />,
    );
    expect(container.innerHTML).toContain(
      "var(--hcr-chart-observed, var(--su-info))",
    );
  });
});

describe("report pin (HW-30)", () => {
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

  it("hands the report off to the pinned host and keeps it rendered after the owning tile unmounts", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    const { rerender } = render(
      <>
        <WeatherReport open onClose={close} focus="weather" />
        <HamClockPinnedReportHost />
      </>,
    );

    const pinButton = screen.getByRole("button", { name: "PIN" });
    expect(pinButton.getAttribute("aria-pressed")).toBe("false");
    await user.click(pinButton);

    // Pinning supersedes this instance: the local report's onClose fires,
    // simulating the owning tile closing its own dialog state.
    expect(close).toHaveBeenCalledOnce();

    // Simulate the owning tile unmounting on page/scene navigation — only
    // the header-hosted instance remains mounted.
    rerender(<HamClockPinnedReportHost />);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "UNPIN" })).toBeTruthy();

    // Leave the session-only pin store clean for the next test.
    await user.click(within(dialog).getByRole("button", { name: "UNPIN" }));
  });

  it("closes the pinned report on UNPIN", async () => {
    // A tile's real onClose sets its own `open` state to false; a bare
    // `vi.fn()` would leave the owning instance open after pinning hands
    // it off, so this wrapper mirrors what an owning tile actually does.
    function Owner() {
      const [open, setOpen] = useState(true);
      return (
        <>
          {open && (
            <WeatherReport
              open
              onClose={() => setOpen(false)}
              focus="weather"
            />
          )}
          <HamClockPinnedReportHost />
        </>
      );
    }

    const user = userEvent.setup();
    render(<Owner />);

    await user.click(screen.getByRole("button", { name: "PIN" }));
    const unpin = screen.getByRole("button", { name: "UNPIN" });
    await user.click(unpin);

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("BestBandReport (HW-31)", () => {
  beforeEach(() => {
    mocks.verdicts.mockReturnValue({
      bands: [
        bandEntry({
          band: "20m",
          stable: "verified",
          physicsOpen: true,
          physicsScore: 0.8,
          obs20m: 12,
          reporters20m: 6,
          surprise: false,
        }),
        bandEntry({
          band: "17m",
          stable: "stirring",
          physicsOpen: false,
          physicsScore: 0.2,
          obs20m: 3,
          reporters20m: 2,
          surprise: true,
        }),
        bandEntry({
          band: "40m",
          stable: "closed",
          physicsOpen: false,
          physicsScore: 0.1,
          obs20m: 0,
          reporters20m: 0,
          surprise: false,
        }),
      ],
      ready: true,
      scope: { id: "regional:NA", label: "North America", type: "regional" },
      activityScope: { type: "regional", continent: "NA" },
    });
  });

  it("renders bands ranked by ladder state, sets band focus and spot filters on row click, and marks surprise rows in the ranked table", async () => {
    const user = userEvent.setup();
    const { runtime } = renderInView(<BestBandReport open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    // 20m (verified) outranks 17m (stirring) outranks 40m (closed).
    expect(dialog.querySelector(".hcr-hero")?.textContent).toBe("20M");

    const rows = dialog.querySelectorAll(".hcr-bandtable button.hcr-bandrow");
    // First table's rows: 20m, 17m, 40m in ranked order.
    expect(rows[0].textContent).toContain("20M");
    expect(rows[1].textContent).toContain("17M");
    expect(rows[2].textContent).toContain("40M");

    await user.click(rows[1]);
    expect(mocks.setBandFocus).toHaveBeenCalledWith(["17m"]);
    // SP-09 round 2: the click now patches the bound view runtime instead of
    // the retired `mapStore.setSpotFilters`.
    expect(runtime.getSnapshot().config.spots.filters.bands).toEqual(["17m"]);

    // Surprise is a status in the ranked row (17m: stirring+ while physics
    // closed) and a count in the caption, not a second table (#250 S6).
    expect(rows[1].textContent).toContain("SURPRISE");
    expect(rows[0].textContent).not.toContain("SURPRISE");
    const captions = Array.from(
      dialog.querySelectorAll(".hcr-bandtable-caption"),
    ).map((el) => el.textContent);
    expect(captions.some((c) => c?.includes("1 surprise"))).toBe(true);
  });

  it("renders without a ViewProvider, since it also mounts bare via the workspace canvas widget loader", () => {
    // `BestBandTile`/`BestBandReport` are reachable from
    // `workspace/widgetLoaders.ts` via `SpaceSlot`, which renders widgets
    // with no bound view. `useOptionalViewSpotFilterPatch` must no-op
    // instead of throwing `useViewRuntime requires ViewProvider`.
    expect(() =>
      render(<BestBandReport open onClose={vi.fn()} />),
    ).not.toThrow();

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-hero")?.textContent).toBe("20M");
  });

  it("disables the ranked rows when re-hosted with no ViewProvider (PR #615 round 6 review, mirrors BandActivityReport)", async () => {
    // With no runtime above, `patchSpotFilters` is a no-op, so the row is
    // disabled instead of looking live. Disabling the native <button>
    // prevents the click from firing at all, so the unconditional
    // `useHamClockStore.setBandFocus` write is inert here too.
    const user = userEvent.setup();
    render(<BestBandReport open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    const rows = dialog.querySelectorAll<HTMLButtonElement>(
      ".hcr-bandtable button.hcr-bandrow",
    );
    expect(rows[1].disabled).toBe(true);

    await user.click(rows[1]);
    expect(mocks.setBandFocus).not.toHaveBeenCalled();
  });

  it("keeps the ranked rows enabled when bound to a view runtime", () => {
    renderInView(<BestBandReport open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    const rows = dialog.querySelectorAll<HTMLButtonElement>(
      ".hcr-bandtable button.hcr-bandrow",
    );
    expect(rows[1].disabled).toBe(false);
  });

  it("prints the numeric rank for every row, not just an em dash below the leader", () => {
    render(<BestBandReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const rows = dialog.querySelectorAll(".hcr-bandtable button.hcr-bandrow");
    // The `#` column is each row's first child span.
    expect(rows[0].querySelector("span")?.textContent).toBe("1");
    expect(rows[1].querySelector("span")?.textContent).toBe("2");
    expect(rows[2].querySelector("span")?.textContent).toBe("3");
  });

  it("omits the surprise marker when nothing in the ladder is surprising", () => {
    mocks.verdicts.mockReturnValue({
      bands: [
        bandEntry({
          band: "20m",
          stable: "verified",
          physicsOpen: true,
          physicsScore: 0.8,
          obs20m: 12,
          reporters20m: 6,
          surprise: false,
        }),
      ],
      ready: true,
      scope: { id: "regional:NA", label: "North America", type: "regional" },
      activityScope: { type: "regional", continent: "NA" },
    });

    render(<BestBandReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const captions = Array.from(
      dialog.querySelectorAll(".hcr-bandtable-caption"),
    ).map((el) => el.textContent);
    expect(captions.some((c) => c?.includes("surprise"))).toBe(false);
    const statuses = Array.from(
      dialog.querySelectorAll(".hcr-bandrow"),
    ).map((row) => row.textContent);
    expect(statuses.some((t) => t?.includes("SURPRISE"))).toBe(false);
  });
});

describe("WeatherReport footer contract (HW-11)", () => {
  it("moves the observed-at reading into the footer's UPDATED slot instead of the condition text", () => {
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
        observedAt: new Date("2026-09-05T12:45:00Z"),
      },
      isLoading: false,
      error: null,
      hasLocation: true,
    });

    render(<WeatherReport open onClose={vi.fn()} focus="weather" />);
    const dialog = screen.getByRole("dialog");
    // The verdict slot still carries the condition text.
    expect(dialog.querySelector(".hcr-verdict")?.textContent).toBe("CLEAR SKY");
    // The foot's two spans follow the shared DATA / UPDATED contract, and
    // neither repeats the condition text.
    const footSpans = dialog.querySelectorAll(".hcr-foot span");
    expect(footSpans[0].textContent?.startsWith("DATA:")).toBe(true);
    expect(footSpans[0].textContent).not.toContain("CLEAR SKY");
    expect(footSpans[1].textContent).toBe("UPDATED 12:45 UTC · 15 MIN AGO");
  });

  it("shows WAITING when there is no observed-at reading yet", () => {
    mocks.weather.mockReturnValue({
      weather: null,
      isLoading: true,
      error: null,
      hasLocation: true,
    });

    render(<WeatherReport open onClose={vi.fn()} focus="weather" />);
    const dialog = screen.getByRole("dialog");
    const footSpans = dialog.querySelectorAll(".hcr-foot span");
    expect(footSpans[1].textContent).toBe("WAITING");
  });
});

describe("useHamClockSessionTrend stamp-only refresh", () => {
  it("appends a new sample when the stamp advances even though the value is unchanged", () => {
    const key = "test-stamp-only-refresh";
    const { result, rerender } = renderHook(
      (props: { value: number; stamp: number }) =>
        useHamClockSessionTrend(key, props.value, props.stamp),
      {
        initialProps: {
          value: 42,
          stamp: Date.parse("2026-09-05T12:50:00Z"),
        },
      },
    );
    expect(result.current).toHaveLength(1);

    // Same value, later stamp — a stable feed's refresh, not a genuine
    // change. Without threading the stamp into the effect's dependencies,
    // this would be a no-op and the series would plateau at one point.
    rerender({ value: 42, stamp: Date.parse("2026-09-05T12:55:00Z") });

    expect(result.current).toHaveLength(2);
    expect(result.current.map((p) => p.value)).toEqual([42, 42]);
    expect(result.current[1].timestamp).toBe(
      new Date("2026-09-05T12:55:00Z").toISOString(),
    );
  });

  it("keeps the existing dedupe-by-value behaviour when no stamp is given", () => {
    const key = "test-no-stamp-dedupe";
    const { result, rerender } = renderHook(
      (props: { value: number }) => useHamClockSessionTrend(key, props.value),
      { initialProps: { value: 7 } },
    );
    expect(result.current).toHaveLength(1);

    // Re-render with the identical value and no stamp: same as before this
    // fix, a rerender alone (no dependency change) samples nothing new.
    rerender({ value: 7 });
    expect(result.current).toHaveLength(1);
  });
});
