import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { LogEntry } from "@/lib/db/types";
import { useMapStore } from "@/stores/mapStore";
import { RecentContactsReport } from "./RecentContactsReport";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  listener: null as (() => void) | null,
}));
vi.mock("@/lib/hamclock/recentContacts", async (original) => ({
  ...(await original<typeof import("@/lib/hamclock/recentContacts")>()),
  readHamClockContactHistory: mocks.read,
}));
vi.mock("@/lib/db/logStore", () => ({
  subscribeLogEntries: (fn: () => void) => {
    mocks.listener = fn;
    return () => {
      mocks.listener = null;
    };
  },
}));
vi.mock("@/hooks/useUTCClock", () => ({
  useUTCClock: () => new Date("2026-09-06T12:00:00Z"),
}));
vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: () => ({ grid: "EM38", lat: 38.5, lon: -93 }),
}));
const contact: LogEntry = {
  id: "a",
  callsign: "JA1ABC",
  band: "20m",
  mode: "FT8",
  frequency: 14074,
  date: "2026-09-06",
  timeOn: "10:00",
  myGrid: "EM38",
  grid: "PM95",
  createdAt: "2026-09-06T10:00:00Z",
  updatedAt: "2026-09-06T10:00:00Z",
};
function draw() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RecentContactsReport open onClose={() => {}} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  mocks.read
    .mockReset()
    .mockResolvedValue({
      entries: [contact],
      totalCount: 1,
      readAt: Date.parse("2026-09-06T12:00:00Z"),
    });
});
it("shows a table twin, selects a day and targets only a valid logged location", async () => {
  draw();
  const button = await screen.findByRole("button", { name: /JA1ABC · 20m/ });
  fireEvent.click(button);
  expect(useMapStore.getState().target?.grid).toBe("PM95");
  expect(screen.getByRole("table")).toBeTruthy();
  fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
  expect(
    screen.getByRole("button", { name: "NO CONTACTS ON DAY" }),
  ).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByRole("button", { name: "MONTH SUMMARY" }));
  expect(screen.getByRole("button", { name: /JA1ABC · 20m/ })).toBeTruthy();
});
it("reacts to log deletion and does not draw a fabricated empty chart", async () => {
  draw();
  await screen.findByRole("table");
  mocks.read.mockResolvedValue({
    entries: [],
    totalCount: 0,
    readAt: Date.now(),
  });
  mocks.listener?.();
  await screen.findByText("NO CONTACTS LOGGED");
  expect(screen.queryByRole("table")).toBeNull();
});
it("distinguishes failed log access from an empty log", async () => {
  mocks.read.mockRejectedValue(new Error("unavailable"));
  draw();
  await screen.findByText("NO LOGBOOK AVAILABLE");
  expect(screen.queryByText("NO CONTACTS LOGGED")).toBeNull();
  mocks.read.mockResolvedValue({
    entries: [],
    totalCount: 12,
    readAt: Date.now(),
  });
  fireEvent.click(screen.getByRole("button", { name: "RETRY LOG READ" }));
  await waitFor(() =>
    expect(screen.getByText("NO CONTACTS IN THIS PERIOD")).toBeTruthy(),
  );
});
