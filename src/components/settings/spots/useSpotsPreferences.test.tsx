import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createViewConfiguration } from "@/lib/views/defaults";
import { getActivityRecipe, getDisplayRecipe } from "@/lib/views/presets";
import { createSavedViewFixture, createTestView, type TestViewHandle } from "./testing";
import { useSpotsPreferences } from "./useSpotsPreferences";

const open: TestViewHandle[] = [];

function view(slotId = "pro"): TestViewHandle {
  const handle = createTestView({ slotId });
  open.push(handle);
  return handle;
}

afterEach(() => {
  while (open.length) open.pop()?.dispose();
});

describe("scoped working copy", () => {
  it("edits only its own running view", () => {
    const left = view("pro");
    const right = view("hamclock");
    const before = JSON.stringify(right.runtime.getSnapshot().config);

    const leftHook = renderHook(() => useSpotsPreferences({ view: left.view }));
    renderHook(() => useSpotsPreferences({ view: right.view }));

    act(() => leftHook.result.current.patchFilters({ spotLimit: 120 }));

    expect(left.runtime.getSnapshot().config.spots.filters.spotLimit).toBe(120);
    expect(JSON.stringify(right.runtime.getSnapshot().config)).toBe(before);
  });

  it("writes filter, grouping and path patches through the runtime", () => {
    const handle = view();
    const { result } = renderHook(() => useSpotsPreferences({ view: handle.view }));

    act(() => result.current.patchFilters({ maxAgeMinutes: 15 }));
    act(() => result.current.patchGrouping({ minGroupSize: 8 }));
    act(() => result.current.patchPaths({ animate: "all-displayed" }));

    const config = handle.runtime.getSnapshot().config;
    expect(config.spots.filters.maxAgeMinutes).toBe(15);
    expect(config.spots.grouping.minGroupSize).toBe(8);
    expect(config.spots.paths.animate).toBe("all-displayed");
  });

  it("restores filter defaults without touching grouping, motion or the preset", () => {
    const handle = view();
    const { result } = renderHook(() => useSpotsPreferences({ view: handle.view }));

    act(() => result.current.applyPreset(getActivityRecipe("activity-ft8-v1")));
    act(() => result.current.patchGrouping({ minGroupSize: 12 }));
    const grouping = handle.runtime.getSnapshot().config.spots.grouping;
    const paths = handle.runtime.getSnapshot().config.spots.paths;

    act(() => result.current.clearFilters());

    const after = handle.runtime.getSnapshot().config.spots;
    expect(after.filters.modes.all).toBe(true);
    expect(after.filters.maxAgeMinutes).toBe(30);
    expect(after.filters.spotLimit).toBe(150);
    expect(after.filters.bands).toEqual([]);
    expect(after.filters.sources).toEqual([]);
    expect(after.grouping).toEqual(grouping);
    expect(after.paths).toEqual(paths);
    expect(result.current.customization.presetId).toBe("activity-ft8-v1");
  });
});

describe("rebinding to a different running view", () => {
  it("clears revert, baseline and preset state when rebound to a different unsaved runtime", () => {
    const first = view();
    const second = view();
    const { result, rerender } = renderHook(
      ({ v }) => useSpotsPreferences({ view: v }),
      { initialProps: { v: first.view } },
    );

    act(() => result.current.applyPreset(getActivityRecipe("activity-ft8-v1")));
    expect(result.current.canRevert).toBe(true);
    expect(result.current.customization.presetId).toBe("activity-ft8-v1");
    expect(result.current.appliedPreset?.id).toBe("activity-ft8-v1");

    // Both runtimes are unsaved, so `savedView` is null on both sides of the
    // rebind — only the runtime's own instanceId can distinguish them.
    rerender({ v: second.view });

    expect(result.current.canRevert).toBe(false);
    expect(result.current.customization.presetId).toBeNull();
    expect(result.current.appliedPreset).toBeNull();
    expect(result.current.status).toBe("saved");

    // The stale revert point must not be replayable onto the new runtime.
    const beforeRevertCall = JSON.stringify(second.runtime.getSnapshot().config);
    act(() => result.current.revert());
    expect(JSON.stringify(second.runtime.getSnapshot().config)).toBe(beforeRevertCall);
  });
});

describe("working changes and saved state (UX-02)", () => {
  it("reports Saved until the first edit when no record is loaded", () => {
    const handle = view();
    const { result } = renderHook(() => useSpotsPreferences({ view: handle.view }));
    expect(result.current.status).toBe("saved");
    act(() => result.current.patchFilters({ spotLimit: 80 }));
    expect(result.current.status).toBe("working-changes");
  });

  it("compares against the loaded record and clears once it is saved again", () => {
    const handle = view();
    const savedView = createSavedViewFixture({
      config: handle.runtime.getSnapshot().config,
    });
    const { result } = renderHook(() => useSpotsPreferences({ view: handle.view, savedView }));

    expect(result.current.status).toBe("saved");
    expect(result.current.viewName).toBe("Station Monitor");

    act(() => result.current.patchFilters({ spotLimit: 80 }));
    expect(result.current.status).toBe("working-changes");

    act(() =>
      result.current.markSaved({
        ...savedView,
        revision: savedView.revision + 1,
        config: handle.runtime.getSnapshot().config,
      }),
    );
    expect(result.current.status).toBe("saved");
  });
});

describe("preset preview, application and revert (PRESET-03)", () => {
  it("previews without writing anything", () => {
    const handle = view();
    const { result } = renderHook(() => useSpotsPreferences({ view: handle.view }));
    const before = JSON.stringify(handle.runtime.getSnapshot().config);

    const preview = result.current.previewPreset(getActivityRecipe("activity-ft8-v1"));

    expect(preview.changes.length).toBeGreaterThan(0);
    expect(JSON.stringify(handle.runtime.getSnapshot().config)).toBe(before);
    expect(result.current.canRevert).toBe(false);
  });

  it("preserves projection, layout and camera when an activity recipe is applied", () => {
    const handle = view();
    const { result } = renderHook(() => useSpotsPreferences({ view: handle.view }));
    const presentation = JSON.stringify(handle.runtime.getSnapshot().config.presentation);

    act(() => result.current.applyPreset(getActivityRecipe("activity-cw-v1")));

    const after = handle.runtime.getSnapshot().config;
    expect(JSON.stringify(after.presentation)).toBe(presentation);
    expect(after.spots.filters.maxAgeMinutes).toBe(15);
    expect(after.spots.filters.spotLimit).toBe(100);
  });

  it("replaces the whole configuration for a display template", () => {
    const handle = view();
    const { result } = renderHook(() => useSpotsPreferences({ view: handle.view }));
    const recipe = getDisplayRecipe("display-hamclock-v1");

    act(() => result.current.applyPreset(recipe));

    expect(handle.runtime.getSnapshot().config).toEqual(recipe.config);
  });

  it("reverts to the configuration captured before the application", () => {
    const handle = view();
    const { result } = renderHook(() => useSpotsPreferences({ view: handle.view }));
    const before = JSON.stringify(handle.runtime.getSnapshot().config);

    act(() => result.current.applyPreset(getActivityRecipe("activity-quiet-v1")));
    expect(result.current.canRevert).toBe(true);

    act(() => result.current.revert());

    expect(JSON.stringify(handle.runtime.getSnapshot().config)).toBe(before);
    expect(result.current.canRevert).toBe(false);
  });

  it("withdraws revert once the working copy is edited again", () => {
    const handle = view();
    const { result } = renderHook(() => useSpotsPreferences({ view: handle.view }));

    act(() => result.current.applyPreset(getActivityRecipe("activity-ssb-v1")));
    expect(result.current.canRevert).toBe(true);

    act(() => result.current.patchFilters({ spotLimit: 70 }));
    expect(result.current.canRevert).toBe(false);
  });

  it("treats a no-op application as no change and arms no revert", () => {
    // The view starts already matching the recipe (SP-09 round 2: the shared
    // spot-limit default, 150, no longer coincides with the "Balanced
    // activity" recipe's own curated 50, so a truly fresh view is no longer
    // a no-op target for it). Seeding the view at the recipe's own spots
    // config keeps this test's intent — reapplying an already-applied
    // preset changes nothing and arms no revert.
    const recipe = getActivityRecipe("activity-balanced-v1");
    const seed = createViewConfiguration("pro");
    seed.spots = structuredClone(recipe.spots);
    const handle = createTestView({ seed });
    open.push(handle);
    const { result } = renderHook(() => useSpotsPreferences({ view: handle.view }));

    act(() => result.current.applyPreset(recipe));
    const revisionAfterFirst = handle.runtime.getSnapshot().workingRevision;
    const configAfterFirst = JSON.stringify(handle.runtime.getSnapshot().config);

    act(() => result.current.applyPreset(recipe));

    expect(handle.runtime.getSnapshot().workingRevision).toBe(revisionAfterFirst);
    expect(JSON.stringify(handle.runtime.getSnapshot().config)).toBe(configAfterFirst);
    expect(result.current.canRevert).toBe(false);
  });
});

describe("customized state", () => {
  it("labels the applied recipe and marks drift from it", () => {
    const handle = view();
    const { result } = renderHook(() => useSpotsPreferences({ view: handle.view }));

    act(() => result.current.applyPreset(getActivityRecipe("activity-ft8-v1")));
    expect(result.current.customization.presetId).toBe("activity-ft8-v1");
    expect(result.current.customization.presetName).toBe("FT8 monitoring");
    expect(result.current.customization.customized).toBe(false);

    act(() => result.current.patchFilters({ spotLimit: 60 }));
    expect(result.current.customization.customized).toBe(true);

    act(() => result.current.resetToBuiltIn("activity-ft8-v1"));
    expect(result.current.customization.customized).toBe(false);
  });
});

describe("follow radio (FILTER-03)", () => {
  it("is off by default and reports its status", () => {
    const handle = view();
    const { result } = renderHook(() => useSpotsPreferences({ view: handle.view }));
    expect(result.current.config.context.followRadio).toBe(false);
    expect(result.current.followStatus).toBe("off");
  });

  it("pauses when following with no radio reporting and follows a reporting radio", () => {
    const handle = view();
    const withoutRadio = renderHook(() => useSpotsPreferences({ view: handle.view }));
    act(() => withoutRadio.result.current.setFollowRadio(true));
    expect(withoutRadio.result.current.followStatus).toBe("paused-missing-radio");

    const withRadio = renderHook(() =>
      useSpotsPreferences({ view: handle.view, radio: { band: "20m", mode: "FT8" } }),
    );
    expect(withRadio.result.current.followStatus).toBe("active");
    expect(withRadio.result.current.effectiveSpots.filters.bands).toEqual(["20m"]);
    // Effective filters are never written back over the configured ones.
    expect(handle.runtime.getSnapshot().config.spots.filters.bands).toEqual([]);
  });
});

describe("source availability (FILTER-03)", () => {
  it("explains availability without starting a connection or substituting a source", () => {
    const handle = view();
    const { result } = renderHook(() =>
      useSpotsPreferences({
        view: handle.view,
        feedAvailability: [
          { source: "WSJT-X", enabled: false, authorized: true, connected: false, reason: "no local WSJT-X" },
        ],
      }),
    );

    act(() => result.current.patchFilters({ sources: ["WSJT-X"] }));

    const note = result.current.sourceNotes.find((entry) => entry.source === "WSJT-X");
    expect(note).toBeDefined();
    expect(note?.substituted).toBe(false);
    expect(note?.connectionStarted).toBe(false);
    expect(handle.runtime.getSnapshot().config.spots.filters.sources).toEqual(["WSJT-X"]);
  });
});
