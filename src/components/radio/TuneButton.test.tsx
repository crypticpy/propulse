import { afterEach, beforeEach, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useKioskStore } from "@/stores/kioskStore";
import { TuneButton } from "./TuneButton";
import { SpotAlertToastContainer } from "@/components/alerts/SpotAlertToast";
import { SatelliteTuneButton } from "./SatelliteTuneButton";
import { queueTune } from "@/lib/radio/tune";

const previous = { rig: useRigStore.getState(), settings: useSettingsStore.getState(), kiosk: useKioskStore.getState() };
beforeEach(() => {
  useSettingsStore.setState({ bridgeEnabled: true });
  useKioskStore.setState({ active: false });
  useRigStore.setState({ catEnabled: true, bridgeConnected: true, connected: true, pendingFrequency: null, pendingMode: null });
});
afterEach(() => {
  useRigStore.setState(previous.rig);
  useSettingsStore.setState(previous.settings);
  useKioskStore.setState(previous.kiosk);
});
it("hides the affordance with CAT disabled", () => {
  useRigStore.setState({ catEnabled: false });
  render(<TuneButton frequencyKHz={14074} mode="FT8" />);
  expect(screen.queryByRole("button")).toBeNull();
});
it.each([
  [{ bridgeConnected: false }, "BRIDGE SEEKING"],
  [{ connected: false }, "RIG WAITING"],
] as const)("shows a visible disabled connection reason", (state, reason) => {
  useRigStore.setState(state);
  render(<TuneButton frequencyKHz={14074} mode="FT8" />);
  const button = screen.getByRole("button");
  expect(button.hasAttribute("disabled")).toBe(true);
  expect(button.textContent).toContain(reason);
  fireEvent.click(button);
  expect(useRigStore.getState().pendingFrequency).toBeNull();
});
it("stages both commands in one update and leaves observed status unchanged", () => {
  const observed = useRigStore.getState();
  const updates: unknown[] = [];
  const unsubscribe = useRigStore.subscribe((state) => updates.push([state.pendingFrequency, state.pendingMode]));
  try {
    render(<TuneButton frequencyKHz={7074} mode="LSB" />);
    fireEvent.click(screen.getByRole("button", { name: /Tune 7.074 MHz LSB/ }));
    expect(updates).toEqual([[7_074_000, "LSB"]]);
    expect(useRigStore.getState().frequency).toBe(observed.frequency);
    expect(useRigStore.getState().mode).toBe(observed.mode);
  } finally { unsubscribe(); }
});
it("rechecks readiness and rejects invalid frequencies or display-only mode", () => {
  useRigStore.setState({ bridgeConnected: false });
  expect(queueTune(14074, "FT8")).toBe(false);
  useRigStore.setState({ bridgeConnected: true });
  for (const frequency of [NaN, Infinity, -1, 0, Number.MAX_VALUE]) expect(queueTune(frequency, "CW")).toBe(false);
  useKioskStore.setState({ active: true });
  expect(queueTune(14074, "FT8")).toBe(false);
  expect(useRigStore.getState().pendingFrequency).toBeNull();
});

it("requires the explicit alert button and preserves the full target precision", () => {
  render(<SpotAlertToastContainer onDismiss={() => {}} alerts={[{
    rule: { id: "fixture", name: "Fixture", enabled: true, conditions: {}, notification: { sound: false, browser: false, highlight: false }, createdAt: "2026-09-06T00:00:00Z" },
    spot: { callsign: "N0TEST", frequency: 7074.125, mode: "CW", band: "40m", source: "fixture" },
    matchedAt: "2026-09-06T00:00:00Z", matchedFields: ["bands"],
  }]} />);
  fireEvent.click(screen.getByRole("alert"));
  expect(useRigStore.getState().pendingFrequency).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tune 7.074125 MHz CW" }));
  expect(useRigStore.getState().pendingFrequency).toBe(7_074_125);
  expect(useRigStore.getState().pendingMode).toBe("CW");
});

it.each(["linear", "digital", "mixed", undefined] as const)("preserves the receive mode for a %s transponder", (mode) => {
  useRigStore.setState({ mode: "CWR", pendingMode: "USB" });
  render(<SatelliteTuneButton downlinkHz={435_123_456.4} mode={mode} />);
  fireEvent.click(screen.getByRole("button", { name: /Tune 435.123456 MHz \(mode unchanged\)/ }));
  expect(useRigStore.getState().pendingFrequency).toBe(435_123_456);
  expect(useRigStore.getState().pendingMode).toBeNull();
  expect(useRigStore.getState().mode).toBe("CWR");
});
it("stages an explicit FM satellite receive mode", () => {
  render(<SatelliteTuneButton downlinkHz={437_801_234} mode="FM" />);
  fireEvent.click(screen.getByRole("button", { name: "Tune 437.801234 MHz FM" }));
  expect(useRigStore.getState().pendingFrequency).toBe(437_801_234);
  expect(useRigStore.getState().pendingMode).toBe("FM");
});
