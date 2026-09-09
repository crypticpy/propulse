import { beforeEach, describe, expect, it } from "vitest";
import { useMapStore } from "./mapStore";

/**
 * #691 M2 — `setActivePreset` also writes `rotation`/`zoom`, so using it to
 * restore the active-preset indicator after a temporary state (HamClockView's
 * hero-projection force) ends discards any pan/zoom the operator did while
 * that state was in effect. `restoreActivePresetId` must re-mark the same
 * preset active without touching framing.
 */
describe("mapStore restoreActivePresetId", () => {
  beforeEach(() => {
    useMapStore.setState({
      regionPresets: [],
      activePresetId: null,
      rotation: { x: 0, y: 0 },
      zoom: 1,
    });
  });

  function addTestPreset(): string {
    useMapStore.getState().addRegionPreset({
      name: "Test region",
      center: { lat: 10, lon: 20 },
      zoom: 2.5,
      rotation: { x: 10, y: -20 },
    });
    const presets = useMapStore.getState().regionPresets;
    return presets[presets.length - 1].id;
  }

  it("does not overwrite rotation/zoom the operator changed while a state was forced", () => {
    const id = addTestPreset();
    useMapStore.getState().setActivePreset(id);
    expect(useMapStore.getState().rotation).toEqual({ x: 10, y: -20 });
    expect(useMapStore.getState().zoom).toBe(2.5);

    // Operator pans/zooms while, say, a forced hero projection is active.
    useMapStore.setState({ rotation: { x: 42, y: -88 }, zoom: 3.8 });
    useMapStore.setState({ activePresetId: null });

    useMapStore.getState().restoreActivePresetId(id);

    expect(useMapStore.getState().activePresetId).toBe(id);
    expect(useMapStore.getState().rotation).toEqual({ x: 42, y: -88 });
    expect(useMapStore.getState().zoom).toBe(3.8);
  });

  it("bumps lastUsed on the restored preset", () => {
    const id = addTestPreset();
    const before = useMapStore
      .getState()
      .regionPresets.find((p) => p.id === id)?.lastUsed;

    useMapStore.getState().restoreActivePresetId(id);

    const after = useMapStore
      .getState()
      .regionPresets.find((p) => p.id === id)?.lastUsed;
    expect(after).toBeDefined();
    expect(after).not.toBe(before);
  });

  it("is a no-op when the preset id no longer exists", () => {
    useMapStore.setState({ activePresetId: null });
    useMapStore.getState().restoreActivePresetId("does-not-exist");
    expect(useMapStore.getState().activePresetId).toBeNull();
  });

  it("contrast: setActivePreset (the plain reselect action) does re-apply stored framing", () => {
    const id = addTestPreset();
    useMapStore.getState().setActivePreset(id);
    useMapStore.setState({ rotation: { x: 42, y: -88 }, zoom: 3.8 });

    useMapStore.getState().setActivePreset(id);

    expect(useMapStore.getState().rotation).toEqual({ x: 10, y: -20 });
    expect(useMapStore.getState().zoom).toBe(2.5);
  });
});
