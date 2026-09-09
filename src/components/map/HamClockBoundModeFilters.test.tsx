import { act, render } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import {
  createMemoryWorkingStorage,
  type ScopedViewRuntime,
  type WorkingSlotStorage,
} from "@/lib/views/runtime";
import { useHamClockStore } from "@/stores/hamclockStore";
import { HamClockBoundModeFilters } from "./HamClockView";

let capturedRuntime: ScopedViewRuntime | null = null;

function RuntimeCapture() {
  capturedRuntime = useViewRuntime();
  return null;
}

function renderInView(
  storage: WorkingSlotStorage = createMemoryWorkingStorage(),
) {
  capturedRuntime = null;
  const utils = render(
    <ViewProvider ownerId="owner-test" slot="hamclock" storage={storage}>
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

  it("does not lose the operator's pre-Bands band selection across a leave-mid-Bands, come-back, then a later ordinary Bands cycle (#747)", () => {
    // Shared storage across both mounts: the "hamclock" slot is a persisted
    // interactive slot in production (sessionStorage-backed), so a remount
    // after leaving mid-Bands recovers the same working-view record the
    // first mount left behind, band patch and all. `createMemoryWorkingStorage`
    // reused across renders here reproduces that, unlike the other tests in
    // this file which each get a fresh, empty storage.
    const storage = createMemoryWorkingStorage();
    useHamClockStore.setState({
      hamclockMode: "traffic",
      bandFocus: ["20m"],
      filtersBeforeBands: null,
    });

    const first = renderInView(storage);
    // Seed the operator's real pre-Bands band selection (Traffic mode, not
    // yet touched by any Bands patch).
    act(() => {
      const snapshot = first.runtime.getSnapshot();
      first.runtime.updateWorkingView({
        spots: {
          ...snapshot.config.spots,
          filters: { ...snapshot.config.spots.filters, bands: ["15m"] },
        },
      });
    });
    expect(first.runtime.getSnapshot().config.spots.filters.bands).toEqual([
      "15m",
    ]);

    // T1: Enter Bands. Captures the true baseline (["15m"]) and patches the
    // runtime to the fixed Bands-mode band focus (["20m"]).
    act(() => useHamClockStore.getState().setHamclockMode("bands"));
    expect(first.runtime.getSnapshot().config.spots.filters.bands).toEqual([
      "20m",
    ]);
    expect(useHamClockStore.getState().filtersBeforeBands?.bands).toEqual([
      "15m",
    ]);

    // T2: Leave the layout while still in Bands mode -- unmount without ever
    // exiting Bands. Nothing resets `hamclockMode` on a layout exit, so it
    // stays "bands" in memory; the shared storage keeps the Bands-patched
    // runtime state.
    first.unmount();

    // T3: Come back. `prevModeRef` restarts at the sentinel on the fresh
    // instance, and `hamclockMode` is still "bands", so this remount is a
    // fresh "entry" from the component's perspective -- the exact re-entry
    // clobber from the issue. The recovered runtime already shows ["20m"];
    // the fix must not let the entry effect mistake that Bands-patched
    // state for the operator's baseline and re-capture it into
    // `filtersBeforeBands`, overwriting the still-correct ["15m"].
    const second = renderInView(storage);
    expect(second.runtime.getSnapshot().config.spots.filters.bands).toEqual([
      "20m",
    ]);
    expect(useHamClockStore.getState().filtersBeforeBands?.bands).toEqual([
      "15m",
    ]);

    // Exiting Bands now must restore the operator's true original selection,
    // not the Bands-patched value it was clobbered with. This is the exact
    // assertion from the issue's reproduction.
    act(() => useHamClockStore.getState().setHamclockMode("traffic"));
    expect(second.runtime.getSnapshot().config.spots.filters.bands).toEqual([
      "15m",
    ]);
    expect(useHamClockStore.getState().filtersBeforeBands).toBeNull();

    // T4/T5: a second, ordinary Bands cycle on the same still-mounted
    // component (no unmount involved) must behave normally afterward -- no
    // stale ref or store state survives the fix into a later, unrelated
    // session.
    act(() => useHamClockStore.getState().setHamclockMode("bands"));
    expect(second.runtime.getSnapshot().config.spots.filters.bands).toEqual([
      "20m",
    ]);
    expect(useHamClockStore.getState().filtersBeforeBands?.bands).toEqual([
      "15m",
    ]);

    act(() => useHamClockStore.getState().setHamclockMode("traffic"));
    expect(second.runtime.getSnapshot().config.spots.filters.bands).toEqual([
      "15m",
    ]);
    expect(useHamClockStore.getState().filtersBeforeBands).toBeNull();
  });

  it("survives a StrictMode double-invoke of the mount effects when landing already in Bands mode (#770 review)", () => {
    // StrictMode double-invokes effects on mount in dev: setup, cleanup,
    // setup again. Without resetting `prevModeRef`/`pendingRestoreRef` in
    // the unmount cleanup, the replayed setup sees `prev === "bands"`
    // (untouched) and takes neither branch, leaving Bands mode selected
    // while the runtime shows the just-restored pre-Bands filters.
    let mountEffectRuns = 0;
    function MountEffectProbe() {
      // Same shape as the component's own unmount-only effect ([] deps, no
      // cleanup needed here), used only to prove this test environment and
      // React version actually double-invoke effects on mount -- if this
      // count were 1, the assertions below would pass for the wrong reason.
      useEffect(() => {
        mountEffectRuns += 1;
      }, []);
      return null;
    }

    const storage = createMemoryWorkingStorage();
    useHamClockStore.setState({
      hamclockMode: "bands",
      bandFocus: ["40m"],
      filtersBeforeBands: null,
    });

    capturedRuntime = null;
    render(
      <StrictMode>
        <ViewProvider ownerId="owner-test" slot="hamclock" storage={storage}>
          <RuntimeCapture />
          <MountEffectProbe />
          <HamClockBoundModeFilters />
        </ViewProvider>
      </StrictMode>,
    );

    // Proves the double-invoke path actually ran in this environment.
    expect(mountEffectRuns).toBe(2);

    const runtime = capturedRuntime!;
    // The Bands patch must be applied -- not left at the pre-Bands filters
    // the StrictMode replay's cleanup restores in between the two setups.
    expect(runtime.getSnapshot().config.spots.filters.bands).toEqual(["40m"]);
    expect(useHamClockStore.getState().filtersBeforeBands?.bands).toEqual([]);
  });
});
