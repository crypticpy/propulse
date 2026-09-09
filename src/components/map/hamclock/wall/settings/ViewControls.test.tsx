import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useHamClockStore } from "@/stores/hamclockStore";
import { useMapStore } from "@/stores/mapStore";
import { ViewControls } from "./ViewControls";

const initialMap = useMapStore.getState();
const initialHamClock = useHamClockStore.getState();
afterEach(() => {
  useMapStore.setState(initialMap);
  useHamClockStore.setState(initialHamClock);
});

// #754/#772: the "Map projection" caveat sits in a LiveRegion so a later
// hero-projection force (#625) is announced. Proven here via the real store
// path — enabling the `drap` hero-critical layer while the preferred
// projection is azimuthal is exactly what forces the projection and
// populates `heroProjectionReason` (see layerCapabilities.ts).
it("mounts the hero-projection caveat region empty, then mutates the same node once a critical layer forces the projection", () => {
  useMapStore.setState((state) => ({
    viewMode: "azimuthal",
    layers: { ...state.layers, drap: false },
  }));
  useHamClockStore.setState({ preferredViewMode: "azimuthal" });

  render(<ViewControls />);
  const before = screen.getByRole("status");
  expect(before.textContent).toBe("");

  act(() => {
    useMapStore.setState((state) => ({
      layers: { ...state.layers, drap: true },
    }));
  });

  const after = screen.getByRole("status");
  expect(after).toBe(before);
  expect(after.textContent).toContain("cannot draw");
});
