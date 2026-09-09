import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { createMemoryWorkingStorage, type ScopedViewRuntime } from "@/lib/views/runtime";
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

  it("captures and patches on mount when hamclockMode is already 'bands' (layout re-entered with a stale in-memory mode, or a kiosk scene pinning Bands)", () => {
    // `hamclockMode` is persisted, but `hamclockStore.ts` coerces a persisted
    // "bands" back to "traffic" on every rehydrate, so a reload never lands
    // here. This component can still mount fresh with `hamclockMode` already
    // "bands" via `LayoutModeDropdown.tsx`'s `selectMode` re-entering the
    // hamclock layout while the in-memory mode is still "bands" from an
    // earlier visit, or `lib/kiosk/applySceneToMap.ts` setting
    // `hamclockMode` before `setLayoutMode` when a kiosk scene pins Bands.
    // mapStore's `setLayoutMode` used to independently seed
    // `filtersBeforeBands` for this case from its own legacy spotFilters,
    // which no longer type-matches the bound-view filter shape. This
    // component must cover the case on its own instead.
    useHamClockStore.setState({
      hamclockMode: "bands",
      bandFocus: ["40m"],
      filtersBeforeBands: null,
    });
    const { runtime } = renderInView();

    expect(runtime.getSnapshot().config.spots.filters.bands).toEqual(["40m"]);
    expect(useHamClockStore.getState().filtersBeforeBands?.bands).toEqual([]);
  });
});
