import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatLocationTime } from "@/lib/hamclock/locationConditions";
import { HamClockLocationConditions } from "./HamClockLocationConditions";

const { useLocationWeatherMock } = vi.hoisted(() => ({
  useLocationWeatherMock: vi.fn(),
}));

vi.mock("@/hooks/useLocalWeather", () => ({
  useLocationWeather: useLocationWeatherMock,
}));

describe("HamClockLocationConditions", () => {
  beforeEach(() => {
    useLocationWeatherMock.mockReset();
  });

  it("formats the coordinate timezone rather than the browser timezone", () => {
    expect(
      formatLocationTime(
        new Date("2026-08-31T12:00:00.000Z"),
        "Pacific/Kiritimati",
      ),
    ).toMatch(/^02:00 GMT\+14$/);
  });

  it("shows the resolved local clock and current weather", () => {
    useLocationWeatherMock.mockReturnValue({
      weather: {
        timezone: "America/Chicago",
        temperature: 27.6,
        windSpeed: 18.2,
        windDirection: 225,
        weatherCode: 2,
        isDay: true,
        precipitation: 0,
        humidity: 64,
        pressure: 1012,
      },
      isLoading: false,
      error: null,
      hasLocation: true,
    });

    render(
      <HamClockLocationConditions
        latitude={41.88}
        longitude={-87.63}
        displayTime={new Date("2026-08-31T12:00:00.000Z")}
        stationLabel="DX"
      />,
    );

    expect(screen.getByLabelText("DX local conditions")).toBeTruthy();
    expect(screen.getByText("07:00 CDT")).toBeTruthy();
    expect(screen.getByText("Partly cloudy")).toBeTruthy();
    expect(screen.getByText("28°C")).toBeTruthy();
    expect(screen.getByText(/18 km\/h SW/)).toBeTruthy();
    expect(screen.getByText("RH 64%")).toBeTruthy();
  });

  it("keeps local time visible when weather is unavailable", () => {
    useLocationWeatherMock.mockReturnValue({
      weather: null,
      isLoading: false,
      error: new Error("network down"),
      hasLocation: true,
    });

    render(
      <HamClockLocationConditions
        latitude={51.5}
        longitude={-0.1}
        displayTime={new Date("2026-01-15T12:00:00.000Z")}
        timeZone="Europe/London"
        stationLabel="DE"
      />,
    );

    expect(screen.getByText("12:00 GMT")).toBeTruthy();
    expect(screen.getByText("Weather unavailable")).toBeTruthy();
  });
});
