import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LaunchRecord } from "@/hooks/useLaunches";
import { LaunchesTile } from "./LaunchesTile";

const mocks = vi.hoisted(() => ({ launches: vi.fn() }));

vi.mock("@/hooks/useLaunches", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useLaunches")>();
  return {
    ...actual,
    useLaunches: mocks.launches,
  };
});

function launch(overrides: Partial<LaunchRecord> = {}): LaunchRecord {
  return {
    id: "1",
    name: "Falcon 9 | Starlink",
    provider: "SpaceX",
    providerAbbrev: "SpX",
    pad: "SLC-40",
    location: "Cape Canaveral, FL, USA",
    net: "2026-09-08T16:00:00.000Z",
    windowStart: null,
    windowEnd: null,
    status: "Go",
    statusName: "Go for Launch",
    precision: "minute",
    webcastLive: false,
    sourceUpdatedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.setSystemTime(new Date("2026-09-08T13:00:00Z"));
  mocks.launches.mockReturnValue({
    launches: [],
    next: null,
    status: "ok",
    stale: false,
    retrievedAt: "2026-09-08T12:50:00.000Z",
    isLoading: false,
    error: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

it("renders the empty state when the feed has no upcoming launches", () => {
  render(<LaunchesTile />);
  expect(screen.getByText("NONE")).toBeTruthy();
  expect(screen.getByText("NO UPCOMING LAUNCHES")).toBeTruthy();
});

it("shows T-minus for a Go launch with minute precision", () => {
  const next = launch();
  mocks.launches.mockReturnValue({
    launches: [next],
    next,
    status: "ok",
    stale: false,
    retrievedAt: "2026-09-08T12:50:00.000Z",
    isLoading: false,
    error: null,
  });
  render(<LaunchesTile />);
  expect(screen.getByText("3h 0m")).toBeTruthy();
  expect(screen.getByText("SpX")).toBeTruthy();
  expect(screen.getByText("SLC-40")).toBeTruthy();
});

it("opens the centred report from the tile, not a flyout", async () => {
  const next = launch();
  mocks.launches.mockReturnValue({
    launches: [next],
    next,
    status: "ok",
    stale: false,
    retrievedAt: "2026-09-08T12:50:00.000Z",
    isLoading: false,
    error: null,
  });
  render(<LaunchesTile />);
  fireEvent.click(
    screen.getByRole("button", { name: /Open the launches report/ }),
  );
  expect(
    await screen.findByRole("dialog", { name: "Launch report" }),
  ).toBeTruthy();
  expect(screen.getAllByText("Falcon 9 | Starlink").length).toBeGreaterThan(0);
});

it("does not invent a countdown for a TBD NET", () => {
  const next = launch({
    status: "TBD",
    precision: "second",
    net: "2026-09-08T16:00:00.000Z",
  });
  mocks.launches.mockReturnValue({
    launches: [next],
    next,
    status: "ok",
    stale: false,
    retrievedAt: "2026-09-08T12:50:00.000Z",
    isLoading: false,
    error: null,
  });
  render(<LaunchesTile />);
  expect(screen.getByText("8 SEP")).toBeTruthy();
  expect(screen.queryByText("3h 0m")).toBeNull();
});
