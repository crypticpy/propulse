import type { PathMode } from "@/stores/mapStore";
import type { RayTraceResult } from "@/lib/utils/rayTrace";

export type PathLeg = "short" | "long";
export type { PathMode };

export function pathModesToRender(pathMode: PathMode): PathLeg[] {
  if (pathMode === "both") return ["short", "long"];
  return [pathMode];
}

export function cyclePathMode(pathMode: PathMode): PathMode {
  if (pathMode === "short") return "long";
  if (pathMode === "long") return "both";
  return "short";
}

export function shouldHideOtherPaths(
  isolateTargetPath: boolean,
  hasTarget: boolean,
): boolean {
  return isolateTargetPath && hasTarget;
}

export function hopQualityColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#eab308";
  if (score >= 35) return "#f97316";
  return "#ef4444";
}

export interface BounceMarker {
  lat: number;
  lon: number;
  color: string;
  qualityScore: number;
  hopIndex: number;
}

export function bounceMarkersFromResult(
  result: RayTraceResult | null,
): BounceMarker[] {
  if (!result) return [];
  return result.hops.map((hop, hopIndex) => ({
    lat: hop.reflectionPoint.lat,
    lon: hop.reflectionPoint.lon,
    color: hopQualityColor(hop.qualityScore),
    qualityScore: hop.qualityScore,
    hopIndex,
  }));
}

export function pathEmphasis(
  pathMode: PathMode,
  leg: PathLeg,
): "primary" | "secondary" {
  if (pathMode === "both" && leg === "long") return "secondary";
  return "primary";
}

export function resolveTraceFrequencyMHz(
  activeFrequencyHz: number,
  selectedSpotFrequencyKhz?: number | null,
  selectedSpotMatchesTarget = false,
): number {
  if (
    selectedSpotMatchesTarget &&
    typeof selectedSpotFrequencyKhz === "number" &&
    Number.isFinite(selectedSpotFrequencyKhz) &&
    selectedSpotFrequencyKhz > 0
  ) {
    return selectedSpotFrequencyKhz / 1000;
  }
  if (Number.isFinite(activeFrequencyHz) && activeFrequencyHz > 1_000) {
    return activeFrequencyHz / 1e6;
  }
  return 14.074;
}
