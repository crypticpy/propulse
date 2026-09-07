import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { HomeDaylight } from "./HomeDaylight";

const state = vi.hoisted(() => ({
  location: { id: "home", name: "Home", grid: "DM79", lat: 39.5, lon: -105 } as
    | { id: string; name: string; grid: string; lat: number; lon: number }
    | null,
}));
vi.mock("@/hooks/useHomeLocation", () => ({ useHomeLocation: () => ({ location: state.location }) }));

// 2026-09-07T05:00:00Z at 39.5N/105W is well after that UTC day's sunset (01:25 UTC) and before
// the next sunrise (12:35 UTC the same UTC day) — verified against suncalc directly.
const NOW = Date.parse("2026-09-07T05:00:00Z");

function renderCard() {
  return render(
    <MemoryRouter>
      <HomeDaylight now={NOW} />
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

it("renders the SVG hero, one sub line naming the phase and next event, and exactly one Details button", () => {
  renderCard();
  expect(screen.getByRole("img", { name: "Solar altitude through the UTC day" })).toBeTruthy();
  expect(document.querySelectorAll(".home-card-sub")).toHaveLength(1);
  expect(screen.getByText("After sunset · sunrise 12:35 UTC")).toBeTruthy();
  const buttons = screen.getAllByRole("button", { name: "Details" });
  expect(buttons).toHaveLength(1);
  expect(buttons[0].getAttribute("aria-haspopup")).toBe("dialog");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("opens a dialog with today's crossings, the explanatory sentence, and the map link", () => {
  renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Details" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Sunset 01:25 UTC · Sunrise 12:35 UTC")).toBeTruthy();
  expect(within(dialog).getByText(/The marker is now/)).toBeTruthy();
  expect(within(dialog).getByRole("link", { name: /View daylight map/ })).toBeTruthy();
});

it("shows no Details button and no dialog when the location is unset", () => {
  state.location = null;
  renderCard();
  expect(screen.queryByRole("button", { name: "Details" })).toBeNull();
  expect(
    screen.getByText("Set your location to see sunrise, sunset, and daylight. No sign-in needed."),
  ).toBeTruthy();
  state.location = { id: "home", name: "Home", grid: "DM79", lat: 39.5, lon: -105 };
});
