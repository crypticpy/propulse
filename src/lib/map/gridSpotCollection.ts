import type { DXSpot } from "@/types/dxcluster";
import type { LiveSpot } from "@/types/livespot";
import {
  mergeGridSpots,
  type GridMatchableSpot,
} from "./gridTooltip";
import { normalizePresentableSpot } from "./spotPresentation";
import { latLonToGrid } from "@/lib/utils/grid";
import { getBandFromFrequency } from "@/lib/api/dxcluster";

export interface GridSpotCollection {
  grid: string;
  spots: LiveSpot[];
  tooltipSpots: DXSpot[];
}

/**
 * Resolves the exact membership shared by a highlighted grid's hover summary
 * and click collection. Live reports retain their richer source/signal fields;
 * DX-cluster-only reports receive the explicit Cluster source.
 */
export function collectGridSpots(
  grid: string,
  clusterSpots: readonly DXSpot[],
  liveSpots: readonly LiveSpot[],
  resolvedLiveSpots: readonly GridMatchableSpot[],
): GridSpotCollection {
  const normalizedGrid = grid.trim().toUpperCase();
  const precision = normalizedGrid.length >= 6 ? 6 : 4;
  const prefix = normalizedGrid.slice(0, precision);
  if (prefix.length < 4) {
    return { grid: prefix, spots: [], tooltipSpots: [] };
  }

  const clusterMatches = clusterSpots.filter((spot) => {
    const dxGrid = (spot.dxGrid || "").toUpperCase();
    const spotterGrid = (spot.spotterGrid || "").toUpperCase();
    return dxGrid.startsWith(prefix) || spotterGrid.startsWith(prefix);
  });
  const resolvedMatches: DXSpot[] = [];
  for (const spot of resolvedLiveSpots) {
    let dxGrid: string | undefined;
    let spotterGrid: string | undefined;
    try {
      if (!spot.dxLocApprox) {
        dxGrid = latLonToGrid(spot.dxLat, spot.dxLon, precision).toUpperCase();
      }
      if (!spot.spotterLocApprox) {
        spotterGrid = latLonToGrid(
          spot.spotterLat,
          spot.spotterLon,
          precision,
        ).toUpperCase();
      }
    } catch {
      continue;
    }
    if (dxGrid !== prefix && spotterGrid !== prefix) continue;
    resolvedMatches.push({
      id: spot.id,
      spotter: spot.spotter ?? "",
      spotterGrid,
      dx: spot.callsign,
      dxGrid,
      frequency: spot.frequency,
      mode: spot.mode,
      comment: "",
      time: spot.time,
      band: getBandFromFrequency(spot.frequency),
    });
  }
  const resolvedMatchIds = new Set(resolvedMatches.map((spot) => spot.id));
  const resolvedById = new Map(
    resolvedLiveSpots.map((spot) => [spot.id, spot]),
  );
  const members = new Map<string, LiveSpot>();

  for (const spot of clusterMatches) {
    members.set(spot.id, normalizePresentableSpot(spot));
  }
  for (const spot of liveSpots) {
    if (!resolvedMatchIds.has(spot.id)) continue;
    const resolved = resolvedById.get(spot.id);
    members.set(spot.id, {
      ...spot,
      ...(resolved
        ? {
            dxLat: resolved.dxLat,
            dxLon: resolved.dxLon,
            spotterLat: resolved.spotterLat,
            spotterLon: resolved.spotterLon,
            dxLocApprox: resolved.dxLocApprox,
            spotterLocApprox: resolved.spotterLocApprox,
          }
        : {}),
    });
  }

  return {
    grid: prefix,
    spots: [...members.values()],
    tooltipSpots: mergeGridSpots(clusterMatches, resolvedMatches),
  };
}
