import { expect, it } from "vitest";
import {
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
