import { describe, expect, it } from "vitest";
import type { DXSpot } from "@/types/dxcluster";
import { nearbySpots } from "./nearbySpots";

const AUSTIN = { lat: 30.27, lon: -97.74 };
const NOW = new Date("2026-06-21T12:00:00Z");

function spot(partial: Partial<DXSpot> & Pick<DXSpot, "id" | "dx">): DXSpot {
  return {
    spotter: "W1AW",
    frequency: 14074,
    comment: "",
    time: new Date("2026-06-21T11:50:00Z"),
    band: "20m",
    ...partial,
  };
}

describe("nearbySpots", () => {
  it("keeps spots inside the radius and drops spots without a locator", () => {
    const result = nearbySpots({
      targetLat: AUSTIN.lat,
      targetLon: AUSTIN.lon,
      radiusKm: 500,
      now: NOW,
      spotsFetchedAt: NOW.getTime(),
      spots: [
        spot({
          id: "near",
          dx: "W5ABC",
          dxLat: 30.4,
          dxLon: -97.6,
        }),
        spot({
          id: "far",
          dx: "JA1XYZ",
          dxLat: 35.68,
          dxLon: 139.76,
          band: "15m",
        }),
        spot({ id: "noloc", dx: "N0LOC" }),
      ],
    });
    expect(result.count).toBe(1);
    expect(result.hits[0].dx).toBe("W5ABC");
    expect(result.hits[0].distanceKm).toBeLessThan(50);
    expect(result.byBand["20m"]).toBe(1);
    expect(result.evidence.basis).toContain("500 km");
    expect(result.evidence.observedAt).toBe("2026-06-21T11:50:00.000Z");
  });

  it("narrows with the configured radius", () => {
    const close = spot({
      id: "close",
      dx: "K5AA",
      dxLat: 30.5,
      dxLon: -97.5,
    });
    const wide = nearbySpots({
      targetLat: AUSTIN.lat,
      targetLon: AUSTIN.lon,
      radiusKm: 2000,
      spots: [close],
    });
    const tight = nearbySpots({
      targetLat: AUSTIN.lat,
      targetLon: AUSTIN.lon,
      radiusKm: 10,
      spots: [close],
    });
    expect(wide.count).toBe(1);
    expect(tight.count).toBe(0);
  });

  it("accepts spot.time as an ISO string", () => {
    const result = nearbySpots({
      targetLat: AUSTIN.lat,
      targetLon: AUSTIN.lon,
      spots: [
        spot({
          id: "str",
          dx: "W5ZZ",
          dxLat: 30.3,
          dxLon: -97.7,
          time: "2026-06-21T11:40:00.000Z" as unknown as Date,
        }),
      ],
    });
    expect(result.hits[0].observedAt).toBe("2026-06-21T11:40:00.000Z");
  });

  it("resolves production spots from dxGrid and skips prefix/continent centroids", () => {
    const result = nearbySpots({
      targetLat: AUSTIN.lat,
      targetLon: AUSTIN.lon,
      radiusKm: 500,
      spots: [
        spot({ id: "grid", dx: "W5GRID", dxGrid: "EM10fp" }),
        spot({
          id: "approx",
          dx: "K1TEST",
          dxLat: 30.3,
          dxLon: -97.7,
          dxLocApprox: true,
          dxGrid: "EM10",
        }),
        spot({ id: "field", dx: "N0FLD", dxGrid: "EM" }),
        spot({ id: "ext", dx: "W5EXT", dxGrid: "EM10fp00" }),
      ],
    });
    expect(result.hits.map((hit) => hit.dx).sort()).toEqual(["W5EXT", "W5GRID"]);
    expect(result.count).toBe(2);
  });

  it("notes 4-char grid centre uncertainty in basis", () => {
    const result = nearbySpots({
      targetLat: AUSTIN.lat,
      targetLon: AUSTIN.lon,
      radiusKm: 250,
      spots: [spot({ id: "four", dx: "W5AA", dxGrid: "EM10" })],
    });
    expect(result.count).toBe(1);
    expect(result.evidence.basis).toMatch(/4-char locators use field centres/);
  });

  it("leaves observedAt null for unparseable spot times and excludes them from newest", () => {
    const result = nearbySpots({
      targetLat: AUSTIN.lat,
      targetLon: AUSTIN.lon,
      spotsObservedAt: Date.parse("2026-06-21T12:00:00Z"),
      spots: [
        spot({
          id: "bad",
          dx: "W5BAD",
          dxLat: 30.3,
          dxLon: -97.7,
          time: "not-a-date" as unknown as Date,
        }),
      ],
    });
    expect(result.hits[0].observedAt).toBeNull();
    expect(result.evidence.observedAt).toBe("2026-06-21T12:00:00.000Z");
  });
});
