import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { HomeStation } from "./HomeStation";
vi.mock("@/hooks/useStationCastContext", () => ({ useStationCastContext: () => ({ chain: {id:"preset:legacy",name:"Legacy home station",nodes:[],operatingPowerWatts:50}, location:null }) }));
vi.mock("@/hooks/useActiveBandMode", () => ({ useActiveBandMode: () => ({activeBand:"20m",activeMode:"CW"}) }));
vi.mock("@/stores/shackStore", () => ({
  useStationChains: () => [{id:"portable",name:"POTA pack"}],
  useShackStore: (selector: (s: unknown) => unknown) => selector({setActiveChain:vi.fn()}),
  useUserRadios: () => [], useUserAntennas: () => [],
}));
it("displays the active legacy preset rather than selecting an unrelated saved chain", () => {
  render(<MemoryRouter><HomeStation now={Date.now()} /></MemoryRouter>);
  expect((screen.getByRole("combobox",{name:"Home active station setup"}) as HTMLSelectElement).value).toBe("preset:legacy");
  expect((screen.getByRole("option",{name:"Legacy home station · legacy preset"}) as HTMLOptionElement).selected).toBe(true);
  expect(screen.getByText("50 W configured")).toBeTruthy();
});
