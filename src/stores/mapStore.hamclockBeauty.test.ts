import { beforeEach, describe, expect, it } from "vitest";
import { useMapStore } from "./mapStore";
import { useHamClockStore } from "./hamclockStore";
import { useDisplayQualityStore } from "./displayQualityStore";
import { HAMCLOCK_BEAUTY_DEFAULTS } from "@/lib/hamclock/modePresets";

describe("mapStore HamClock beauty enter/exit", () => {
  beforeEach(() => {
    useHamClockStore.setState({
      enterSnapshot: null,
      hamclockMode: "traffic",
      preferredViewMode: "flat",
      filtersBeforeBands: null,
    });
    useDisplayQualityStore.setState({ displayQuality: "auto" });
    useMapStore.setState({
      layoutMode: "normal",
      viewMode: "globe",
      mapStyle: "standard",
      nightDarkness: 1,
      layers: {
        ...useMapStore.getState().layers,
        spots: true,
        muf: false,
        terminator: false,
      },
    });
  });

  it("applies beauty defaults on HamClock enter and restores on exit", () => {
    useMapStore.setState({ layoutMode: "pro" });
    useMapStore.getState().setLayoutMode("hamclock");

    const entered = useMapStore.getState();
    expect(entered.layoutMode).toBe("hamclock");
    expect(entered.viewMode).toBe("flat");
    expect(entered.mapStyle).toBe(HAMCLOCK_BEAUTY_DEFAULTS.mapStyle);
    expect(entered.nightDarkness).toBe(HAMCLOCK_BEAUTY_DEFAULTS.nightDarkness);
    expect(useDisplayQualityStore.getState().displayQuality).toBe(
      HAMCLOCK_BEAUTY_DEFAULTS.displayQuality,
    );
    expect(entered.layers.terminator).toBe(true);
    expect(entered.layers.nightLights).toBe(true);

    useMapStore.getState().setLayoutMode("normal");
    const restored = useMapStore.getState();
    expect(restored.layoutMode).toBe("pro");
    expect(restored.viewMode).toBe("globe");
    expect(restored.mapStyle).toBe("standard");
    expect(restored.nightDarkness).toBe(1);
    expect(useDisplayQualityStore.getState().displayQuality).toBe("auto");
  });

  it("seeds filtersBeforeBands when entering directly in Bands mode", () => {
    useHamClockStore.setState({ hamclockMode: "bands", bandFocus: ["20m"] });
    useMapStore.setState({
      layoutMode: "normal",
      spotFilters: {
        ...useMapStore.getState().spotFilters,
        bands: ["40m"],
      },
    });
    useMapStore.getState().setLayoutMode("hamclock");
    expect(useHamClockStore.getState().filtersBeforeBands?.bands).toEqual([
      "40m",
    ]);
    expect(useMapStore.getState().spotFilters.bands).toEqual(["20m"]);
  });

  it("snapshots tileProviderId on HamClock enter and restores it (in memory and persisted) on exit — B6 fix #5", () => {
    localStorage.clear();
    useMapStore.setState({ layoutMode: "normal", tileProviderId: "esri-world" });
    useMapStore.getState().setTileProviderId("esri-world");

    useMapStore.getState().setLayoutMode("hamclock");
    // A style chosen inside HamClock must not leak into the restored session.
    useMapStore.getState().setTileProviderId("carto-dark");
    expect(useMapStore.getState().tileProviderId).toBe("carto-dark");

    useMapStore.getState().setLayoutMode("normal");

    expect(useMapStore.getState().tileProviderId).toBe("esri-world");
    expect(
      JSON.parse(
        localStorage.getItem("propulse-tile-provider-id") as string,
      ),
    ).toEqual({ version: 1, id: "esri-world" });
  });

  it("restores a null tileProviderId (no explicit choice) by clearing the persisted override on HamClock exit", () => {
    localStorage.clear();
    useMapStore.setState({ layoutMode: "normal", tileProviderId: null });

    useMapStore.getState().setLayoutMode("hamclock");
    useMapStore.getState().setTileProviderId("mapbox-satellite");
    expect(localStorage.getItem("propulse-tile-provider-id")).not.toBeNull();

    useMapStore.getState().setLayoutMode("normal");

    expect(useMapStore.getState().tileProviderId).toBeNull();
    expect(localStorage.getItem("propulse-tile-provider-id")).toBeNull();
  });

  it("clamps night darkness", () => {
    useMapStore.getState().setNightDarkness(0.45);
    expect(useMapStore.getState().nightDarkness).toBe(0.45);
    useMapStore.getState().setNightDarkness(2);
    expect(useMapStore.getState().nightDarkness).toBe(1);
    useMapStore.getState().setNightDarkness(-1);
    expect(useMapStore.getState().nightDarkness).toBe(0);
  });
});

it("keeps HamClock panels and projection in Observatory, restoring filters on final exit", () => {
  useHamClockStore.setState({
    hamclockMode: "traffic",
    preferredViewMode: "flat",
    bandFocus: ["20m"],
  });
  useMapStore.setState({
    layoutMode: "normal",
    viewMode: "globe",
    spotFilters: { bands: ["40m"], modes: ["CW"] },
    observatoryMode: false,
  });
  useMapStore.getState().setLayoutMode("hamclock");
  expect(useMapStore.getState().spotFilters.bands).toEqual(["20m"]);
  useMapStore.getState().enterObservatory();
  expect(useMapStore.getState()).toMatchObject({
    layoutMode: "hamclock",
    viewMode: "flat",
    observatoryMode: true,
  });
  useMapStore.getState().exitObservatory();
  expect(useMapStore.getState()).toMatchObject({
    layoutMode: "hamclock",
    viewMode: "flat",
    observatoryMode: false,
  });
  useMapStore.getState().enterObservatory();
  useMapStore.getState().setLayoutMode("normal");
  expect(useMapStore.getState()).toMatchObject({
    layoutMode: "normal",
    viewMode: "globe",
    observatoryMode: false,
    spotFilters: { bands: ["40m"], modes: ["CW"] },
  });
});

it("clears Observatory on HamClock exit even without an entry snapshot", () => {
  useHamClockStore.setState({ enterSnapshot: null });
  useMapStore.setState({
    layoutMode: "hamclock",
    viewMode: "flat",
    autoRotate: false,
    observatoryMode: false,
    observatoryPreviousState: null,
  });
  useMapStore.getState().enterObservatory();
  useMapStore.getState().setLayoutMode("normal");
  expect(useMapStore.getState()).toMatchObject({
    layoutMode: "normal",
    observatoryMode: false,
    observatoryPreviousState: null,
    autoRotate: false,
  });
  useMapStore.getState().enterObservatory();
  expect(useMapStore.getState().observatoryMode).toBe(true);
  useMapStore.getState().exitObservatory();
});
