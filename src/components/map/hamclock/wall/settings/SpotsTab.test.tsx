import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useMapStore } from "@/stores/mapStore";
import { SpotsTab } from "./SpotsTab";
const initial = useMapStore.getState();
afterEach(() => useMapStore.setState(initial));

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
