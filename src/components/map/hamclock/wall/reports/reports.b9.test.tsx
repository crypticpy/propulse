import { useState } from "react";
import { render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SolarMiniChart } from "@/components/solar/SolarMiniChart";
import { HamClockPinnedReportHost } from "./WallReport";
import { WeatherReport } from "./WeatherReport";
import { BestBandReport } from "./BestBandReport";
import { ForecastReport } from "./ForecastReport";
import { useHamClockSessionTrend } from "./sessionTrend";

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
  it("SolarMiniChart draws its observed series through the --hcr-chart-* token with a hex fallback", () => {
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
      "var(--hcr-chart-observed, #44ddff)",
    );
  });

  it("carries the same var(--hcr-chart-*, hex) contract outside a [data-hamclock-theme] ancestor, so /solar looks unchanged", () => {
    // No data-hamclock-theme ancestor is present in this render — the CSS
    // scoping in hamclock-wall-report.css only rebinds the variable under
    // that attribute, so the /solar page keeps the literal fallback colour.
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
    expect(container.innerHTML).toContain("var(--hcr-chart-observed, #44ddff)");
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
    render(<BestBandReport open onClose={vi.fn()} />);

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
    expect(mocks.setSpotFilters).toHaveBeenCalledWith(
      expect.objectContaining({ bands: ["17m"] }),
    );

    // Surprise is a status in the ranked row (17m: stirring+ while physics
    // closed) and a count in the caption, not a second table (#250 S6).
    expect(rows[1].textContent).toContain("SURPRISE");
    expect(rows[0].textContent).not.toContain("SURPRISE");
    const captions = Array.from(
      dialog.querySelectorAll(".hcr-bandtable-caption"),
    ).map((el) => el.textContent);
    expect(captions.some((c) => c?.includes("1 surprise"))).toBe(true);
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

describe("ForecastReport model horizons (HW-17)", () => {
  beforeEach(() => {
    mocks.reliability.mockReturnValue({
      status: "ready",
      cells: new Map(),
      hour: 13,
      hourIndex: 500_000,
      targetLabel: "Tokyo",
      mode: "SSB",
    });
  });

  it("marks no matrix columns and adds no MODEL fact when no horizon is activated", () => {
    mocks.horizonActivated.mockReturnValue(false);
    render(<ForecastReport open onClose={vi.fn()} focus="forecast" />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-matrix-head--model")).toBeNull();
    const facts = Array.from(dialog.querySelectorAll(".hcr-facts > div")).map(
      (row) => row.textContent,
    );
    expect(facts.some((row) => row?.startsWith("MODEL"))).toBe(false);
  });

  it("marks the matching matrix column and adds a MODEL fact once a horizon is activated", () => {
    mocks.horizonActivated.mockImplementation((h: number) => h === 3);
    render(<ForecastReport open onClose={vi.fn()} focus="forecast" />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-matrix-head--model")).not.toBeNull();
    const facts = Array.from(dialog.querySelectorAll(".hcr-facts > div")).map(
      (row) => row.textContent,
    );
    expect(facts.some((row) => row?.includes("+3H"))).toBe(true);
  });

  it("highlights the whole current-hour column: labelled header pill plus a ring on every band dot", () => {
    // hour=13 is not a multiple of 3, so without the highlight its label
    // would be blank; the active hour must always print its own label.
    mocks.horizonActivated.mockReturnValue(false);
    render(<ForecastReport open onClose={vi.fn()} focus="forecast" />);

    const dialog = screen.getByRole("dialog");
    const heads = dialog.querySelectorAll(".hcr-matrix-head");
    expect(heads).toHaveLength(24);
    heads.forEach((head, column) => {
      expect(head.classList.contains("hcr-matrix-head--now")).toBe(
        column === 13,
      );
    });
    expect(heads[13].textContent).toBe("13");
    expect(heads[14].textContent).toBe("");

    // One grid, one band per row of 24 dots: every row rings column 13 only.
    const dots = dialog.querySelectorAll(".hcr-matrix .hcf-dot");
    expect(dots.length % 24).toBe(0);
    expect(dots.length).toBeGreaterThan(0);
    dots.forEach((dot, index) => {
      expect(dot.classList.contains("hcr-dot--now")).toBe(index % 24 === 13);
    });
  });

  it("marks the exact absolute hour column, not one wrapped modulo 24", () => {
    // hour=13, horizon=3 -> column 16. A `% 24` implementation would also
    // land on 16 here (no wrap), so this pins the in-range case precisely.
    mocks.horizonActivated.mockImplementation((h: number) => h === 3);
    render(<ForecastReport open onClose={vi.fn()} focus="forecast" />);

    const dialog = screen.getByRole("dialog");
    const heads = dialog.querySelectorAll(".hcr-matrix-head");
    expect(heads).toHaveLength(24);
    heads.forEach((head, column) => {
      expect(head.classList.contains("hcr-matrix-head--model")).toBe(
        column === 16,
      );
    });
  });

  it("marks no column for a horizon that crosses midnight, and never marks +24H on the current-hour cell", () => {
    // hour=22: +6H is 04Z tomorrow (22+6=28, outside the displayed 0-23
    // range). A `(hour + horizon) % 24` implementation would wrongly mark
    // column 4 of *today*. +24H (22+24=46) is also always out of range, so
    // it must never land back on the current-hour column (22).
    mocks.reliability.mockReturnValue({
      status: "ready",
      cells: new Map(),
      hour: 22,
      hourIndex: 500_000,
      targetLabel: "Tokyo",
      mode: "SSB",
    });
    mocks.horizonActivated.mockImplementation(
      (h: number) => h === 6 || h === 24,
    );
    render(<ForecastReport open onClose={vi.fn()} focus="forecast" />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-matrix-head--model")).toBeNull();
    expect(
      dialog.querySelector(".hcr-matrix-head--now.hcr-matrix-head--model"),
    ).toBeNull();
    const srHeaders = Array.from(
      dialog.querySelectorAll("table.sr-only thead th"),
    ).map((th) => th.textContent);
    expect(srHeaders.some((text) => text?.includes("(model)"))).toBe(false);
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
