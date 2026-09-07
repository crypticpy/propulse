import { afterEach, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useWSJTXStore, type WSJTXDecode } from "@/stores/wsjtxStore";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { WsjtxReport } from "./WsjtxReport";
const initial = { wsjtx: useWSJTXStore.getState(), rig: useRigStore.getState(), settings: useSettingsStore.getState() };
afterEach(() => { useWSJTXStore.setState(initial.wsjtx); useRigStore.setState(initial.rig); useSettingsStore.setState(initial.settings); });
function seed() {
  const now = Date.now();
  const decode: WSJTXDecode = { instanceId: "A", isNew: true, time: (now - 15_000) % 86_400_000, snr: -10, deltaTime: 0.2, deltaFrequency: 1234, mode: "~", message: "CQ N0TEST EM38", lowConfidence: false, receivedAt: now, callsign: "N0TEST", grid: "EM38", dialFrequencyHz: 7_074_125, dialMode: "FT8" };
  useSettingsStore.setState({ bridgeEnabled: true });
  useRigStore.setState({ catEnabled: true, bridgeConnected: true, connected: true, pendingFrequency: null, pendingMode: null });
  useWSJTXStore.setState({ decodes: [decode, { ...decode, callsign: "N1TEST", message: "CQ N1TEST EM38", isNew: false }], connected: true });
}
it("shows current decodes with explicit dial tuning and retains replay rows only in the full list", () => {
  seed(); render(<WsjtxReport open onClose={() => {}} />);
  expect(screen.getByRole("table", { name: "All WSJT-X decodes" }).textContent).toContain("N0TEST");
  expect(screen.getByRole("table").textContent).not.toContain("N1TEST");
  expect(document.querySelector(".hcw-cq")).toBeTruthy();
  expect(useRigStore.getState().pendingFrequency).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tune 7.074125 MHz FT8" }));
  expect(useRigStore.getState().pendingFrequency).toBe(7_074_125);
  expect(useRigStore.getState().pendingMode).toBe("USB");
  fireEvent.click(screen.getByRole("tab", { name: "ALL RETAINED" }));
  expect(screen.getByRole("table").textContent).toContain("N1TEST");
  expect(screen.getByRole("button", { name: /REPLAY/ }).hasAttribute("disabled")).toBe(true);
});
it("shows unknown dial context without inferring a target from the current radio", () => {
  seed(); useWSJTXStore.setState({ decodes: [{ ...useWSJTXStore.getState().decodes[0], dialFrequencyHz: undefined }] });
  render(<WsjtxReport open onClose={() => {}} />);
  const tune = screen.getByRole("button", { name: /NO DIAL CONTEXT/ });
  expect(tune.hasAttribute("disabled")).toBe(true);
  fireEvent.click(tune); expect(useRigStore.getState().pendingFrequency).toBeNull();
});
it("distinguishes bridge off from a connected bridge with no decodes", () => {
  seed(); useWSJTXStore.setState({ decodes: [] }); useRigStore.setState({ bridgeConnected: false });
  const view = render(<WsjtxReport open onClose={() => {}} />);
  expect(document.querySelector(".hcr-verdict")?.textContent || document.querySelector(".hcr")?.textContent).toContain("BRIDGE OFF");
  useRigStore.setState({ bridgeConnected: true }); view.rerender(<WsjtxReport open onClose={() => {}} />);
  expect(document.querySelector(".hcr")?.textContent).toContain("NO DECODES YET");
});
