import { describe, expect, it } from "vitest";
import { SOLAR_SOURCE_IDS } from "./sourcePolicies";
import { SOLAR_WIDGETS, sourceIdsForVisibleGroups } from "./widgetRegistry";

describe("solar widget registry", () => {
  it("uses unique widget IDs and declares every dependency", () => {
    expect(new Set(SOLAR_WIDGETS.map((widget) => widget.id)).size).toBe(
      SOLAR_WIDGETS.length,
    );
    const declared = new Set(
      SOLAR_WIDGETS.flatMap((widget) => [
        ...widget.requiredSources,
        ...widget.optionalSources,
      ]),
    );
    expect([...declared].sort()).toEqual([...SOLAR_SOURCE_IDS].sort());
  });

  it("keeps wall-only sources out of every visible refresh set", () => {
    const everything = sourceIdsForVisibleGroups(
      new Set(["now", "impacts", "forecast", "details"]),
    );
    for (const id of [
      "noaa-xray-24h",
      "noaa-magnetometer-24h",
      "noaa-flux-outlook",
    ]) {
      expect(everything).not.toContain(id);
    }
  });

  it("limits the collapsed mobile graph to essential now sources", () => {
    const initial = sourceIdsForVisibleGroups(new Set(["now"]));
    expect(initial).toEqual(
      expect.arrayContaining([
        "noaa-k-index",
        "noaa-solar-flux",
        "noaa-magnetometer",
        "noaa-xray",
        "swpc-scales",
        "swpc-alerts",
      ]),
    );
    expect(initial).not.toContain("nasa-cme");
    expect(initial).not.toContain("noaa-sunspots");
    expect(initial).not.toContain("swpc-solar-wind-plasma");
  });
});
