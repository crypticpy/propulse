import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMapStore } from "@/stores/mapStore";
import { usePskStationView } from "@/hooks/usePskStation";
import { SpotsTab } from "./SpotsTab";
vi.mock("@/hooks/useMapSpotFeed", () => ({
  useMapSpotFeed: () => ({ station: { view: usePskStationView(), feed: { callsign: "N0TEST" } }, sourceStates: { PSKReporter: "STALE", RBN: "UNAVAILABLE", "WSJT-X": "BRIDGE OFF" } }),
}));
const initial = useMapStore.getState();
afterEach(() => { useMapStore.setState(initial); localStorage.removeItem("propulse-spot-age-minutes"); });

it("changes the shared cap by keyboard while preserving source and band filters", () => {
  useMapStore.getState().setDisplayDensity(150);
  const filters = useMapStore.getState().spotFilters;
  render(<SpotsTab />);
  const selected = screen.getByRole("radio", { name: "150" });
  expect(selected.getAttribute("aria-checked")).toBe("true");
  fireEvent.keyDown(selected, { key: "End" });
  expect(useMapStore.getState().displayDensity).toBe(200);
  expect(useMapStore.getState().spotFilters).toBe(filters);
  expect(document.activeElement).toBe(screen.getByRole("radio", { name: "200" }));
});

it("represents an intermediate desktop value without silently changing it", () => {
  useMapStore.getState().setDisplayDensity(125);
  render(<SpotsTab />);
  expect(screen.getByRole("radio", { name: "125" }).getAttribute("aria-checked")).toBe("true");
  act(() => useMapStore.getState().setDisplayDensity(50));
  expect(screen.queryByRole("radio", { name: "125" })).toBeNull();
  expect(screen.getByRole("radio", { name: "50" }).getAttribute("aria-checked")).toBe("true");
});

it("normalizes integration values into a finite whole render cap", () => {
  for (const [input, expected] of [[NaN, 150], [Infinity, 150], [-1, 10], [999, 200], [125.9, 125]]) {
    useMapStore.getState().setDisplayDensity(input);
    expect(useMapStore.getState().displayDensity).toBe(expected);
  }
});


it("changes map age by keyboard, persists it, and exposes source state", () => {
  render(<SpotsTab />);
  const age = screen.getByRole("radio", { name: "30 MIN" });
  fireEvent.keyDown(age, { key: "End" });
  expect(useMapStore.getState().spotAgeMinutes).toBe(60);
  expect(localStorage.getItem("propulse-spot-age-minutes")).toBe("60");
  expect(document.activeElement).toBe(screen.getByRole("radio", { name: "60 MIN" }));
  expect(screen.getByLabelText("Map spot sources").textContent).toContain("PSK STALE · RBN UNAVAILABLE");
  act(() => useMapStore.getState().setSpotAgeMinutes(1440));
  expect(useMapStore.getState().spotAgeMinutes).toBe(30);
});


it("selects personal scope and shares its longer age without changing global age or filters", () => {
  usePskStationView.setState({ direction: "by", minutes: 15, band: "40m" });
  const filters = useMapStore.getState().spotFilters;
  render(<SpotsTab />);
  fireEvent.click(screen.getByRole("radio", { name: "MY PSK REPORTS" }));
  expect(useMapStore.getState().spotFeedScope).toBe("psk-station");
  fireEvent.click(screen.getByRole("radio", { name: "1440 MIN" }));
  expect(usePskStationView.getState().minutes).toBe(1440);
  expect(useMapStore.getState().spotAgeMinutes).toBe(30);
  expect(useMapStore.getState().spotFilters).toBe(filters);
  expect(screen.getByText(/BY N0TEST/).textContent).toContain("40M");
  fireEvent.click(screen.getByRole("radio", { name: "GLOBAL SAMPLE" }));
  expect(screen.queryByRole("radio", { name: "1440 MIN" })).toBeNull();
  usePskStationView.setState({ direction: "of", minutes: 15, band: "all" });
});
