import { beforeEach, describe, expect, it, vi } from "vitest";

const LABEL_OPTIONS_LS_KEY = "propulse-label-options";

/** `loadLabelOptions()` only runs once, at module init, so cases that need
 * to control what's in localStorage before that first read reset the
 * module registry and re-import the store fresh. Modeled on
 * `mapStore.tileProvider.test.ts`'s `loadFreshStore`. */
async function loadFreshStore() {
  vi.resetModules();
  const { useMapStore } = await import("./mapStore");
  return useMapStore;
}

describe("mapStore label options: terminatorDashed (#1091 PR 8)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to false -- a solid line is the most visible default", async () => {
    const useMapStore = await loadFreshStore();
    expect(useMapStore.getState().labelOptions.terminatorDashed).toBe(false);
  });

  it("merges a saved options object without the key in as false", async () => {
    localStorage.setItem(
      LABEL_OPTIONS_LS_KEY,
      JSON.stringify({ borders: false, stateBorders: true }),
    );
    const useMapStore = await loadFreshStore();
    const { labelOptions } = useMapStore.getState();
    expect(labelOptions.terminatorDashed).toBe(false);
    // The rest of the saved object still merges over the defaults.
    expect(labelOptions.borders).toBe(false);
    expect(labelOptions.stateBorders).toBe(true);
  });

  it("setLabelOption('terminatorDashed', true) flips and persists it", async () => {
    const useMapStore = await loadFreshStore();
    useMapStore.getState().setLabelOption("terminatorDashed", true);
    expect(useMapStore.getState().labelOptions.terminatorDashed).toBe(true);
    const saved = JSON.parse(localStorage.getItem(LABEL_OPTIONS_LS_KEY)!);
    expect(saved.terminatorDashed).toBe(true);
  });
});

describe("mapStore label options: spotPathAgeFade (#1247)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to false -- an unfaded path is the most visible default", async () => {
    const useMapStore = await loadFreshStore();
    expect(useMapStore.getState().labelOptions.spotPathAgeFade).toBe(false);
  });

  it("merges a saved options object without the key in as false", async () => {
    localStorage.setItem(
      LABEL_OPTIONS_LS_KEY,
      JSON.stringify({ borders: false, stateBorders: true }),
    );
    const useMapStore = await loadFreshStore();
    const { labelOptions } = useMapStore.getState();
    expect(labelOptions.spotPathAgeFade).toBe(false);
    // The rest of the saved object still merges over the defaults.
    expect(labelOptions.borders).toBe(false);
    expect(labelOptions.stateBorders).toBe(true);
  });

  it("setLabelOption('spotPathAgeFade', true) flips and persists it", async () => {
    const useMapStore = await loadFreshStore();
    useMapStore.getState().setLabelOption("spotPathAgeFade", true);
    expect(useMapStore.getState().labelOptions.spotPathAgeFade).toBe(true);
    const saved = JSON.parse(localStorage.getItem(LABEL_OPTIONS_LS_KEY)!);
    expect(saved.spotPathAgeFade).toBe(true);
  });
});
