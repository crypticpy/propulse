import { describe, expect, it } from "vitest";
import type { WidgetDensity } from "@/lib/workspace/types";
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

  it("has no live components at wall or glance density yet", () => {
    const densities: WidgetDensity[] = ["wall", "glance"];
    for (const density of densities) {
      for (const id of ["cluster", "bestBand", "heatMap"]) {
        expect(getWidgetComponent(id, density)).toBeUndefined();
      }
    }
  });
});
