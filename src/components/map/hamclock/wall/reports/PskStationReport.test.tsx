import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useProfileStore } from "@/stores/profileStore";
import { usePskStationView } from "@/hooks/usePskStation";
import { useSettingsStore } from "@/stores/settingsStore";
import { useRigStore } from "@/stores/rigStore";
import { PskStationReport } from "./PskStationReport";
import type { PskStationSnapshot } from "@/lib/hamclock/pskStation";
const original = { profile: useProfileStore.getState(), rig: useRigStore.getState(), settings: useSettingsStore.getState() };
afterEach(() => { useProfileStore.setState(original.profile); useRigStore.setState(original.rig); useSettingsStore.setState(original.settings); usePskStationView.setState({ direction: "of", minutes: 15, band: "all" }); vi.unstubAllGlobals(); });

it("switches direction, age and band locally and tunes only through the explicit action", () => {
  const now = Date.now();
  const data: PskStationSnapshot = { callsign: "N0TEST", status: "ok", fetchedAt: now, checkedAt: now, retryAt: now + 300_000, windowMinutes: 1440, limit: 1000, limited: true, discarded: 0,
    reports: [
      { senderCallsign: "N0TEST", receiverCallsign: "W1AW", frequencyHz: 14_074_125, mode: "FT8", snr: -10, observedAt: now - 60_000, senderLocator: "EM38", receiverLocator: "FN31" },
      { senderCallsign: "K2ABC", receiverCallsign: "N0TEST", frequencyHz: 7_074_125, mode: "FT8", snr: null, observedAt: now - 40 * 60_000, senderLocator: "FN30", receiverLocator: "EM38" },
    ] };
  useProfileStore.setState({ station: { ...original.profile.station, callsign: "N0TEST" } as NonNullable<typeof original.profile.station> });
  useSettingsStore.setState({ bridgeEnabled: true });
  useRigStore.setState({ catEnabled: true, bridgeConnected: true, connected: true, pendingFrequency: null, pendingMode: null });
  const client = new QueryClient(); client.setQueryData(["pskStation", "N0TEST"], data);
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const rendered = render(<QueryClientProvider client={client}><PskStationReport open onClose={() => {}} /></QueryClientProvider>);
  const table = () => screen.getByRole("table", { name: "All loaded PSK receptions" });
  expect(table().textContent).toContain("W1AW");
  expect(table().textContent).not.toContain("K2ABC");
  expect(screen.getByText(/ROW LIMIT REACHED/)).toBeTruthy();
  expect(useRigStore.getState().pendingFrequency).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: /BY MY CALL/ }));
  expect(table().textContent).not.toContain("K2ABC");
  fireEvent.click(screen.getByRole("radio", { name: "60 MIN" }));
  expect(table().textContent).toContain("K2ABC");
  fireEvent.click(screen.getByRole("button", { name: "Tune 7.074125 MHz FT8" }));
  expect(useRigStore.getState().pendingFrequency).toBe(7_074_125);
  expect(useRigStore.getState().pendingMode).toBe("USB");
  fireEvent.click(screen.getByRole("radio", { name: "20M" }));
  expect(table().textContent).not.toContain("K2ABC");
  expect(fetcher).not.toHaveBeenCalled();
  rendered.unmount(); client.clear();
});

it("requires a station call without displaying invented zero activity", () => {
  useProfileStore.setState({ station: null });
  const client = new QueryClient();
  const rendered = render(<QueryClientProvider client={client}><PskStationReport open onClose={() => {}} /></QueryClientProvider>);
  expect(document.querySelector(".hcr")?.textContent).toContain("SET STATION CALL");
  expect(document.querySelector(".hcr-hero")?.textContent).toBe("—");
  rendered.unmount(); client.clear();
});
