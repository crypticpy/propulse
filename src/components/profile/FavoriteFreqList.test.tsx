import { afterEach, beforeEach, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FavoriteFreqList } from "./FavoriteFreqList";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";

const rig = useRigStore.getState();
const settings = useSettingsStore.getState();
beforeEach(() => {
  useSettingsStore.setState({ bridgeEnabled: true });
  useRigStore.setState({ catEnabled: true, connected: true, bridgeConnected: true, pendingFrequency: null, pendingMode: null });
});
afterEach(() => {
  useRigStore.setState(rig);
  useSettingsStore.setState(settings);
});
it("tunes a favourite only through its explicit action", () => {
  render(<FavoriteFreqList freqs={[{ id: "a", frequency: "7.074125", band: "40m", mode: "FT8" }]} />);
  fireEvent.click(screen.getByText("7.074125 MHz"));
  expect(useRigStore.getState().pendingFrequency).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tune 7.074125 MHz FT8" }));
  expect(useRigStore.getState().pendingFrequency).toBe(7074125);
  expect(useRigStore.getState().pendingMode).toBe("USB");
});
it("disables malformed favourites and preserves unknown modes", () => {
  render(<FavoriteFreqList freqs={[
    { id: "a", frequency: "7.074 or 14.074", band: "40m" },
    { id: "b", frequency: "14.074", band: "20m", mode: "Other" },
  ]} />);
  expect(screen.getByRole("button", { name: /INVALID FREQUENCY/ }).hasAttribute("disabled")).toBe(true);
  useRigStore.setState({ pendingMode: "FM" });
  fireEvent.click(screen.getByRole("button", { name: "Tune 14.074 MHz (mode unchanged)" }));
  expect(useRigStore.getState().pendingFrequency).toBe(14074000);
  expect(useRigStore.getState().pendingMode).toBeNull();
});
