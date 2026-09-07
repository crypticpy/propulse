import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HomeForecastStrip } from "./HomeForecastStrip";
import { OUTLOOK_BANDS } from "@/lib/home/bandOutlook";
import type { useSolarModel } from "@/hooks/useSolarModel";
import type { OperatingLocation } from "@/types/user";

type Model = ReturnType<typeof useSolarModel>;

const state = vi.hoisted(() => ({
  location: null as OperatingLocation | null,
  activeBand: undefined as string | undefined,
}));

vi.mock("@/hooks/useHomeLocation", () => ({
  useHomeLocation: () => ({ location: state.location, guest: false }),
}));
vi.mock("@/hooks/useActiveBandMode", () => ({
  useActiveBand: () => state.activeBand,
}));

const LOCATION = {
  id: "home",
  name: "Home",
  grid: "DM79",
  lat: 39.5,
  lon: -105,
} as OperatingLocation;

const NOW = Date.parse("2026-09-05T23:30:00Z");

function model(overrides: Record<string, unknown> = {}): Model {
  return {
    current: {
      kp: { kp: 2 },
      flux: { flux: 120 },
      predictedKp: [],
      ...(overrides.current as object),
    },
    resources: {
      kp: { state: "fresh" },
      flux: { state: "fresh" },
      forecast: { state: "unavailable", data: undefined },
      ...(overrides.resources as object),
    },
  } as unknown as Model;
}

function renderStrip(overrides?: Record<string, unknown>) {
  return render(
    <MemoryRouter>
      <HomeForecastStrip model={model(overrides)} now={Date.now()} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  state.location = LOCATION;
  state.activeBand = "20m";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("renders 24 hourly cells, each naming its hour and level in words", () => {
  renderStrip();
  const cells = screen.getAllByRole("img");
  expect(cells).toHaveLength(24);
  for (const cell of cells) {
    expect(cell.getAttribute("aria-label")).toMatch(
      /^\d{2} UTC( \(now\))?: (Stronger|Mixed|Limited|Unknown)$/,
    );
    expect(cell.getAttribute("title")).toBeTruthy();
    expect(cell.getAttribute("data-level")).toBeTruthy();
  }
});

it("marks the current UTC hour as now, and only that hour", () => {
  renderStrip();
  const marked = document.querySelectorAll('[data-now="true"]');
  expect(marked).toHaveLength(1);
  // Fake clock is 23:30 UTC, so the strip starts at — and marks — 23 UTC.
  expect(marked[0].getAttribute("aria-label")).toBe("23 UTC (now): Mixed");
  expect(screen.getAllByRole("img")[0]).toBe(marked[0]);
});

it("shows the operator's active band", () => {
  renderStrip();
  expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
    "Next 24 hours on 20m",
  );
  expect(screen.getByText(/Your active band, from DM79\./)).toBeTruthy();
});

it("falls back to the best band right now when there is no active band", () => {
  state.activeBand = undefined;
  renderStrip();
  const heading = screen.getByRole("heading", { level: 2 }).textContent ?? "";
  const band = heading.replace("Next 24 hours on ", "");
  expect(OUTLOOK_BANDS as readonly string[]).toContain(band);
  expect(screen.getByText(/Best band right now, from DM79\./)).toBeTruthy();
  expect(screen.getAllByRole("img")).toHaveLength(24);
});

it("falls back when the active band is outside the model's HF coverage", () => {
  state.activeBand = "2m";
  renderStrip();
  expect(screen.getByText(/Best band right now, from DM79\./)).toBeTruthy();
  expect(screen.getAllByRole("img")).toHaveLength(24);
});

it("renders only the caption link, with no strip, when there is no location", () => {
  state.location = null;
  renderStrip();
  expect(screen.queryAllByRole("img")).toHaveLength(0);
  expect(document.querySelector(".home-forecast-strip-row")).toBeNull();
  expect(document.querySelector(".home-forecast-strip-legend")).toBeNull();
  expect(
    screen.getByText("Set your Home location for a 24-hour band outlook."),
  ).toBeTruthy();
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(1);
  expect(links[0].textContent).toBe(
    "Full 24h grid, path analysis and NowCast in PropSphere →",
  );
  expect(links[0].getAttribute("href")).toBe("/map");
});

it("withholds the strip while Kp or solar flux are unavailable", () => {
  renderStrip({ current: { kp: null, flux: null, predictedKp: [] } });
  expect(screen.queryAllByRole("img")).toHaveLength(0);
  expect(
    screen.getByText("The outlook is withheld while Kp and solar flux are not current."),
  ).toBeTruthy();
});

it("withholds the outlook and shows a non-current badge when solar flux is stale, even though Kp is fresh", () => {
  renderStrip({ resources: { flux: { state: "stale" } } });
  expect(screen.queryAllByRole("img")).toHaveLength(0);
  expect(
    screen.getByText("The outlook is withheld while Kp and solar flux are not current."),
  ).toBeTruthy();
  expect(screen.getByRole("status").textContent).not.toMatch(/Current/);
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(1);
  expect(links[0].getAttribute("href")).toBe("/map");
});

it("renders 24 cells behind exactly one link to /map when Kp and flux are both current", () => {
  renderStrip();
  expect(screen.getAllByRole("img")).toHaveLength(24);
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(1);
  expect(links[0].getAttribute("href")).toBe("/map");
  expect(links[0].textContent).toContain(
    "Full 24h grid, path analysis and NowCast in PropSphere →",
  );
});

it("names the four levels in words under the strip", () => {
  renderStrip();
  const legend = document.querySelector(".home-forecast-strip-legend");
  expect(legend?.textContent).toBe("StrongerMixedLimitedUnknown");
});
