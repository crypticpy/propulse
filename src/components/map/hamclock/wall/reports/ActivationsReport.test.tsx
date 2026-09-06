import { useState } from "react";
import { HamClockPinnedReportHost } from "./WallReport";
import { afterEach, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActivationsReport } from "./ActivationsReport";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";

const rig = useRigStore.getState();
const settings = useSettingsStore.getState();
let client: QueryClient;
afterEach(() => {
  client?.clear();
  useRigStore.setState(rig);
  useSettingsStore.setState(settings);
});
it("keeps programme source status, accessible rows and explicit tuning distinct", () => {
  client = new QueryClient();
  const now = Date.now();
  client.setQueryData(["activationSpots"], {
    fetchedAt: new Date(now).toISOString(),
    spots: [{ id: "a", program: "POTA", callsign: "N0TEST", reference: "US-1", referenceName: "Test", frequencyKHz: 7074.125, mode: "FT8", comments: "", spotter: "W0TEST", spottedAt: new Date(now).toISOString() }],
    sources: [
      { program: "POTA", status: "ok", fetchedAt: "2020-01-01T12:00:00Z" },
      { program: "SOTA", status: "ok", fetchedAt: new Date(now).toISOString() },
      { program: "WWFF", status: "unavailable", fetchedAt: null },
    ],
  });
  useSettingsStore.setState({ bridgeEnabled: true });
  useRigStore.setState({ catEnabled: true, connected: true, bridgeConnected: true, pendingFrequency: null, pendingMode: null });
  render(<QueryClientProvider client={client}><ActivationsReport open onClose={() => {}} /></QueryClientProvider>);
  expect(screen.getByRole("table", { name: "All loaded activations" }).textContent).toContain("7074.125");
  expect(document.querySelector(".hcr-foot")?.textContent).toContain("UPDATED 12:00 UTC");
  expect(document.querySelector(".hcr-foot")?.textContent).toContain("STALE");
  expect(useRigStore.getState().pendingFrequency).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tune 7.074125 MHz FT8" }));
  expect(useRigStore.getState().pendingFrequency).toBe(7074125);
  expect(useRigStore.getState().pendingMode).toBe("USB");
  fireEvent.click(screen.getByRole("tab", { name: "SOTA" }));
  expect(screen.getByText("No activations reported in this window.")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "WWFF" }));
  expect(screen.getByText("No current reports available from this source.")).toBeTruthy();
  expect(document.querySelector(".hcr-foot")?.textContent).toContain("WAITING");
});


it("keeps the pinned report identity when its programme changes", () => {
  client = new QueryClient();
  client.setQueryData(["activationSpots"], { spots: [], sources: [], fetchedAt: new Date().toISOString() });
  function Harness() {
    const [open, setOpen] = useState(true);
    return <>{open && <ActivationsReport open onClose={() => setOpen(false)} />}<HamClockPinnedReportHost /></>;
  }
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("tab", { name: "SOTA" }));
  fireEvent.click(screen.getByRole("button", { name: "PIN", exact: true }));
  expect(screen.getByRole("tab", { name: "SOTA" }).getAttribute("aria-selected")).toBe("true");
  fireEvent.click(screen.getByRole("tab", { name: "WWFF" }));
  expect(screen.getByRole("button", { name: "UNPIN", exact: true }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "UNPIN", exact: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
