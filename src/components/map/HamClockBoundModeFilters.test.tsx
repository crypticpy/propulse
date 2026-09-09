import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewRuntime, type ScopedViewRuntime } from "@/components/views/ViewRuntimeContext";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useHamClockStore } from "@/stores/hamclockStore";
import { HamClockBoundModeFilters } from "./HamClockView";

let capturedRuntime: ScopedViewRuntime | null = null;

function RuntimeCapture() {
  capturedRuntime = useViewRuntime();
  return null;
}

function renderInView() {
  capturedRuntime = null;
  const utils = render(
    <ViewProvider ownerId="owner-test" slot="hamclock" storage={createMemoryWorkingStorage()}>
      <RuntimeCapture />
      <HamClockBoundModeFilters />
    </ViewProvider>,
  );
  return { ...utils, get runtime() { return capturedRuntime!; } };
}

const original = useHamClockStore.getState();

describe("HamClockBoundModeFilters (SP-09 round 2, 1c)", () => {
  afterEach(() => {
    useHamClockStore.setState({
      hamclockMode: original.hamclockMode,
      bandFocus: original.bandFocus,
      filtersBeforeBands: original.filtersBeforeBands,
    });
  });

  it("patches the bound view runtime's bands filter on Bands-mode entry, and restores it on exit", () => {
    useHamClockStore.setState({
      hamclockMode: "traffic",
      bandFocus: ["20m"],
      filtersBeforeBands: null,
    });
    const { runtime } = renderInView();
    const beforeBands = runtime.getSnapshot().config.spots.filters.bands;
    expect(beforeBands).toEqual([]);

    act(() => useHamClockStore.getState().setHamclockMode("bands"));

    // Entry: runtime now carries the operator's band focus, and the prior
    // filters were captured for restore.
    expect(runtime.getSnapshot().config.spots.filters.bands).toEqual(["20m"]);
    expect(useHamClockStore.getState().filtersBeforeBands?.bands).toEqual(beforeBands);

    act(() => useHamClockStore.getState().setHamclockMode("traffic"));

    // Exit: the runtime is restored to what it held before Bands mode, and
    // the capture is cleared so a later entry starts fresh.
    expect(runtime.getSnapshot().config.spots.filters.bands).toEqual(beforeBands);
    expect(useHamClockStore.getState().filtersBeforeBands).toBeNull();
  });
});
