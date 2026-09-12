import { describe, expect, it } from "vitest";
import {
  ISS_NORAD_ID,
  filterGlobeVisibleSatellites,
  isHiddenByIssTracker,
} from "./satellite";
import type { SatelliteInfo } from "@/types/satellite";

function mockSat(noradId: number): SatelliteInfo {
  return {
    name: `SAT-${noradId}`,
    line1: "",
    line2: "",
    noradId,
    position: { lat: 0, lon: 0, alt: 400, velocity: 7 },
    isVisible: true,
    category: noradId === ISS_NORAD_ID ? "iss" : "fm",
  };
}

describe("filterGlobeVisibleSatellites", () => {
  const universe = [mockSat(ISS_NORAD_ID), mockSat(43770), mockSat(25544 + 1)];

  it("returns every satellite when tracking all and ISS tracker is off", () => {
    expect(
      filterGlobeVisibleSatellites(universe, {
        issTrackerActive: false,
        trackedNoradIds: "all",
      }),
    ).toEqual(universe);
  });

  it("drops ISS when the dedicated ISS tracker layer is active", () => {
    const visible = filterGlobeVisibleSatellites(universe, {
      issTrackerActive: true,
      trackedNoradIds: "all",
    });

    expect(visible.map((sat) => sat.noradId)).toEqual([43770, 25545]);
  });

  it("keeps only tracked NORAD IDs when prefs are customized", () => {
    const visible = filterGlobeVisibleSatellites(universe, {
      issTrackerActive: false,
      trackedNoradIds: [43770],
    });

    expect(visible).toEqual([mockSat(43770)]);
  });

  it("applies ISS and tracking filters together", () => {
    const visible = filterGlobeVisibleSatellites(universe, {
      issTrackerActive: true,
      trackedNoradIds: [ISS_NORAD_ID, 43770],
    });

    expect(visible).toEqual([mockSat(43770)]);
  });
});

describe("isHiddenByIssTracker", () => {
  it("flags ISS only while the ISS tracker layer is active", () => {
    expect(isHiddenByIssTracker(ISS_NORAD_ID, true)).toBe(true);
    expect(isHiddenByIssTracker(ISS_NORAD_ID, false)).toBe(false);
    expect(isHiddenByIssTracker(43770, true)).toBe(false);
  });
});
