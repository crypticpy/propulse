import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BandActivityTile } from "../tiles/BandActivityTile";
import { BandActivityReport } from "./BandActivityReport";
import { ForecastReport } from "./ForecastReport";
import { SolarReport } from "./SolarReport";
import { WeatherReport } from "./WeatherReport";

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
}));

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
    selector({ timeOffset: 0, absoluteTime: null }),
}));

/** `useSolarResource` hands back the validated envelope, not a bare payload. */
function envelope<T>(data: T) {
  return {
    data: { envelope: { data, observedAt: "2026-09-05T13:00:00Z" } },
    isError: false,
    isPending: false,
  };
}

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
    scope: { id: "regional:NA", label: "North America" },
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
});

describe("wall reports", () => {
  it("renders the report shell as a modal dialog", () => {
    render(<BandActivityReport open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.className).toContain("hcr");
    // Hero, verdict and one fact, at report size.
    expect(dialog.querySelector(".hcr-hero")?.textContent).toBe("20M");
    expect(dialog.querySelector(".hcr-verdict")?.textContent).toBe("470");
    expect(screen.getByText("886")).toBeTruthy();
  });

  it("closes on Escape", () => {
    const close = vi.fn();
    render(<BandActivityReport open onClose={close} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(close).toHaveBeenCalledOnce();
  });

  it("opens from its tile and hands focus back on close", async () => {
    const user = userEvent.setup();
    render(<BandActivityTile />);

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
});

describe("ForecastReport muf focus", () => {
  it("renders the MUF hero and facts without a DX target", () => {
    // The reliability matrix has no target, but the MUF only needs a QTH
    // and SFI, so a `muf`-focused open must still draw the hero.
    mocks.reliability.mockReturnValue({
      status: "no-target",
      cells: new Map(),
      hour: 13,
      hourIndex: 0,
      targetLabel: "DX target",
      mode: "SSB",
    });

    render(<ForecastReport open onClose={vi.fn()} focus="muf" />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-hero")?.textContent).toContain("MHz");
    const facts = Array.from(dialog.querySelectorAll(".hcr-facts > div")).map(
      (row) => row.textContent,
    );
    expect(facts.some((row) => row?.startsWith("SFI"))).toBe(true);
    expect(screen.queryByText("NO PATH")).toBeNull();
    // The matrix body still has nothing to draw without a target.
    expect(screen.getByText(/Pick a target on the map/)).toBeTruthy();
  });

  it("still shows the idle shell for a non-MUF focus with no target", () => {
    mocks.reliability.mockReturnValue({
      status: "no-target",
      cells: new Map(),
      hour: 13,
      hourIndex: 0,
      targetLabel: "DX target",
      mode: "SSB",
    });

    render(<ForecastReport open onClose={vi.fn()} focus="reliability" />);

    expect(screen.getByText("NO PATH")).toBeTruthy();
    expect(screen.getByText(/Pick a target on the map/)).toBeTruthy();
  });
});

describe("ForecastReport reliability matrix", () => {
  it("keys the hero and matrix cells by absolute hourIndex, not the clock hour", () => {
    // `hourIndex` (whole UTC hours since epoch) is deliberately far from
    // `hour` (0-23) so a lookup that mistakenly uses `hour` as the cache key
    // finds nothing and this test catches it.
    const hour = 13;
    const hourIndex = 500_000;
    const cells = new Map([
      [
        `20m:${hourIndex}`,
        {
          band: "20m" as const,
          hour,
          score: 82,
          snrEstimate: 0,
          confidence: 50,
          status: "good" as const,
        },
      ],
    ]);
    mocks.reliability.mockReturnValue({
      status: "ready",
      cells,
      hour,
      hourIndex,
      targetLabel: "Tokyo",
      mode: "SSB",
    });

    render(<ForecastReport open onClose={vi.fn()} focus="forecast" />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-hero")?.textContent).toBe("20M");
    expect(dialog.querySelector(".hcr-verdict")?.textContent).toBe("82%");
    const litDots = dialog.querySelectorAll(".hcf-dot:not(.hcf-dot--off)");
    expect(litDots.length).toBeGreaterThanOrEqual(1);
  });
});

describe("SolarReport wind focus", () => {
  it("uses the worse of Bz and wind-speed severity for the wind hero", () => {
    // Bz is northward (good), but the stream is high-speed (bad) — the
    // report must not paint the hero good just because Bz alone is quiet.
    mocks.solar.mockImplementation((sourceId: string) => {
      if (sourceId === "swpc-solar-wind-plasma") {
        return envelope([
          {
            time_tag: "2026-09-05T12:55:00Z",
            speed: 700,
            density: 3,
            temperature: 1,
          },
        ]);
      }
      if (sourceId === "swpc-solar-wind-mag") {
        return envelope([
          {
            time_tag: "2026-09-05T12:55:00Z",
            bx_gsm: 0,
            by_gsm: 0,
            bz_gsm: 2,
            bt: 2,
          },
        ]);
      }
      return EMPTY_RESOURCE;
    });

    render(<SolarReport open onClose={vi.fn()} focus="wind" />);

    expect(screen.getByText("HIGH SPEED")).toBeTruthy();
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-hero")?.className).toContain("hc-bad");
    expect(dialog.querySelector(".hcr-hero")?.className).not.toContain(
      "hc-good",
    );
  });

  it("stays good when both Bz and wind speed are quiet", () => {
    mocks.solar.mockImplementation((sourceId: string) => {
      if (sourceId === "swpc-solar-wind-plasma") {
        return envelope([
          {
            time_tag: "2026-09-05T12:55:00Z",
            speed: 350,
            density: 3,
            temperature: 1,
          },
        ]);
      }
      if (sourceId === "swpc-solar-wind-mag") {
        return envelope([
          {
            time_tag: "2026-09-05T12:55:00Z",
            bx_gsm: 0,
            by_gsm: 0,
            bz_gsm: 1,
            bt: 1,
          },
        ]);
      }
      return EMPTY_RESOURCE;
    });

    render(<SolarReport open onClose={vi.fn()} focus="wind" />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-hero")?.className).toContain("hc-good");
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
