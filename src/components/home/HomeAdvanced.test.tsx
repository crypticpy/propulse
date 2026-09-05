import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { HomeAdvanced } from "./HomeAdvanced";
import { buildHomeForecast } from "@/lib/home/forecast";
import type { useSolarModel } from "@/hooks/useSolarModel";

vi.mock("@/hooks/useHomeLocation", () => ({ useHomeLocation: () => ({ location: { grid: "EM38", lat: 38.5, lon: -92.5 }, station: {}, guest: false }) }));
vi.mock("@/hooks/useHomeBandActivity", () => ({ useHomeBandActivity: () => ({ current: false, rows: [] }) }));
vi.mock("@/hooks/useActiveStationGain", () => ({ useActiveStationGain: () => ({ antennaType: "dipole" }) }));
vi.mock("@/hooks/useActiveBandMode", () => ({ useActiveMode: () => "CW" }));
vi.mock("@/stores/settingsStore", () => ({ useSettingsStore: () => "residential" }));
vi.mock("@/stores/mapStore", () => ({ useMapStore: () => ({ grid: "IO91wm12" }) }));
vi.mock("@/lib/home/forecast", () => ({ buildHomeForecast: vi.fn(() => []) }));
vi.mock("./HomeWeather", () => ({ HomeWeather: () => null }));

it("uses the six-character parent of an inherited extended target with current solar inputs", () => {
  const model = {
    resources: { kp: { state: "fresh" }, flux: { state: "fresh" }, forecast: { state: "missing" } },
    current: { kp: { kp: 2 }, flux: { flux: 120 }, predictedKp: [] },
  } as unknown as ReturnType<typeof useSolarModel>;
  render(<MemoryRouter><HomeAdvanced model={model} now={Date.now()} publicActivity /></MemoryRouter>);
  expect((screen.getByLabelText("Target grid") as HTMLInputElement).value).toBe("IO91wm");
  expect(buildHomeForecast).toHaveBeenCalledWith(expect.objectContaining({ target: { lat: expect.any(Number), lon: expect.any(Number) } }));
  fireEvent.change(screen.getByLabelText("Target grid"), { target: { value: "IO91wm12" } });
  expect(screen.getByText("Enter a valid 4- or 6-character target grid to view the forecast.")).toBeTruthy();
});
