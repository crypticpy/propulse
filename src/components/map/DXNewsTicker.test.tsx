import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SolarAlert } from "@/types/alerts";
import type { WeatherAlert } from "@/lib/api/weather";
import { DXNewsTicker } from "./DXNewsTicker";

const hookData = vi.hoisted(() => ({
  solarAlerts: [] as SolarAlert[],
  weatherAlerts: [] as WeatherAlert[],
  lightningStrikes: [] as Array<{
    lat: number;
    lon: number;
    time: number;
    currentKA: number;
  }>,
  station: { lat: 0, lon: 0 },
  tickerCoverageArea: "regional" as "nearby" | "regional" | "wide",
  feeds: [
    {
      id: "arrl",
      url: "https://example.com/feed.xml",
      label: "ARRL",
      crawlEnabled: true,
      crawlMaxAgeHours: 24 as const,
    },
  ],
  crawlPreferences: {
    solarThreshold: "INFO" as "INFO" | "WARNING" | "CRITICAL" | "off",
    weatherThreshold: "Moderate" as
      | "Moderate"
      | "Severe"
      | "Extreme"
      | "off",
    breakInToneEnabled: true,
    breakInVolume: 45,
    dedupMinutes: 360 as const,
  },
  rssResults: [] as Array<{
    source: { id: string; url: string };
    feed: { title: string; link: string | null } | null;
    items: Array<{
      id: string | null;
      title: string;
      link: string | null;
      publishedAt: string | null;
      summary: string;
    }>;
    status: string;
    isLoading: boolean;
    error: Error | null;
  }>,
  playAlertTone: vi.fn(),
}));

vi.mock("@/hooks/useSolarData", () => ({
  useKIndex: () => ({ data: [] }),
  useSolarFlux: () => ({ data: [] }),
}));

vi.mock("@/hooks/useSolarAlerts", () => ({
  useSolarAlerts: () => ({
    activeAlerts: hookData.solarAlerts,
    hasAlerts: hookData.solarAlerts.length > 0,
  }),
}));

vi.mock("@/hooks/useWeatherAlerts", () => ({
  useWeatherAlerts: () => ({ alerts: hookData.weatherAlerts }),
}));

vi.mock("@/hooks/useLightning", () => ({
  useLightning: () => ({ strikes: hookData.lightningStrikes }),
}));

vi.mock("@/stores/dxStore", () => ({
  useDXStore: (selector: (state: { spots: never[] }) => unknown) =>
    selector({ spots: [] }),
}));

vi.mock("@/stores/userStore", () => ({
  useUserStore: (
    selector: (state: { station: { lat: number; lon: number } }) => unknown,
  ) => selector({ station: hookData.station }),
}));

vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: (
    selector: (state: {
      tickerCoverageArea: "nearby" | "regional" | "wide";
    }) => unknown,
  ) => selector({ tickerCoverageArea: hookData.tickerCoverageArea }),
}));

vi.mock("@/stores/feedStore", () => ({
  useFeedStore: (
    selector: (state: {
      feeds: typeof hookData.feeds;
      crawlPreferences: typeof hookData.crawlPreferences;
    }) => unknown,
  ) =>
    selector({
      feeds: hookData.feeds,
      crawlPreferences: hookData.crawlPreferences,
    }),
}));

vi.mock("@/hooks/useRssFeed", () => ({
  useRssFeeds: () => hookData.rssResults,
  relativeTime: () => "2h ago",
}));

vi.mock("@/lib/audio/alertSynthesizer", () => ({
  playAlertTone: hookData.playAlertTone,
}));

vi.mock("@/components/map/TickerCrawlSettingsDialog", () => ({
  TickerCrawlSettingsDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Crawl settings</div> : null,
}));

// Keep the component test focused on ticker routing. The rich alert dialogs
// have their own contract tests and are loaded lazily in production.
vi.mock("@/components/alerts/AlertDetailModal", () => ({
  AlertDetailModal: ({
    isOpen,
    alert,
  }: {
    isOpen: boolean;
    alert: SolarAlert | null;
  }) =>
    isOpen && alert ? (
      <div role="dialog" aria-label="Solar alert detail">
        {alert.message}
      </div>
    ) : null,
}));

vi.mock("@/components/map/WeatherAlertModal", () => ({
  WeatherAlertModal: ({ alert }: { alert: WeatherAlert | null }) =>
    alert ? (
      <div role="dialog" aria-label="Weather alert detail">
        {alert.headline}
      </div>
    ) : null,
}));

const solarAlert: SolarAlert = {
  id: "solar-1",
  type: "GEOMAGNETIC_STORM",
  priority: "WARNING",
  status: "ACTIVE",
  title: "Geomagnetic storm in progress",
  message: "Kp 6 conditions are affecting HF paths.",
  affectedBands: ["80m", "40m"],
  triggeredAt: "2026-08-31T05:00:00.000Z",
  expiresAt: "2026-08-31T09:00:00.000Z",
  source: "K_INDEX",
  thresholdValue: 5,
  currentValue: 6,
};

const weatherAlert: WeatherAlert = {
  id: "weather-1",
  event: "Severe Thunderstorm Warning",
  headline: "Severe thunderstorms remain possible across the test area.",
  severity: "Severe",
  lat: 5,
  lon: 0,
  areaDesc: "Test County",
  urgency: "Immediate",
  certainty: "Observed",
  response: "Shelter",
  instruction: "Move indoors.",
  polygon: null,
};

describe("DXNewsTicker", () => {
  beforeEach(() => {
    hookData.solarAlerts = [];
    hookData.weatherAlerts = [];
    hookData.lightningStrikes = [];
    hookData.tickerCoverageArea = "regional";
    hookData.rssResults = [];
    hookData.crawlPreferences.solarThreshold = "INFO";
    hookData.crawlPreferences.weatherThreshold = "Moderate";
    hookData.playAlertTone.mockReset();
    localStorage.clear();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  it("opens the existing solar alert detail from a live notice", async () => {
    hookData.solarAlerts = [solarAlert];
    render(<DXNewsTicker />);

    fireEvent.click(
      screen.getByRole("button", {
        name: /Geomagnetic storm in progress\. Open details/i,
      }),
    );

    expect(
      (
        await screen.findByRole("dialog", { name: "Solar alert detail" })
      ).textContent,
    ).toContain("Kp 6 conditions are affecting HF paths.");
  });

  it("applies the chosen station-centered area and opens weather details", async () => {
    hookData.weatherAlerts = [weatherAlert];
    hookData.tickerCoverageArea = "nearby";
    const { rerender } = render(<DXNewsTicker />);

    expect(
      screen.queryByRole("button", { name: /Severe Thunderstorm Warning/i }),
    ).toBeNull();

    hookData.tickerCoverageArea = "regional";
    rerender(<DXNewsTicker />);
    const notice = await screen.findByRole("button", {
      name: /Severe Thunderstorm Warning.*Open details/i,
    });
    fireEvent.click(notice);

    expect(
      (
        await screen.findByRole("dialog", { name: "Weather alert detail" })
      ).textContent,
    ).toContain("Severe thunderstorms remain possible");
  });

  it("shows lightning magnitude and scope in an accessible detail dialog", async () => {
    hookData.lightningStrikes = [
      { lat: 2, lon: 0, time: Date.now(), currentKA: -32 },
    ];
    render(<DXNewsTicker />);

    fireEvent.click(
      screen.getByRole("button", { name: /Lightning .*Open details/i }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Lightning & QRN Detail",
    });
    expect(dialog.textContent).toContain("32 kA");
    expect(dialog.textContent).toContain("lightning within 500 km");
  });

  it("stays paused until both pointer hover and keyboard focus have left", () => {
    hookData.solarAlerts = [solarAlert];
    localStorage.setItem(
      "propulse-ticker-breakins-v1",
      JSON.stringify({ "alert-solar-1": Date.now() }),
    );
    render(<DXNewsTicker />);

    const ticker = screen.getByRole("marquee");
    const track = screen.getByTestId("dx-ticker-track");
    const notice = screen.getByRole("button", {
      name: /Geomagnetic storm in progress\. Open details/i,
    });

    fireEvent.focus(notice);
    fireEvent.mouseEnter(ticker);
    fireEvent.mouseLeave(ticker);
    expect(track.style.animationPlayState).toBe("paused");

    fireEvent.blur(notice, { relatedTarget: document.body });
    expect(track.style.animationPlayState).toBe("running");
  });

  it("renders the seamless duplicate as non-interactive text", () => {
    hookData.solarAlerts = [solarAlert];
    render(<DXNewsTicker />);

    const duplicate = document.querySelector<HTMLElement>(
      '[data-ticker-duplicate="true"]',
    );
    expect(duplicate).not.toBeNull();
    expect(duplicate?.className).toContain("pointer-events-none");
    expect(duplicate?.querySelector("button")).toBeNull();
  });

  it("breaks in once without duplicating globally owned solar audio", async () => {
    hookData.solarAlerts = [solarAlert];
    const first = render(<DXNewsTicker />);

    expect(
      (await screen.findByTestId("ticker-break-in")).textContent,
    ).toContain("Geomagnetic storm in progress");
    expect(hookData.playAlertTone).not.toHaveBeenCalled();

    first.unmount();
    render(<DXNewsTicker />);

    expect(screen.queryByTestId("ticker-break-in")).toBeNull();
    expect(hookData.playAlertTone).not.toHaveBeenCalled();
  });

  it("keeps alerts in the crawl when break-in thresholds are off", () => {
    hookData.solarAlerts = [solarAlert];
    hookData.weatherAlerts = [weatherAlert];
    hookData.crawlPreferences.solarThreshold = "off";
    hookData.crawlPreferences.weatherThreshold = "off";

    render(<DXNewsTicker />);

    expect(screen.queryByTestId("ticker-break-in")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: /Geomagnetic storm in progress\. Open details/i,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /Severe Thunderstorm Warning.*Open details/i,
      }),
    ).toBeTruthy();
  });

  it("presents only the highest simultaneous alert and deduplicates its cohort", async () => {
    hookData.solarAlerts = [solarAlert];
    hookData.weatherAlerts = [
      {
        ...weatherAlert,
        id: "weather-extreme",
        event: "Tornado Emergency",
        severity: "Extreme",
      },
    ];
    const first = render(<DXNewsTicker />);

    expect(
      (await screen.findByTestId("ticker-break-in")).textContent,
    ).toContain("Tornado Emergency");
    expect(hookData.playAlertTone).toHaveBeenCalledWith(
      "CRITICAL",
      undefined,
      45,
    );

    first.unmount();
    render(<DXNewsTicker />);
    expect(screen.queryByTestId("ticker-break-in")).toBeNull();
    expect(hookData.playAlertTone).toHaveBeenCalledTimes(1);
  });

  it("adds configured RSS headlines and opens their source detail", async () => {
    hookData.rssResults = [
      {
        source: { id: "arrl", url: "https://example.com/feed.xml" },
        feed: { title: "ARRL", link: "https://example.com" },
        items: [
          {
            id: "news-1",
            title: "Field Day update",
            link: "https://example.com/field-day",
            publishedAt: new Date().toISOString(),
            summary: "Latest operating guidance.",
          },
        ],
        status: "ok",
        isLoading: false,
        error: null,
      },
    ];
    render(<DXNewsTicker />);

    fireEvent.click(
      screen.getByRole("button", {
        name: /ARRL: Field Day update.*Open details/i,
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Field Day update",
    });
    expect(dialog.textContent).toContain("Latest operating guidance.");
    expect(
      screen.getByRole("link", { name: "Open source" }).getAttribute("href"),
    ).toBe("https://example.com/field-day");
  });

  it("opens crawl configuration from the pinned control", async () => {
    render(<DXNewsTicker />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Configure alert and news crawl",
      }),
    );

    expect((await screen.findByRole("dialog")).textContent).toContain(
      "Crawl settings",
    );
  });
});
