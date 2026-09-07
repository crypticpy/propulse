import { describe, expect, it } from "vitest";
import { createSpotFixtures, createSpotInput } from "@/lib/views/fixtures";
import { resolveSpotLocation, usPrefixCentroid } from "./location";

describe("location provenance", () => {
  it("keeps US prefix centroids approximate and not reported Kansas coordinates", () => {
    const fixtures = createSpotFixtures();
    const prefixOnly = fixtures.us.find((spot) => spot.id === "us-prefix-only")!;
    const approximate = fixtures.us.find((spot) => spot.id === "us-approximate")!;
    const colorado = fixtures.us.find((spot) => spot.id === "us-colorado")!;

    const prefixLocation = resolveSpotLocation({
      callsign: prefixOnly.dx,
      lat: prefixOnly.dxLat,
      lon: prefixOnly.dxLon,
      locApprox: prefixOnly.dxLocApprox,
    });
    expect(prefixLocation).toMatchObject({
      kind: "approximate",
      source: "prefix",
      precision: "country",
      region: { countryCode: "US", kind: "country" },
      coordinates: usPrefixCentroid(),
    });
    expect(prefixLocation.kind === "approximate" && prefixLocation.reason).not.toMatch(/Kansas/i);

    const flagged = resolveSpotLocation({
      callsign: approximate.dx,
      lat: approximate.dxLat,
      lon: approximate.dxLon,
      locApprox: true,
    });
    expect(flagged.kind).toBe("approximate");
    if (flagged.kind === "approximate") {
      expect(flagged.coordinates).toEqual(usPrefixCentroid());
    }

    const precise = resolveSpotLocation({
      callsign: colorado.dx,
      lat: colorado.dxLat,
      lon: colorado.dxLon,
    });
    expect(precise).toEqual({
      kind: "reported-coordinate",
      coordinates: { lat: 39.74, lon: -104.99 },
    });
  });

  it("does not upgrade prefix-populated coordinates just because they are numeric", () => {
    const location = resolveSpotLocation({
      callsign: "W1TEST",
      lat: 39.8,
      lon: -98.6,
    });
    expect(location.kind).toBe("approximate");
    if (location.kind === "approximate") {
      expect(location.region?.countryCode).toBe("US");
    }
  });

  it("preserves Maidenhead precision and leaves unlocated reports without invented coordinates", () => {
    const fixtures = createSpotFixtures();
    const grid = fixtures.edges.find((spot) => spot.id === "grid-only")!;
    const coarse = fixtures.edges.find((spot) => spot.id === "coarse-grid")!;
    const missing = fixtures.edges.find((spot) => spot.id === "unlocated")!;
    expect(resolveSpotLocation({
      callsign: grid.dx, lat: grid.dxLat, lon: grid.dxLon, grid: grid.dxGrid,
    })).toMatchObject({ kind: "reported-grid", grid: "IN80" });
    expect(resolveSpotLocation({
      callsign: coarse.dx, lat: coarse.dxLat, lon: coarse.dxLon, grid: coarse.dxGrid,
    })).toMatchObject({ kind: "reported-grid", grid: "IN" });
    expect(resolveSpotLocation({
      callsign: missing.dx, lat: missing.dxLat, lon: missing.dxLon,
    })).toMatchObject({ kind: "unavailable" });
  });

  it("treats exact zero as a reported coordinate", () => {
    const spot = createSpotInput("zero", { dxLat: 0, dxLon: 0 });
    expect(resolveSpotLocation({
      callsign: spot.dx, lat: spot.dxLat, lon: spot.dxLon,
    })).toEqual({ kind: "reported-coordinate", coordinates: { lat: 0, lon: 0 } });
  });
});
