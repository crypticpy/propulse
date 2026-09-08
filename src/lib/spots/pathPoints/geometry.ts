/** Ground-hop sampling and decorative shell placement. Not scientific claims. */
import { getLongPathPoints, getPathPoints } from "@/lib/utils/path";
import type { LayerHeights } from "@/lib/utils/ionosphere";

/** Drawn apex is boosted so the globe arc meets the ionosphere shells. */
export const APEX_DISPLAY_HEIGHT_BOOST = 1.15;

/** Fixed D-layer drawing height; the ray-trace model does not emit a D height. */
export const D_LAYER_DISPLAY_HEIGHT_KM = 85;

export interface GroundPoint {
  lat: number;
  lon: number;
}

export type VisualShell = "D" | "E" | "F1" | "F2";

export interface DecorativeShellPlacement {
  displayHeightKm: number;
  /** Drawing-only nearest shell. Never copy this into PathPointDescriptor.layer. */
  visualShell: VisualShell;
}

/**
 * Evenly spaced great-circle samples including start and end.
 * N hops need N+1 ground points.
 */
export function computeGroundPoints(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  numHops: number,
  pathMode: "short" | "long",
): GroundPoint[] {
  if (numHops <= 0) return [];
  const totalSegments = numHops * 10;
  const pathPoints =
    pathMode === "long"
      ? getLongPathPoints(startLat, startLon, endLat, endLon, totalSegments)
      : getPathPoints(startLat, startLon, endLat, endLon, totalSegments);

  const groundPts: GroundPoint[] = [];
  for (let i = 0; i <= numHops; i++) {
    const fraction = i / numHops;
    const idx = Math.round(fraction * totalSegments);
    const clamped = Math.min(idx, pathPoints.length - 1);
    groundPts.push({
      lat: pathPoints[clamped].lat,
      lon: pathPoints[clamped].lon,
    });
  }
  return groundPts;
}

export function apexDisplayHeightKm(modeledHeightKm: number): number {
  return modeledHeightKm * APEX_DISPLAY_HEIGHT_BOOST;
}

/**
 * Choose the decorative shell height the globe marker sits on.
 * Classification is geometry decoration, not a modeled layer.
 */
export function decorativeShellPlacement(
  modeledHeightKm: number,
  layerHeights: LayerHeights,
): DecorativeShellPlacement {
  const eBoundary = (D_LAYER_DISPLAY_HEIGHT_KM + layerHeights.hmE) / 2;
  const f1Boundary = (layerHeights.hmE + layerHeights.hmF1) / 2;
  const f2Boundary = (layerHeights.hmF1 + layerHeights.hmF2) / 2;

  let visualShell: VisualShell;
  if (modeledHeightKm < eBoundary) visualShell = "D";
  else if (modeledHeightKm < f1Boundary) visualShell = "E";
  else if (modeledHeightKm < f2Boundary) visualShell = "F1";
  else visualShell = "F2";

  let displayHeightKm: number;
  switch (visualShell) {
    case "D":
      displayHeightKm = D_LAYER_DISPLAY_HEIGHT_KM;
      break;
    case "E":
      displayHeightKm = layerHeights.hmE;
      break;
    case "F1":
      displayHeightKm = layerHeights.hmF1;
      break;
    case "F2":
      displayHeightKm = layerHeights.hmF2;
      break;
  }

  return { displayHeightKm, visualShell };
}
