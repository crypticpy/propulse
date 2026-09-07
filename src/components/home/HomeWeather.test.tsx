import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HomeWeather } from "./HomeWeather";

const queryMocks = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("@tanstack/react-query", () => queryMocks);

const state = vi.hoisted(() => ({
  location: { id: "home", name: "Home", grid: "DM79", lat: 39.5, lon: -105 },
}));
vi.mock("@/hooks/useHomeLocation", () => ({
  useHomeLocation: () => ({ location: state.location, guest: false }),
}));

const NOW = Date.parse("2026-09-05T12:00:00Z");

function weatherData(overrides: Record<string, unknown> = {}) {
  return {
    at: NOW,
    timezone: "UTC",
    temperature: 18,
    wind: 10,
    gusts: null,
    code: 0,
    hours: [
      { at: NOW + 1 * 3600000, temperature: 16, rain: 10, wind: 5 },
      { at: NOW + 3 * 3600000, temperature: 22, rain: 0, wind: 5 },
      { at: NOW + 5 * 3600000, temperature: 19, rain: 0, wind: 5 },
      { at: NOW + 10 * 3600000, temperature: 14, rain: 0, wind: 5 },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  state.location = { id: "home", name: "Home", grid: "DM79", lat: 39.5, lon: -105 };
  queryMocks.useQuery.mockReturnValue({
    data: weatherData(),
    isError: false,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  });
});

afterEach(() => cleanup());

it("renders a hero, one sub line, and exactly one Details button", () => {
  render(<HomeWeather now={NOW} />);
  expect(screen.getByText("18° C")).toBeTruthy();
  const buttons = screen.getAllByRole("button", { name: "Local weather details" });
  expect(buttons).toHaveLength(1);
  expect(buttons[0].textContent).toBe("Details");
  expect(buttons[0].getAttribute("aria-haspopup")).toBe("dialog");
  expect(document.querySelectorAll(".home-card-sub")).toHaveLength(1);
  expect(screen.getByText("Next 6h · 16–22° C")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("opens a dialog with the hourly rows, model time, attribution, and refresh", () => {
  render(<HomeWeather now={NOW} />);
  fireEvent.click(screen.getByRole("button", { name: "Local weather details" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/Weather by Open-Meteo/)).toBeTruthy();
  expect(within(dialog).getByRole("button", { name: "Refresh weather" })).toBeTruthy();
  expect(within(dialog).getByText(/Current model time/)).toBeTruthy();
  expect(document.querySelectorAll(".home-weather-hours > div").length).toBeGreaterThan(0);
});

it("shows no Details button and no hero when the location is unset", () => {
  state.location = null as unknown as typeof state.location;
  queryMocks.useQuery.mockReturnValue({
    data: undefined,
    isError: false,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  render(<HomeWeather now={NOW} />);
  expect(screen.queryByRole("button", { name: "Local weather details" })).toBeNull();
  expect(screen.getByText("Set your location for local weather. No sign-in needed.")).toBeTruthy();
});

it("keeps Refresh available when the reading is unavailable", () => {
  const refetch = vi.fn();
  queryMocks.useQuery.mockReturnValue({
    data: undefined,
    isError: true,
    isPending: false,
    isFetching: false,
    refetch,
  });
  render(<HomeWeather now={NOW} />);
  expect(
    screen.getByText("Weather updates are unavailable. We retry automatically."),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Local weather details" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Refresh weather" }));
  expect(refetch).toHaveBeenCalledTimes(1);
});
