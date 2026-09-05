import { computeFlatMapLayout } from "@/components/map/lib/flatMapLayout";
import { expect, it } from "vitest";
import {
  flatHomeRegion,
  globeRegionDistance,
  hamClockHomeRegion,
  hamClockPanelWidths,
} from "./displayLayout";

it("reserves map space on constrained displays and grows panels on roomy displays", () => {
  const compact = hamClockPanelWidths(1000, 1.375, true, true, true);
  expect(1000 - compact.info - compact.spots).toBeGreaterThanOrEqual(450);
  expect(hamClockPanelWidths(3840, 1.375, true, true, true)).toEqual({
    info: 358,
    spots: 426,
  });
  expect(hamClockPanelWidths(1000, 1.375, true, false, false)).toEqual({
    info: 0,
    spots: 0,
  });
});

it("frames the US region and fits globe distance to the available aspect ratio", () => {
  const region = hamClockHomeRegion(38.5, -92.5);
  expect(region.lon).toBe(-98);
  expect(region.longitudeSpan).toBeGreaterThan(59);
  expect(globeRegionDistance(region, 45, 0.8)).toBeGreaterThan(
    globeRegionDistance(region, 45, 1.8),
  );
  expect(hamClockHomeRegion(51, 0).lon).toBe(0);
});

it("keeps a usable center and visible sidebars with smart scaling disabled", () => {
  const panels = hamClockPanelWidths(1280, 2.5, false, true, true);
  expect(panels.info + panels.spots).toBeLessThanOrEqual(960);
  expect(panels.info).toBeGreaterThan(0);
  expect(panels.spots).toBeGreaterThan(0);
});

it("uses a complete world overview for both dateline edges in Flat while retaining globe centering", () => {
  for (const lon of [-179, 179]) {
    const region = hamClockHomeRegion(-17, lon);
    expect(region.lon).toBe(lon);
    expect(flatHomeRegion(region)).toEqual({
      lat: 0,
      lon: 0,
      latitudeSpan: 180,
      longitudeSpan: 360,
    });
    const layout = computeFlatMapLayout(900, 900, false, 2);
    expect(layout.viewport).toEqual(layout.map);
    expect(layout.map.width / layout.map.height).toBe(2);
  }
  const us = hamClockHomeRegion(39, -98);
  expect(flatHomeRegion(us)).toBe(us);
});
