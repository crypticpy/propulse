import { beforeEach, describe, expect, it } from "vitest";
import { useMapStore } from "./mapStore";

describe("mapStore HamClock layout", () => {
  beforeEach(() => {
    useMapStore.setState({ layoutMode: "normal", viewMode: "globe" });
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
});
