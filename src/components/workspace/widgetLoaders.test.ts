import { describe, expect, it } from "vitest";
import { getWidgetComponent } from "./widgetLoaders";

describe("getWidgetComponent", () => {
  it("returns a live component for the acceptance widgets at work density", () => {
    for (const id of ["cluster", "bestBand", "heatMap"]) {
      expect(getWidgetComponent(id, "work")).toBeTruthy();
    }
  });

  it("returns undefined for a widget id with no live form", () => {
    expect(getWidgetComponent("mapHero", "work")).toBeUndefined();
    expect(getWidgetComponent("not-a-real-widget-id", "work")).toBeUndefined();
  });

  it("has no live components at wall density yet", () => {
    for (const id of ["cluster", "bestBand", "heatMap"]) {
      expect(getWidgetComponent(id, "wall")).toBeUndefined();
    }
  });

  it("heatMap has a live glance-density component (HeatMapStrip, #661); cluster/bestBand still don't", () => {
    expect(getWidgetComponent("heatMap", "glance")).toBeTruthy();
    expect(getWidgetComponent("cluster", "glance")).toBeUndefined();
    expect(getWidgetComponent("bestBand", "glance")).toBeUndefined();
  });
});
