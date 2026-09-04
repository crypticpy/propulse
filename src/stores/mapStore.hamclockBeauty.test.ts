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

  it("clamps night darkness", () => {
    useMapStore.getState().setNightDarkness(0.45);
    expect(useMapStore.getState().nightDarkness).toBe(0.45);
    useMapStore.getState().setNightDarkness(2);
    expect(useMapStore.getState().nightDarkness).toBe(1);
    useMapStore.getState().setNightDarkness(-1);
    expect(useMapStore.getState().nightDarkness).toBe(0);
  });
});
