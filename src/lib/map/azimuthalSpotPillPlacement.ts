import type { LiveSpot } from "@/types/livespot";

export interface AzimuthalSpotPillScreenPlacement {
  spot: LiveSpot;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function sameAzimuthalSpotPillScreenPlacements(
  left: AzimuthalSpotPillScreenPlacement[],
  right: AzimuthalSpotPillScreenPlacement[],
): boolean {
  return (
    left.length === right.length &&
    left.every((placement, index) => {
      const candidate = right[index];
      return (
        candidate !== undefined &&
        placement.spot === candidate.spot &&
        placement.left === candidate.left &&
        placement.top === candidate.top &&
        placement.width === candidate.width &&
        placement.height === candidate.height
      );
    })
  );
}
