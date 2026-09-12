import { describe, expect, it } from "vitest";
import type { ResolvedSpot } from "@/components/map/LiveSpotArcs";
import type { LiveSpot } from "@/types/livespot";
import { buildGridActivitySnapshot } from "@/lib/map/gridActivityModel";
import { gridToLatLon } from "@/lib/utils/grid";
import { getActivityStats } from "./gridUtils";

const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);

function coordinateOnlySpot(
  id: string,
  dxLat: number,
  dxLon: number,
): { resolved: ResolvedSpot; activitySpot: ReturnType<typeof toActivitySpot> } {
  const originalSpot: LiveSpot = {
    id,
    source: "RBN",
    spotter: "W1AAA",
    dx: "K0TEST",
    frequency: 14_074,
    mode: "FT8",
    comment: "",
    time: new Date(NOW - 10_000),
  };
  const resolved: ResolvedSpot = {
    id,
    spotterLat: 41.5,
    spotterLon: -73,
    dxLat,
    dxLon,
    mode: "FT8",
    frequency: 14_074,
    time: originalSpot.time,
    callsign: "K0TEST",
    spotter: "W1AAA",
    source: "RBN",
    spotterLocApprox: true,
    dxLocApprox: false,
    originalSpot,
  };
  return { resolved, activitySpot: toActivitySpot(resolved) };
}

function toActivitySpot(resolved: ResolvedSpot) {
  const spot = resolved.originalSpot;
  return {
    id: spot.id,
    spotter: resolved.spotter ?? spot.spotter,
    dx: resolved.callsign,
    frequency: resolved.frequency,
    mode: resolved.mode,
    comment: spot.comment ?? "",
    time: resolved.time,
    band: "20m",
    dxLat: resolved.dxLat,
    dxLon: resolved.dxLon,
    spotterLat: resolved.spotterLat,
    spotterLon: resolved.spotterLon,
    dxLocApprox: resolved.dxLocApprox,
    spotterLocApprox: resolved.spotterLocApprox,
  };
}

describe("getActivityStats", () => {
  it("counts a coordinate-only spot on both highlight and research stats", () => {
    const location = gridToLatLon("DM79");
    const { resolved, activitySpot } = coordinateOnlySpot(
      "coord-only",
      location.lat,
      location.lon,
    );

    const snapshot = buildGridActivitySnapshot([resolved], {
      resolution: 4,
      now: NOW,
    });
    const stats = getActivityStats([activitySpot], "DM79", { now: NOW });

    expect(snapshot.cellsByGrid.get("DM79")?.reportCount).toBe(1);
    expect(stats.total).toBe(1);
    expect(stats.recentCallsigns).toEqual(["K0TEST"]);
  });
});
