import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { HomeSolar } from "./HomeSolar";
import type { useSolarModel } from "@/hooks/useSolarModel";

type Model = ReturnType<typeof useSolarModel>;

vi.mock("@/hooks/useHomeLocation", () => ({
  useHomeLocation: () => ({
    location: { id: "home", name: "Home", grid: "DM79", lat: 39.5, lon: -105 },
    guest: false,
  }),
}));
vi.mock("@/hooks/useActiveBandMode", () => ({ useActiveMode: () => "SSB" }));
vi.mock("@/stores/mapStore", () => ({ useMapStore: () => undefined }));

const NOW = Date.parse("2026-09-07T00:30:00Z");

function model(overrides: {
  current?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  briefing?: Record<string, unknown>;
} = {}): Model {
  return {
    current: {
      kp: { kp: 2, kind: "estimated" },
      flux: { flux: 120 },
      xray: { flux: 1e-6 },
      xrayClass: "A1.0",
      predictedKp: [],
      ...overrides.current,
    },
    resources: {
      kp: { state: "fresh" },
      flux: { state: "fresh" },
      xray: { state: "fresh" },
      forecast: {
        state: "fresh",
        data: {
          issued_at: "2026-09-06T22:00:00.000Z",
          forecast: [
            { date: "2026-09-07T00:00:00.000Z", predicted_flux: 108, predicted_planetary_a: 4 },
          ],
        },
      },
      ...overrides.resources,
    },
    briefing: {
      state: "fresh",
      title: "Check the latest NOAA outlook",
      missing: [],
      delayed: [],
      evidence: [],
      ...overrides.briefing,
    },
  } as unknown as Model;
}

function renderCard(overrides?: Parameters<typeof model>[0]) {
  return render(
    <MemoryRouter>
      <HomeSolar model={model(overrides)} now={NOW} />
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

it("renders the instrument hero, one sub line, and exactly one Details button", () => {
  renderCard();
  expect(screen.getByText("2.0")).toBeTruthy();
  expect(screen.getByText("120")).toBeTruthy();
  expect(document.querySelectorAll(".home-card-sub")).toHaveLength(1);
  expect(screen.getByText("Check the latest NOAA outlook")).toBeTruthy();
  const buttons = screen.getAllByRole("button", { name: "Solar outlook details" });
  expect(buttons).toHaveLength(1);
  expect(buttons[0].textContent).toBe("Details");
  expect(buttons[0].getAttribute("aria-haspopup")).toBe("dialog");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("opens a dialog with the moved forecast, notes, sources, and links", () => {
  renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Solar outlook details" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/Next 24h/)).toBeTruthy();
  expect(within(dialog).getByText(/Global conditions/)).toBeTruthy();
  expect(within(dialog).getByRole("link", { name: /Full Solar Pulse briefing/ })).toBeTruthy();
  expect(within(dialog).getByRole("link", { name: /Check a path/ })).toBeTruthy();
  expect(within(dialog).getByRole("link", { name: /Plan a session/ })).toBeTruthy();
});

it("renders the official flux forecast date as a short UTC date, not an ISO timestamp (#531)", () => {
  renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Solar outlook details" }));
  const dialog = screen.getByRole("dialog");
  // formatForecastDate now passes `undefined` as the locale (matching sibling
  // components), so this is no longer pinned to "en-US" by the source; assert
  // with a regex instead of an exact string match, plus a general guard
  // against any raw ISO timestamp leaking through.
  expect(within(dialog).getByText(/108 sfu · 7 Sep/)).toBeTruthy();
  expect(within(dialog).queryByText(/2026-09-07T00:00:00/)).toBeNull();
  expect(within(dialog).queryByText(/T00:00:00\.000Z/)).toBeNull();
  expect(within(dialog).queryByText(/T\d\d:\d\d/)).toBeNull();
});
