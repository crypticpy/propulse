import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { HomeActivity } from "./HomeActivity";
import type { useHomeBandActivity } from "@/hooks/useHomeBandActivity";
import type { BandActivityStatus } from "@/hooks/useBandActivity";

type Query = ReturnType<typeof useHomeBandActivity>["query"];

const state = vi.hoisted(() => ({
  activity: {} as ReturnType<typeof useHomeBandActivity>,
}));
vi.mock("@/hooks/useHomeBandActivity", () => ({ useHomeBandActivity: () => state.activity }));
vi.mock("@/hooks/useHomeLocation", () => ({ useHomeLocation: () => ({ location: null, guest: true }) }));

afterEach(() => { cleanup(); });

const ROW = { band: "20m", obs20m: 42, reporters20m: 6, modeObs20m: { phone: 20, digital: 15, cw: 7, unknown: 0 } } as unknown as BandActivityStatus;

function setActivity(overrides: Partial<ReturnType<typeof useHomeBandActivity>>) {
  state.activity = {
    query: { isPending: false, isError: false, data: undefined } as unknown as Query,
    current: false,
    hasData: false,
    fetchedAt: null,
    rows: [],
    scopeLabel: "Global",
    ...overrides,
  } as ReturnType<typeof useHomeBandActivity>;
}

it("keeps the last-good grid on screen, dimmed, with a Stale chip and footnote when the snapshot has gone stale", () => {
  const now = Date.parse("2026-09-05T04:55:00Z");
  const fetchedAt = now - 5 * 60_000;
  setActivity({ current: false, hasData: true, fetchedAt, rows: [ROW], query: { isPending: false, isError: false, data: { fetchedAt } } as unknown as Query });
  render(<MemoryRouter><HomeActivity now={now} isMobile={false} /></MemoryRouter>);
  expect(screen.getByText("20m")).toBeTruthy();
  const status = screen.getByRole("status");
  expect(status.textContent).toContain("Stale");
  expect(status.textContent).toContain("min old");
  expect(screen.getByText("Showing the last snapshot; updates retry automatically.")).toBeTruthy();
  const grid = document.querySelector(".home-band-grid");
  expect(grid?.getAttribute("data-stale")).toBe("true");
});

it("keeps the last-good grid on screen with an Error chip when a poll fails but cached data remains", () => {
  const now = Date.parse("2026-09-05T04:55:00Z");
  const fetchedAt = now - 5 * 60_000;
  setActivity({ current: false, hasData: true, fetchedAt, rows: [ROW], query: { isPending: false, isError: true, data: { fetchedAt } } as unknown as Query });
  render(<MemoryRouter><HomeActivity now={now} isMobile={false} /></MemoryRouter>);
  expect(screen.getByText("20m")).toBeTruthy();
  expect(within(screen.getByRole("status")).getByText(/Error/)).toBeTruthy();
  expect(screen.getByText("Showing the last snapshot; updates retry automatically.")).toBeTruthy();
});

it("shows text only, no grid, while the first fetch is pending", () => {
  const now = Date.parse("2026-09-05T04:55:00Z");
  setActivity({ query: { isPending: true, isError: false, data: undefined } as unknown as Query });
  render(<MemoryRouter><HomeActivity now={now} isMobile={false} /></MemoryRouter>);
  expect(screen.getByText("Checking reception reports…")).toBeTruthy();
  expect(document.querySelector(".home-band-grid")).toBeNull();
});

it("renders the grid with no stale footnote when the snapshot is fresh", () => {
  const now = Date.parse("2026-09-05T04:55:00Z");
  setActivity({ current: true, hasData: true, fetchedAt: now, rows: [ROW], query: { isPending: false, isError: false, data: { fetchedAt: now } } as unknown as Query });
  render(<MemoryRouter><HomeActivity now={now} isMobile={false} /></MemoryRouter>);
  expect(screen.getByText("20m")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Current");
  expect(screen.queryByText("Showing the last snapshot; updates retry automatically.")).toBeNull();
  const grid = document.querySelector(".home-band-grid");
  expect(grid?.hasAttribute("data-stale")).toBe(false);
});
