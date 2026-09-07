import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { LogEntry } from "@/lib/db/types";
import { RecentContactsTile } from "./RecentContactsTile";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/hamclock/recentContacts", () => ({ readHamClockContacts: mocks.read }));
vi.mock("@/hooks/useActiveLocation", () => ({ useActiveLocation: () => ({ grid: "EM38" }) }));
const previousRig = useRigStore.getState();
const previousSettings = useSettingsStore.getState();
afterEach(() => {
  useRigStore.setState(previousRig);
  useSettingsStore.setState(previousSettings);
});

it("renders asynchronously loaded rows and tunes without opening the report", async () => {
  let finish!: (entries: LogEntry[]) => void;
  mocks.read.mockReturnValue(new Promise<LogEntry[]>(resolve => { finish = resolve; }));
  useSettingsStore.setState({ bridgeEnabled: true });
  useRigStore.setState({ catEnabled: true, bridgeConnected: true, connected: true, pendingFrequency: null, pendingMode: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RecentContactsTile /></QueryClientProvider>);
  expect(screen.getByText("Reading the logbook…")).toBeTruthy();
  await act(async () => finish([{
    id: "fixture", callsign: "N0TEST", frequency: 7074.125, band: "40m", mode: "LSB",
    date: new Date().toISOString().slice(0, 10), timeOn: "00:00", grid: "EM38",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }]));
  const tune = await screen.findByRole("button", { name: "Tune 7.074125 MHz LSB" });
  expect(tune.parentElement?.closest("button")).toBeNull();
  fireEvent.click(tune);
  expect(useRigStore.getState().pendingFrequency).toBe(7_074_125);
  expect(useRigStore.getState().pendingMode).toBe("LSB");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("TOP 1 OF 1 · TODAY")).toBeTruthy();
});
