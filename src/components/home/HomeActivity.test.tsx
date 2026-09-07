import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HomeActivity } from "./HomeActivity";
import type { useHomeBandActivity } from "@/hooks/useHomeBandActivity";
import type { BandActivityStatus } from "@/hooks/useBandActivity";

type Query = ReturnType<typeof useHomeBandActivity>["query"];

const state = vi.hoisted(() => ({
  activity: {} as ReturnType<typeof useHomeBandActivity>,
}));
vi.mock("@/hooks/useHomeBandActivity", () => ({ useHomeBandActivity: () => state.activity }));
vi.mock("@/hooks/useHomeLocation", () => ({ useHomeLocation: () => ({ location: null, guest: true }) }));

// Desktop width: the ladder keeps its trend column above 1440 px.
beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1920 });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((media: string) => ({ matches: false, media, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
});

afterEach(() => { cleanup(); });

const ROW = { band: "20m", count60m: 300, obs20m: 42, reporters20m: 6, median60m: 200, sampleCount: 88, trend: "rising", modeObs20m: { phone: 20, digital: 15, cw: 7, unknown: 0 } } as unknown as BandActivityStatus;

function setActivity(overrides: Partial<ReturnType<typeof useHomeBandActivity>>) {
  state.activity = {
    query: { isPending: false, isError: false, data: undefined } as unknown as Query,
    current: false,
    hasData: false,
    fetchedAt: null,
    rows: [],
    verdictByBand: new Map(),
    scopeLabel: "Global",
    ...overrides,
  } as ReturnType<typeof useHomeBandActivity>;
}

it("keeps the last-good ladder on screen, dimmed, with a Stale chip and footnote when the snapshot has gone stale", () => {
  const now = Date.parse("2026-09-05T04:55:00Z");
  const fetchedAt = now - 5 * 60_000;
  setActivity({ current: false, hasData: true, fetchedAt, rows: [ROW], query: { isPending: false, isError: false, data: { fetchedAt } } as unknown as Query });
  render(<MemoryRouter><HomeActivity now={now} isMobile={false} /></MemoryRouter>);
  expect(screen.getByText("20m")).toBeTruthy();
  const status = screen.getByRole("status");
  expect(status.textContent).toContain("Stale");
  expect(status.textContent).toContain("min old");
  expect(screen.getByText("Showing the last snapshot; updates retry automatically.")).toBeTruthy();
  const ladder = document.querySelector(".home-ladder");
  expect(ladder?.getAttribute("data-stale")).toBe("true");
});

it("keeps the last-good ladder on screen with an Error chip when a poll fails but cached data remains", () => {
  const now = Date.parse("2026-09-05T04:55:00Z");
  const fetchedAt = now - 5 * 60_000;
  setActivity({ current: false, hasData: true, fetchedAt, rows: [ROW], query: { isPending: false, isError: true, data: { fetchedAt } } as unknown as Query });
  render(<MemoryRouter><HomeActivity now={now} isMobile={false} /></MemoryRouter>);
  expect(screen.getByText("20m")).toBeTruthy();
  expect(within(screen.getByRole("status")).getByText(/Error/)).toBeTruthy();
  expect(screen.getByText("Showing the last snapshot; updates retry automatically.")).toBeTruthy();
});

it("shows text only, no ladder, while the first fetch is pending", () => {
  const now = Date.parse("2026-09-05T04:55:00Z");
  setActivity({ query: { isPending: true, isError: false, data: undefined } as unknown as Query });
  render(<MemoryRouter><HomeActivity now={now} isMobile={false} /></MemoryRouter>);
  expect(screen.getByText("Checking reception reports…")).toBeTruthy();
  expect(document.querySelector(".home-ladder")).toBeNull();
});

it("renders the ladder with no stale footnote when the snapshot is fresh", () => {
  const now = Date.parse("2026-09-05T04:55:00Z");
  setActivity({ current: true, hasData: true, fetchedAt: now, rows: [ROW], query: { isPending: false, isError: false, data: { fetchedAt: now } } as unknown as Query });
  render(<MemoryRouter><HomeActivity now={now} isMobile={false} /></MemoryRouter>);
  expect(screen.getByText("20m")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Current");
  expect(screen.queryByText("Showing the last snapshot; updates retry automatically.")).toBeNull();
  const ladder = document.querySelector(".home-ladder");
  expect(ladder?.hasAttribute("data-stale")).toBe(false);
});

it("shows the scored verdict beside the band it belongs to, and No verdict for the rest", () => {
  const now = Date.parse("2026-09-05T04:55:00Z");
  setActivity({ current: true, hasData: true, fetchedAt: now, rows: [ROW], verdictByBand: new Map([["20m", "verified" as const]]), query: { isPending: false, isError: false, data: { fetchedAt: now } } as unknown as Query });
  render(<MemoryRouter><HomeActivity now={now} isMobile={false} /></MemoryRouter>);
  const row = screen.getByRole("row", { name: /^20m/ });
  expect(within(row).getByText("Verified Open")).toBeTruthy();
  expect(within(row).getByText("1.5× typical for this hour")).toBeTruthy();
  expect(screen.getAllByText("No verdict").length).toBe(9);
});
