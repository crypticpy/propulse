import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useProfileStore } from "@/stores/profileStore";
import { usePskStationView } from "@/hooks/usePskStation";
import { useRigStore } from "@/stores/rigStore";
import type { PskStationSnapshot } from "@/lib/hamclock/pskStation";
import { WsjtxReport } from "./WsjtxReport";
const original = { profile: useProfileStore.getState(), rig: useRigStore.getState() };
afterEach(() => { useProfileStore.setState(original.profile); useRigStore.setState(original.rig); usePskStationView.setState({ direction: "of", minutes: 15, band: "all" }); vi.unstubAllGlobals(); });

function mount(status: PskStationSnapshot["status"] = "ok") {
  const now = Date.now();
  useProfileStore.setState({ station: { ...original.profile.station, callsign: "N0TEST" } as NonNullable<typeof original.profile.station> });
  useRigStore.setState({ bridgeConnected: false });
  const snapshot: PskStationSnapshot = { callsign: "N0TEST", status, fetchedAt: status === "unavailable" ? null : now,
    checkedAt: now, retryAt: now + 300_000, windowMinutes: 1440, limit: 1000, limited: false, discarded: 0,
    reports: status === "unavailable" ? [] : [
      { senderCallsign: "N0TEST", receiverCallsign: "W1AW", frequencyHz: 14_074_125, mode: "FT8", snr: -10, observedAt: now - 60_000, senderLocator: "EM38", receiverLocator: "FN31" },
      { senderCallsign: "K2ABC", receiverCallsign: "N0TEST", frequencyHz: 7_074_125, mode: "FT8", snr: -15, observedAt: now - 60_000, senderLocator: "FN30", receiverLocator: "EM38" },
      { senderCallsign: "N0TEST", receiverCallsign: "K3ABC", frequencyHz: 7_074_125, mode: "FT4", snr: -2, observedAt: now - 40 * 60_000, senderLocator: "EM38", receiverLocator: "FN30" },
    ] };
  const client = new QueryClient(); client.setQueryData(["pskStation", "N0TEST"], snapshot);
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const view = render(<QueryClientProvider client={client}><WsjtxReport open onClose={() => {}} /></QueryClientProvider>);
  return { fetcher, dispose: () => { view.unmount(); client.clear(); } };
}

it("shows receivers of my call even when the shared PSK direction is BY, without changing that selection", () => {
  usePskStationView.setState({ direction: "by" });
  const fixture = mount();
  fireEvent.click(screen.getByRole("tab", { name: "HEARING ME" }));
  const table = () => screen.getByRole("table", { name: "All loaded PSK receptions" });
  expect(table().textContent).toContain("W1AW");
  expect(table().textContent).not.toContain("K2ABC");
  expect(table().textContent).not.toContain("K3ABC");
  expect(document.querySelector(".hcr-foot")?.textContent).toContain("PSK REPORTER · UPDATED");
  expect(usePskStationView.getState().direction).toBe("by");
  fireEvent.click(screen.getByRole("radio", { name: "60 MIN" }));
  expect(table().textContent).toContain("K3ABC");
  fireEvent.click(screen.getByRole("radio", { name: "40M" }));
  expect(table().textContent).not.toContain("W1AW");
  expect(table().textContent).toContain("K3ABC");
  expect(fixture.fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("tab", { name: "NEW · 15 MIN" }));
  expect(document.querySelector(".hcr-foot")?.textContent).toContain("WSJT-X BRIDGE");
  fixture.dispose();
});

it.each(["stale", "unavailable"] as const)("keeps PSK %s separate from bridge status", status => {
  const fixture = mount(status);
  fireEvent.click(screen.getByRole("tab", { name: "HEARING ME" }));
  expect(document.querySelector(".hcr-foot")?.textContent).toContain(status.toUpperCase());
  expect(document.querySelector(".hcr-hero")?.textContent).toBe(status === "unavailable" ? "—" : "1");
  fixture.dispose();
});
