import type { LiveSpot } from "@/types/livespot";

export interface AzimuthalSpotClusterCandidate {
  dxLat: number;
  dxLon: number;
  originalSpot: LiveSpot;
}

export interface AzimuthalSpotCluster {
  key: string;
  x: number;
  y: number;
  left: number;
  top: number;
  width: number;
  height: number;
  members: AzimuthalSpotClusterCandidate[];
}

interface AzimuthalSpotAggregationOptions {
  canvasSize: number;
  center: number;
  displaySize: number;
  zoom: number;
  cellSize?: number;
  hitSize?: number;
}

/**
 * Aggregate visible Azimuthal destinations in screen space. The projection
 * compresses the antipode into a narrow rim, so geographic clustering alone
 * does not prevent stacked controls there.
 */
export function buildAzimuthalSpotClusters(
  spots: readonly AzimuthalSpotClusterCandidate[],
  projectToCanvas: (
    lat: number,
    lon: number,
  ) => { x: number; y: number } | null,
  options: AzimuthalSpotAggregationOptions,
): AzimuthalSpotCluster[] {
  const {
    canvasSize,
    center,
    displaySize,
    zoom,
    cellSize = 32,
    hitSize = 28,
  } = options;
  const cssScale = displaySize / canvasSize;
  const projected: Array<{
    x: number;
    y: number;
    spot: AzimuthalSpotClusterCandidate;
  }> = [];

  for (const spot of spots) {
    const point = projectToCanvas(spot.dxLat, spot.dxLon);
    if (!point) continue;
    const x = (center + (point.x - center) * zoom) * cssScale;
    const y = (center + (point.y - center) * zoom) * cssScale;
    if (x < 0 || x > displaySize || y < 0 || y > displaySize) continue;

    projected.push({ x, y, spot });
  }

  const cells: Array<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    points: Array<{ x: number; y: number }>;
    members: AzimuthalSpotClusterCandidate[];
  }> = [];
  projected
    .sort(
      (a, b) =>
        a.x - b.x ||
        a.y - b.y ||
        a.spot.originalSpot.id.localeCompare(b.spot.originalSpot.id),
    )
    .forEach((point) => {
    // Keep every member within the visual aggregation radius of the proposed
    // center. This absorbs controls that would overlap after centering while
    // preventing a chain of nearby reports from spanning the projection.
    const viableCells = cells
      .map((candidate) => {
        const minX = Math.min(candidate.minX, point.x);
        const maxX = Math.max(candidate.maxX, point.x);
        const minY = Math.min(candidate.minY, point.y);
        const maxY = Math.max(candidate.maxY, point.y);
        const prospectiveX = (minX + maxX) / 2;
        const prospectiveY = (minY + maxY) / 2;
        const fits = [...candidate.points, point].every(
          (member) =>
            Math.hypot(
              member.x - prospectiveX,
              member.y - prospectiveY,
            ) <= cellSize,
        );
        return {
          candidate,
          fits,
          distance: Math.hypot(
            point.x - prospectiveX,
            point.y - prospectiveY,
          ),
        };
      })
      .filter(({ fits }) => fits)
      .sort((a, b) => a.distance - b.distance);
    const cell = viableCells[0]?.candidate;
    if (!cell) {
      cells.push({
        minX: point.x,
        maxX: point.x,
        minY: point.y,
        maxY: point.y,
        points: [{ x: point.x, y: point.y }],
        members: [point.spot],
      });
      return;
    }
    cell.minX = Math.min(cell.minX, point.x);
    cell.maxX = Math.max(cell.maxX, point.x);
    cell.minY = Math.min(cell.minY, point.y);
    cell.maxY = Math.max(cell.maxY, point.y);
    cell.points.push({ x: point.x, y: point.y });
    cell.members.push(point.spot);
  });

  const getCenter = (cell: (typeof cells)[number]) => ({
    x: (cell.minX + cell.maxX) / 2,
    y: (cell.minY + cell.maxY) / 2,
  });
  const getControlSize = (cell: (typeof cells)[number]) =>
    cell.members.length > 1 ? Math.max(30, hitSize) : hitSize;
  const overlaps = (
    a: (typeof cells)[number],
    b: (typeof cells)[number],
  ) => {
    const ac = getCenter(a);
    const bc = getCenter(b);
    const halfSize = (getControlSize(a) + getControlSize(b)) / 2;
    return (
      Math.abs(ac.x - bc.x) < halfSize &&
      Math.abs(ac.y - bc.y) < halfSize
    );
  };

  // Reconcile clusters whose rendered controls still collide. A slightly
  // wider radius is safe here because the controls already overlap; the cap
  // still prevents a long screen-space chain from collapsing into one pin.
  let didMerge = true;
  while (didMerge) {
    didMerge = false;
    mergeSearch: for (let aIndex = 0; aIndex < cells.length; aIndex += 1) {
      for (let bIndex = aIndex + 1; bIndex < cells.length; bIndex += 1) {
        const a = cells[aIndex];
        const b = cells[bIndex];
        if (!overlaps(a, b)) continue;
        const points = [...a.points, ...b.points];
        const minX = Math.min(a.minX, b.minX);
        const maxX = Math.max(a.maxX, b.maxX);
        const minY = Math.min(a.minY, b.minY);
        const maxY = Math.max(a.maxY, b.maxY);
        const x = (minX + maxX) / 2;
        const y = (minY + maxY) / 2;
        const radius = Math.max(
          ...points.map((point) => Math.hypot(point.x - x, point.y - y)),
        );
        if (radius > cellSize + hitSize / 2) continue;
        cells[aIndex] = {
          minX,
          maxX,
          minY,
          maxY,
          points,
          members: [...a.members, ...b.members],
        };
        cells.splice(bIndex, 1);
        didMerge = true;
        break mergeSearch;
      }
    }
  }

  const placed: AzimuthalSpotCluster[] = [];
  const placementOverlaps = (
    x: number,
    y: number,
    size: number,
    cluster: AzimuthalSpotCluster,
  ) =>
    Math.abs(x - cluster.x) < (size + cluster.width) / 2 &&
    Math.abs(y - cluster.y) < (size + cluster.height) / 2;

  for (const cell of cells) {
    const x = (cell.minX + cell.maxX) / 2;
    const y = (cell.minY + cell.maxY) / 2;
    const size = cell.members.length > 1 ? Math.max(30, hitSize) : hitSize;
    let placedX = x;
    let placedY = y;
    const collides = (candidateX: number, candidateY: number) =>
      placed.some((cluster) =>
        placementOverlaps(candidateX, candidateY, size, cluster),
      );
    if (collides(placedX, placedY)) {
      const half = size / 2;
      const angleCount = 24;
      let found = false;
      for (let radius = 4; radius <= displaySize && !found; radius += 4) {
        for (let angleIndex = 0; angleIndex < angleCount; angleIndex += 1) {
          const angle = (angleIndex / angleCount) * Math.PI * 2;
          const candidateX = x + Math.cos(angle) * radius;
          const candidateY = y + Math.sin(angle) * radius;
          if (
            candidateX < half ||
            candidateX > displaySize - half ||
            candidateY < half ||
            candidateY > displaySize - half ||
            collides(candidateX, candidateY)
          ) {
            continue;
          }
          placedX = candidateX;
          placedY = candidateY;
          found = true;
          break;
        }
      }
    }
    const first = cell.members[0].originalSpot;
    placed.push({
      key: `${first.source}:${first.id}`,
      x: placedX,
      y: placedY,
      left: placedX - size / 2,
      top: placedY - size / 2,
      width: size,
      height: size,
      members: cell.members,
    });
  }
  return placed;
}

export function limitAzimuthalBackgroundTraces<T>(
  spots: readonly T[],
  limit = 64,
): readonly T[] {
  return spots.length <= limit ? spots : spots.slice(0, limit);
}
