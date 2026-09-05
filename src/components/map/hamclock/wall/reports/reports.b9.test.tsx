import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SolarMiniChart } from "@/components/solar/SolarMiniChart";
import { HamClockPinnedReportHost } from "./WallReport";
import { WeatherReport } from "./WeatherReport";
import { BestBandReport } from "./BestBandReport";
import { ForecastReport } from "./ForecastReport";

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
    selector({ setBandFocus: mocks.setBandFocus }),
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
      scope: { id: "regional:NA", label: "North America" },
      activityScope: { type: "regional", continent: "NA" },
    });
  });

  it("renders bands ranked by ladder state, sets band focus and spot filters on row click, and shows the surprise section only for surprise entries", async () => {
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

    // Surprise section: only 17m qualifies (stirring+ while physics closed).
    const captions = Array.from(
      dialog.querySelectorAll(".hcr-bandtable-caption"),
    ).map((el) => el.textContent);
    expect(captions.some((c) => c?.includes("Surprise activity"))).toBe(true);
  });

  it("omits the surprise section when nothing in the ladder is surprising", () => {
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
      scope: { id: "regional:NA", label: "North America" },
      activityScope: { type: "regional", continent: "NA" },
    });

    render(<BestBandReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const captions = Array.from(
      dialog.querySelectorAll(".hcr-bandtable-caption"),
    ).map((el) => el.textContent);
    expect(captions.some((c) => c?.includes("Surprise activity"))).toBe(false);
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
