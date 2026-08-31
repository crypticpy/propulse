import { beforeEach, describe, expect, it } from "vitest";
import { useMapStore } from "./mapStore";

describe("mapStore HamClock layout", () => {
  beforeEach(() => {
    useMapStore.setState({
      layoutMode: "normal",
      viewMode: "globe",
      nightDarkness: 1,
    });
  });

  it("enters HamClock on the lightweight flat projection", () => {
    useMapStore.getState().setLayoutMode("hamclock");

    expect(useMapStore.getState().layoutMode).toBe("hamclock");
    expect(useMapStore.getState().viewMode).toBe("flat");
  });

  it("still allows the operator to choose another HamClock projection", () => {
    useMapStore.getState().setLayoutMode("hamclock");
    useMapStore.getState().setViewMode("globe");

    expect(useMapStore.getState().viewMode).toBe("globe");
  });

  it("persists night darkness and clamps renderer intensity", () => {
    useMapStore.getState().setNightDarkness(0.45);

    expect(useMapStore.getState().nightDarkness).toBe(0.45);
    expect(localStorage.getItem("propulse-night-darkness")).toBe("0.45");

    useMapStore.getState().setNightDarkness(2);
    expect(useMapStore.getState().nightDarkness).toBe(1);

    useMapStore.getState().setNightDarkness(-1);
    expect(useMapStore.getState().nightDarkness).toBe(0);

    useMapStore.getState().setNightDarkness(Number.NaN);
    expect(useMapStore.getState().nightDarkness).toBe(0);
  });
});
