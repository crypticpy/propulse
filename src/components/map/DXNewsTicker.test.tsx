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
});
