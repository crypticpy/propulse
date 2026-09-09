import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMapStore } from "@/stores/mapStore";
import { useMapSpotFeed } from "@/hooks/useMapSpotFeed";
import { usePskStationView } from "@/hooks/usePskStation";
import { SpotsTab } from "./SpotsTab";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { createViewConfiguration } from "@/lib/views/defaults";
import { createMemoryWorkingStorage, type ScopedViewRuntime } from "@/lib/views/runtime";
vi.mock("@/hooks/useMapSpotFeed", () => ({
  useMapSpotFeed: vi.fn(() => ({ station: { view: usePskStationView(), feed: { callsign: "N0TEST" } }, sourceStates: { PSKReporter: "STALE", RBN: "UNAVAILABLE", "WSJT-X": "BRIDGE OFF" } })),
}));
const initial = useMapStore.getState();
afterEach(() => { useMapStore.setState(initial); localStorage.removeItem("propulse-spot-age-minutes"); });

// SpotsTab's "Map spot limit" control now patches the bound view runtime's
// `spots.filters.spotLimit` (SP-09 review fix) rather than
// `mapStore.displayDensity`, which nothing reads for the map's spot cap any
// more. Capture the runtime so tests can assert against it.
let capturedRuntime: ScopedViewRuntime | null = null;
function RuntimeCapture() {
  capturedRuntime = useViewRuntime();
  return null;
}

function renderTab(spotLimit = 50) {
  const seed = createViewConfiguration("hamclock");
  seed.spots.filters.spotLimit = spotLimit;
  capturedRuntime = null;
  const utils = render(
    <ViewProvider ownerId="test-owner" slot="hamclock" seed={seed} storage={createMemoryWorkingStorage()}>
      <RuntimeCapture />
      <SpotsTab />
    </ViewProvider>,
  );
  return { ...utils, get runtime() { return capturedRuntime!; } };
}

it("changes the shared cap by keyboard while preserving source and band filters", () => {
  const { runtime } = renderTab(150);
  const bands = runtime.getSnapshot().config.spots.filters.bands;
  const sources = runtime.getSnapshot().config.spots.filters.sources;
  const selected = screen.getByRole("radio", { name: "150" });
  expect(selected.getAttribute("aria-checked")).toBe("true");
  fireEvent.keyDown(selected, { key: "End" });
  expect(runtime.getSnapshot().config.spots.filters.spotLimit).toBe(200);
  expect(runtime.getSnapshot().config.spots.filters.bands).toEqual(bands);
  expect(runtime.getSnapshot().config.spots.filters.sources).toEqual(sources);
  expect(document.activeElement).toBe(screen.getByRole("radio", { name: "200" }));
});

it("represents an intermediate desktop value without silently changing it", () => {
  const { runtime } = renderTab(125);
  expect(screen.getByRole("radio", { name: "125" }).getAttribute("aria-checked")).toBe("true");
  act(() => {
    const snapshot = runtime.getSnapshot();
    runtime.updateWorkingView({
      spots: {
        ...snapshot.config.spots,
        filters: { ...snapshot.config.spots.filters, spotLimit: 50 },
      },
    });
  });
  expect(screen.queryByRole("radio", { name: "125" })).toBeNull();
  expect(screen.getByRole("radio", { name: "50" }).getAttribute("aria-checked")).toBe("true");
});

it("changes map age by keyboard, persists it, and exposes source state", () => {
  renderTab();
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
  renderTab();
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


it("observes source status when only the globe spectrum ring needs live spots", () => {
  useMapStore.setState({ layers: { ...initial.layers, spots: false, spotTraces: false, gridActivity: false, spectrumRing: true } });
  renderTab();
  expect(useMapSpotFeed).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
});
