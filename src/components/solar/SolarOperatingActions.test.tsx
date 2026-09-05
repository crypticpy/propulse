import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SolarOperatingActions } from "./SolarOperatingActions";

const context = vi.hoisted(() => ({
  target: { lat: 35.68, lon: 139.76, grid: "PM95vq", name: "Tokyo" } as { lat: number; lon: number; grid: string; name: string } | null,
  station: { location: { name: "Field site", grid: "EM10" }, chain: { name: "Portable kit" } } as { location: { name: string; grid: string } | null; chain: { name: string } | null },
}));
vi.mock("@/hooks/useActiveBandMode", () => ({ useActiveMode: () => "CW" }));
vi.mock("@/hooks/useStationCastContext", () => ({ useStationCastContext: () => context.station }));
vi.mock("@/stores/mapStore", () => ({ useMapStore: (selector: (state: typeof context) => unknown) => selector(context) }));
function Destination() {
  const location = useLocation();
  return <output data-testid="destination">{JSON.stringify({ path: location.pathname, ...location.state })}</output>;
}
function setup(at?: string) {
  render(<MemoryRouter initialEntries={["/solar"]}><Routes>
    <Route path="/solar" element={<SolarOperatingActions at={at} compact={!!at} />} />
    <Route path="*" element={<Destination />} />
  </Routes></MemoryRouter>);
}
describe("Solar operating actions", () => {
  it.each([["Inspect a path", "/map"], ["Find a band for a target", "/dx"], ["Plan a session", "/planner"]])("%s passes the selected target and active mode", (name, path) => {
    setup();
    expect(screen.getByText(/Portable kit/).textContent).toContain("EM10");
    fireEvent.click(screen.getByRole("link", { name }));
    expect(JSON.parse(screen.getByTestId("destination").textContent!)).toMatchObject({ path, solarHandoff: { version: 1, target: context.target, mode: "CW" } });
  });
  it("passes the selected forecast instant", () => {
    setup("2026-09-05T12:00:00Z");
    fireEvent.click(screen.getByRole("link", { name: "Plan this day" }));
    expect(JSON.parse(screen.getByTestId("destination").textContent!).solarHandoff.at).toBe("2026-09-05T12:00:00.000Z");
  });
  it("works without a configured station or target", () => {
    context.target = null;
    context.station = { location: null, chain: null };
    setup();
    expect(screen.getByText(/Station not configured/)).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Find a band for a target" }));
    expect(JSON.parse(screen.getByTestId("destination").textContent!).solarHandoff).toEqual({ version: 1, mode: "CW" });
  });
});
