import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BandActivityTile } from "./BandActivityTile";
import { GreyLineTile } from "./GreyLineTile";
import { MoonTile } from "./MoonTile";
import { RecentContactsTile } from "./RecentContactsTile";
import { SolarWindTile } from "./SolarWindTile";
import { SpaceWxTile } from "./SpaceWxTile";
import { SunTile } from "./SunTile";
import { WeatherTile } from "./WeatherTile";
import { XrayTile } from "./XrayTile";

const mocks = vi.hoisted(() => ({
  verdicts: vi.fn(),
  activity: vi.fn(),
  location: vi.fn(),
  solar: vi.fn(),
  weather: vi.fn(),
  contacts: vi.fn(),
}));

vi.mock("@/hooks/useBandVerdicts", () => ({ useBandVerdicts: mocks.verdicts }));
vi.mock("@/hooks/useBandActivity", () => ({ useBandActivity: mocks.activity }));
vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: mocks.location,
}));
vi.mock("@/hooks/useSolarResource", () => ({
  useSolarResource: (sourceId: string) => mocks.solar(sourceId),
}));
vi.mock("@/hooks/useLocalWeather", () => ({
  useLocationWeather: mocks.weather,
}));
vi.mock("@/lib/hamclock/recentContacts", () => ({
  readHamClockContacts: mocks.contacts,
}));

/** Austin, TX — the QTH the approved mock is drawn around. */
const AUSTIN = {
  id: "home",
  name: "Austin",
  grid: "EM10dg",
  lat: 30.27,
  lon: -97.74,
  type: "home" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** `useSolarResource` hands back the validated envelope, not a bare payload. */
function envelope<T>(data: T) {
  return {
    data: { envelope: { data, observedAt: "2026-09-05T13:00:00Z" } },
    isError: false,
    isPending: false,
  };
}

const EMPTY = { data: undefined, isError: false, isPending: true };
const FAILED = { data: undefined, isError: true, isPending: false };

function draw(node: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
  mocks.verdicts.mockReturnValue({
    bands: [],
    ready: true,
    scope: { id: "regional:NA", label: "North America" },
    activityScope: { type: "regional", continent: "NA" },
  });
  mocks.activity.mockReturnValue({
    data: undefined,
    isPending: true,
    isError: false,
  });
  mocks.location.mockReturnValue(AUSTIN);
  mocks.solar.mockReturnValue(EMPTY);
  mocks.weather.mockReturnValue({
    weather: null,
    isLoading: true,
    error: null,
    hasLocation: true,
  });
  mocks.contacts.mockResolvedValue([]);
});

describe("BandActivityTile", () => {
  it("leads with the hottest band and its count", () => {
    mocks.activity.mockReturnValue({
      data: new Map([
        ["20m", { band: "20m", count60m: 470 }],
        ["40m", { band: "40m", count60m: 416 }],
        ["10m", { band: "10m", count60m: 0 }],
      ]),
      isPending: false,
      isError: false,
    });
    const { container } = draw(<BandActivityTile />);
    expect(container.querySelector(".hc-hero")?.textContent).toBe("20M");
    expect(container.querySelector(".hc-verdict")?.textContent).toBe("470");
    // The zero-count band is dropped rather than drawn as an empty bar.
    expect(screen.queryByText("10m")).toBeNull();
  });

  it("explains an empty feed instead of drawing an empty chart", () => {
    draw(<BandActivityTile />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("Counting spots…")).toBeTruthy();
  });
});

describe("GreyLineTile", () => {
  it("names the half of the day and counts down to the next crossing", () => {
    draw(<GreyLineTile />);
    // 13:14Z is mid-morning in Austin, so the next crossing is sunset.
    expect(screen.getByText("DAY")).toBeTruthy();
    expect(screen.getByText(/SUNSET IN/)).toBeTruthy();
  });

  it("asks for a QTH when none is configured", () => {
    mocks.location.mockReturnValue(null);
    draw(<GreyLineTile />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(
      screen.getByText("Set your QTH to track the terminator"),
    ).toBeTruthy();
  });
});

describe("XrayTile", () => {
  it("shows the GOES class and puts the marker on its decade", () => {
    mocks.solar.mockReturnValue(
      envelope([
        {
          time_tag: "2026-09-05T13:10:00Z",
          flux: 2.4e-6,
          energy: "0.1-0.8nm",
          satellite: 19,
        },
      ]),
    );
    const { container } = draw(<XrayTile />);
    expect(container.querySelector(".hc-hero")?.textContent).toBe("C2.4");
    expect(screen.getByText("GOES-19")).toBeTruthy();
    // C sits in the third of five decades: 40 % + log10(2.4) / 5.
    const marker = container.querySelector(".hc-gbar i") as HTMLElement;
    expect(Number.parseFloat(marker.style.left)).toBeCloseTo(47.6, 0);
  });

  it("says the feed is down rather than rendering an empty bar", () => {
    mocks.solar.mockReturnValue(FAILED);
    draw(<XrayTile />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("GOES X-ray feed unavailable")).toBeTruthy();
  });
});

describe("SolarWindTile", () => {
  it("reads speed and Bz from the two L1 feeds", () => {
    mocks.solar.mockImplementation((sourceId: string) =>
      sourceId === "swpc-solar-wind-plasma"
        ? envelope([
            {
              time_tag: "2026-09-05T13:12:00Z",
              speed: 367,
              density: 4.2,
              temperature: 90_000,
            },
          ])
        : envelope([
            {
              time_tag: "2026-09-05T13:12:00Z",
              bx_gsm: 1,
              by_gsm: 2,
              bz_gsm: 1.4,
              bt: 5,
            },
          ]),
    );
    draw(<SolarWindTile />);
    expect(screen.getByText("367")).toBeTruthy();
    expect(screen.getByText("+1.4")).toBeTruthy();
    expect(screen.getByText("QUIET STREAM")).toBeTruthy();
  });

  it("keeps both gauges with a dash when L1 is silent", () => {
    mocks.solar.mockReturnValue(FAILED);
    draw(<SolarWindTile />);
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("L1 solar-wind feed unavailable")).toBeTruthy();
  });
});

describe("SpaceWxTile", () => {
  it("shows Kp with NOAA's own G, S and R levels", () => {
    mocks.solar.mockImplementation((sourceId: string) => {
      if (sourceId === "noaa-k-index") {
        return envelope([
          {
            time_tag: "2026-09-05T12:00:00Z",
            kp: 1.3,
            kind: "observed",
            noaa_scale: null,
            a_running: null,
          },
        ]);
      }
      if (sourceId === "swpc-scales") {
        return envelope({
          observed_at: "2026-09-05T12:00:00Z",
          radio_blackout: { scale: 0, text: null },
          solar_radiation: { scale: 0, text: null },
          geomagnetic_storm: { scale: 1, text: null },
        });
      }
      return envelope([
        {
          time_tag: "2026-09-05T12:00:00Z",
          flux: 114,
          frequency: 2800,
          schedule: null,
        },
      ]);
    });
    draw(<SpaceWxTile />);
    expect(screen.getByText("1.3")).toBeTruthy();
    expect(screen.getByText(/QUIET/)).toBeTruthy();
    expect(screen.getByText("114")).toBeTruthy();
    expect(screen.getByTitle("Geomagnetic storm scale").textContent).toBe("1G");
  });

  it("explains a missing Kp feed", () => {
    mocks.solar.mockReturnValue(FAILED);
    draw(<SpaceWxTile />);
    expect(screen.getByText("NOAA planetary Kp feed unavailable")).toBeTruthy();
  });
});

describe("SunTile", () => {
  it("titles the next event and heroes the countdown", () => {
    draw(<SunTile />);
    expect(screen.getByText("Sunset")).toBeTruthy();
    expect(screen.getByText(/^\d+h \d+m$/)).toBeTruthy();
  });

  it("asks for a QTH when none is configured", () => {
    mocks.location.mockReturnValue(null);
    draw(<SunTile />);
    expect(
      screen.getByText("Set your QTH to see sunrise and sunset"),
    ).toBeTruthy();
  });
});

describe("WeatherTile", () => {
  it("heroes the temperature with the rain chance beside it", () => {
    mocks.weather.mockReturnValue({
      weather: {
        temperature: 34.4,
        windSpeed: 12,
        windDirection: 180,
        weatherCode: 2,
        isDay: true,
        precipitation: 0,
        precipitationProbability: 20,
        humidity: 40,
        pressure: 1012,
      },
      isLoading: false,
      error: null,
      hasLocation: true,
    });
    draw(<WeatherTile />);
    // EM10 is a US field, so `auto` units resolve to Fahrenheit.
    expect(screen.getByText("94°F")).toBeTruthy();
    expect(screen.getByText("PARTLY CLOUDY")).toBeTruthy();
    expect(screen.getByText("20%")).toBeTruthy();
    expect(screen.getByRole("img", { name: "cloudy" })).toBeTruthy();
  });

  it("names the provider when the fetch fails", () => {
    mocks.weather.mockReturnValue({
      weather: null,
      isLoading: false,
      error: new Error("boom"),
      hasLocation: true,
    });
    draw(<WeatherTile />);
    expect(screen.getByText("Open-Meteo unavailable")).toBeTruthy();
  });
});

describe("MoonTile", () => {
  it("heroes illumination with the phase name underneath", () => {
    draw(<MoonTile />);
    expect(screen.getByText(/^\d+%$/)).toBeTruthy();
    expect(
      screen.getByText(
        /NEW MOON|WAXING|FIRST QUARTER|FULL MOON|LAST QUARTER|WANING/,
      ),
    ).toBeTruthy();
  });

  it("asks for a QTH when none is configured", () => {
    mocks.location.mockReturnValue(null);
    draw(<MoonTile />);
    expect(
      screen.getByText("Set your QTH to see moon rise and set"),
    ).toBeTruthy();
  });
});

describe("RecentContactsTile", () => {
  it("lists the most recent QSOs with their age", async () => {
    mocks.contacts.mockResolvedValue([
      {
        id: "a",
        callsign: "VP6G",
        band: "20m",
        mode: "FT8",
        date: "2026-09-05",
        timeOn: "13:02",
        grid: "AC16",
      },
    ]);
    draw(<RecentContactsTile />);
    expect(await screen.findByText("VP6G")).toBeTruthy();
    expect(screen.getByText("12m")).toBeTruthy();
  });

  it("says the log is empty rather than showing a blank tile", async () => {
    draw(<RecentContactsTile />);
    expect(await screen.findByText("No contacts logged today")).toBeTruthy();
  });
});
