import { describe, expect, it } from "vitest";
import type { DXSpot } from "@/types/dxcluster";
import type { LiveSpot } from "@/types/livespot";
import { collectGridSpots } from "./gridSpotCollection";
import { gridToLatLon } from "@/lib/utils/grid";

const clusterSpot: DXSpot = {
  id: "cluster-1",
  spotter: "W1AW",
  dx: "K0ABC",
  dxGrid: "DM79AA",
  frequency: 14074,
  mode: "FT8",
  comment: "CQ",
  time: new Date("2026-08-31T12:00:00Z"),
};

const liveSpot: LiveSpot = {
  id: "live-1",
  spotter: "N0CALL",
  dx: "K0POTA",
  frequency: 7030,
  mode: "CW",
  comment: "POTA US-1234",
  time: new Date("2026-08-31T12:01:00Z"),
  source: "RBN",
  snr: 18,
};

describe("collectGridSpots", () => {
  it("uses one membership set for hover and click while preserving live metadata", () => {
    const collection = collectGridSpots(
      "DM79",
      [clusterSpot],
      [liveSpot],
      [
        {
          id: "live-1",
          callsign: "K0POTA",
          spotter: "N0CALL",
          frequency: 7030,
          mode: "CW",
          time: liveSpot.time,
          dxLat: 39.5,
          dxLon: -104.5,
          spotterLat: 39.6,
          spotterLon: -104.6,
          dxLocApprox: false,
          spotterLocApprox: false,
        },
      ],
    );

    expect(collection.grid).toBe("DM79");
    expect(collection.spots).toHaveLength(2);
    expect(collection.tooltipSpots).toHaveLength(2);
    expect(collection.spots.find((spot) => spot.id === "live-1")).toMatchObject({
      source: "RBN",
      snr: 18,
      dxLat: 39.5,
      comment: "POTA US-1234",
    });
    expect(collection.spots.find((spot) => spot.id === "cluster-1")?.source).toBe(
      "Cluster",
    );
  });

  it("does not assign approximate live positions to highlighted grids", () => {
    const collection = collectGridSpots("DM79", [], [liveSpot], [
      {
        id: "live-1",
        callsign: "K0POTA",
        spotter: "N0CALL",
        frequency: 7030,
        mode: "CW",
        time: liveSpot.time,
        dxLat: 39.5,
        dxLon: -104.5,
        spotterLat: 39.6,
        spotterLon: -104.6,
        dxLocApprox: true,
        spotterLocApprox: true,
      },
    ]);

    expect(collection.spots).toEqual([]);
    expect(collection.tooltipSpots).toEqual([]);
  });

  it("honors a six-character highlighted subsquare", () => {
    const matching = { ...liveSpot, id: "matching" };
    const nearby = { ...liveSpot, id: "nearby", dx: "K0NEAR" };
    const matchingLocation = gridToLatLon("DM79GG");
    const nearbyLocation = gridToLatLon("DM79HH");
    const collection = collectGridSpots("DM79GG", [], [matching, nearby], [
      {
        id: "matching",
        callsign: matching.dx,
        frequency: matching.frequency,
        mode: "CW",
        time: matching.time,
        dxLat: matchingLocation.lat,
        dxLon: matchingLocation.lon,
        spotterLat: 0,
        spotterLon: 0,
        dxLocApprox: false,
        spotterLocApprox: true,
      },
      {
        id: "nearby",
        callsign: nearby.dx,
        frequency: nearby.frequency,
        mode: "CW",
        time: nearby.time,
        dxLat: nearbyLocation.lat,
        dxLon: nearbyLocation.lon,
        spotterLat: 0,
        spotterLon: 0,
        dxLocApprox: false,
        spotterLocApprox: true,
      },
    ]);

    expect(collection.grid).toBe("DM79GG");
    expect(collection.spots.map((spot) => spot.id)).toEqual(["matching"]);
  });

  it("normalizes whitespace and case from a selected grid label", () => {
    const collection = collectGridSpots("  dm79  ", [clusterSpot], [], []);

    expect(collection.grid).toBe("DM79");
    expect(collection.spots.map((spot) => spot.id)).toEqual(["cluster-1"]);
  });
});
