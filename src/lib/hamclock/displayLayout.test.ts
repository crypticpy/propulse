import { computeFlatMapLayout } from "@/components/map/lib/flatMapLayout";
import { expect, it } from "vitest";
import {
  hamClockProjectionContent,
  flatHomeRegion,
  globeRegionDistance,
  hamClockHomeRegion,
} from "./displayLayout";

it("frames the US region and fits globe distance to the available aspect ratio", () => {
  const region = hamClockHomeRegion(38.5, -92.5);
  // Denver, Buenos Aires, London, Cape Town, and the western Middle East.
  for (const [lat, lon] of [
    [39.74, -104.99],
    [-34.6, -58.4],
    [51.5, 0],
    [-34, 18.4],
    [31.8, 35.2],
  ]) {
    expect(Math.abs(lon - region.lon)).toBeLessThan(region.longitudeSpan / 2);
    expect(Math.abs(lat - region.lat)).toBeLessThan(region.latitudeSpan / 2);
  }
  expect(globeRegionDistance(region, 45, 0.8)).toBeGreaterThanOrEqual(
    globeRegionDistance(region, 45, 1.8),
  );
  expect(hamClockHomeRegion(51, 0).lon).toBe(0);
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

it("uses activity in AZ and restores the selected content in projections that support contacts", () => {
  for (const content of ["activity", "contacts", "both"] as const) {
    expect(hamClockProjectionContent("azimuthal", content)).toBe("activity");
    expect(hamClockProjectionContent("flat", content)).toBe(content);
    expect(hamClockProjectionContent("globe", content)).toBe(content);
  }
});
