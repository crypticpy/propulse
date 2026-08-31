/**
 * Matching live spots to a hovered grid square.
 *
 * The grid-activity squares are lit from the live spot feed (PSKReporter /
 * RBN / WSJT-X), but the hover tooltip only ever filtered DX cluster spots by
 * their `dxGrid` / `spotterGrid` strings. Cluster spots usually carry no grid
 * at all, so hovering a square that was clearly lit reported "No active
 * spots". This resolves the live feed's lat/lon back to grid squares so the
 * tooltip describes the same activity that drew the highlight.
 */

import { latLonToGrid } from "@/lib/utils/grid";
import { getBandFromFrequency } from "@/lib/api/dxcluster";
import type { DXSpot } from "@/types/dxcluster";

/** The subset of a resolved live spot this module needs. */
export interface GridMatchableSpot {
  id: string;
  callsign: string;
  spotter?: string;
  frequency: number;
  mode: string;
  time: Date;
  dxLat: number;
  dxLon: number;
  spotterLat: number;
  spotterLon: number;
  /** True when the position is a callsign-prefix centroid, not a real locator */
  dxLocApprox: boolean;
  spotterLocApprox: boolean;
}

/** Grid square for a position, or null when the coordinates are unusable. */
function gridForPosition(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  try {
    return latLonToGrid(lat, lon, 4).toUpperCase();
  } catch {
    return null;
  }
}

/**
 * Live spots whose DX or spotter position falls inside the given grid.
 *
 * Positions derived from a callsign-prefix centroid are ignored, matching the
 * rule the activity overlay uses — a country centroid can sit in open ocean,
 * and it must not claim a square it never really occupied.
 *
 * @param spots - Resolved live spots
 * @param grid - Hovered grid locator; only its first 4 characters are used
 * @returns Cluster-shaped spots the tooltip can render
 */
export function liveSpotsInGrid(
  spots: readonly GridMatchableSpot[],
  grid: string,
): DXSpot[] {
  const target = grid.toUpperCase().slice(0, 4);
  if (target.length < 4) return [];

  const matched: DXSpot[] = [];

  for (const spot of spots) {
    const dxGrid = spot.dxLocApprox
      ? null
      : gridForPosition(spot.dxLat, spot.dxLon);
    const spotterGrid = spot.spotterLocApprox
      ? null
      : gridForPosition(spot.spotterLat, spot.spotterLon);

    if (dxGrid !== target && spotterGrid !== target) continue;

    matched.push({
      id: spot.id,
      spotter: spot.spotter ?? "",
      spotterGrid: spotterGrid ?? undefined,
      dx: spot.callsign,
      dxGrid: dxGrid ?? undefined,
      frequency: spot.frequency,
      mode: spot.mode,
      comment: "",
      time: spot.time,
      band: getBandFromFrequency(spot.frequency),
    });
  }

  return matched;
}

/**
 * Merge cluster and live spots for a grid, keeping one entry per spot id.
 * Cluster spots win on collision — they are the richer record.
 */
export function mergeGridSpots(
  clusterSpots: readonly DXSpot[],
  liveSpots: readonly DXSpot[],
): DXSpot[] {
  const seen = new Set(clusterSpots.map((spot) => spot.id));
  const merged: DXSpot[] = [...clusterSpots];

  for (const spot of liveSpots) {
    if (seen.has(spot.id)) continue;
    seen.add(spot.id);
    merged.push(spot);
  }

  return merged;
}
