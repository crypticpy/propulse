import type { LiveSpot } from "@/types/livespot";

export interface AzimuthalSpotPillScreenPlacement {
  spot: LiveSpot;
  left: number;
  top: number;
  width: number;
  height: number;
}

export type AzimuthalSpotEndpointScreenPlacement =
  AzimuthalSpotPillScreenPlacement;

interface ResolvedEndpointCandidate {
  dxLat: number;
  dxLon: number;
  originalSpot: LiveSpot;
}

interface EndpointPlacementOptions {
  canvasSize: number;
  center: number;
  displaySize: number;
  zoom: number;
  spotDotScale: number;
}

/**
 * Mirror every painted Azimuthal DX endpoint with a bounded screen-space hit
 * target. Pills are intentionally not involved: endpoints remain interactive
 * in trace-only mode, with labels hidden, and when label collision rejects a
 * callsign pill.
 */
export function buildAzimuthalSpotEndpointScreenPlacements(
  spots: readonly ResolvedEndpointCandidate[],
  projectToCanvas: (
    lat: number,
    lon: number,
  ) => { x: number; y: number } | null,
  options: EndpointPlacementOptions,
): AzimuthalSpotEndpointScreenPlacement[] {
  const { canvasSize, center, displaySize, zoom, spotDotScale } = options;
  const cssScale = displaySize / canvasSize;
  const paintedDiameter = 8 * spotDotScale * zoom * cssScale;
  const hitSize = Math.max(20, paintedDiameter + 8);

  return spots.flatMap((spot) => {
    const point = projectToCanvas(spot.dxLat, spot.dxLon);
    if (!point) return [];
    const x = (center + (point.x - center) * zoom) * cssScale;
    const y = (center + (point.y - center) * zoom) * cssScale;
    if (x < 0 || x > displaySize || y < 0 || y > displaySize) return [];
    return [
      {
        spot: spot.originalSpot,
        left: x - hitSize / 2,
        top: y - hitSize / 2,
        width: hitSize,
        height: hitSize,
      },
    ];
  });
}

export function spotDestinationMatchesTarget(
  spot: { dxLat?: number; dxLon?: number } | null | undefined,
  target: { lat: number; lon: number } | null | undefined,
): boolean {
  if (
    !spot ||
    !target ||
    !Number.isFinite(spot.dxLat) ||
    !Number.isFinite(spot.dxLon)
  ) {
    return false;
  }
  return (
    Math.abs(spot.dxLat! - target.lat) < 1e-6 &&
    Math.abs(spot.dxLon! - target.lon) < 1e-6
  );
}

export function resolveAzimuthalTargetAnnotation<TDifficulty>(
  selectedSpotHasVisibleTag: boolean,
  label: string | undefined,
  difficulty: TDifficulty | undefined,
): { label: string | undefined; difficulty: TDifficulty | undefined } {
  return selectedSpotHasVisibleTag
    ? { label: undefined, difficulty: undefined }
    : { label, difficulty };
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
