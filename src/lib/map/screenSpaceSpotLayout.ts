/**
 * Projection-independent activity layout contracts shared by globe labels,
 * endpoint hit targets, activation pills, and aggregate beacons.
 *
 * Projection adapters own geographic visibility and convert each candidate to
 * viewport coordinates. This module owns deterministic collision decisions;
 * it intentionally has no React, Three.js, or map-projection dependency so the
 * same rules can be reused by flat and azimuthal renderers.
 */

export type SpotLayoutCandidateKind =
  | "dx-label"
  | "spotter-label"
  | "activation-label"
  | "endpoint";

export type SpotLayoutRole = "dx" | "spotter" | "activation";

export function spotLayoutReportId(source: string, id: string): string {
  return `${source}:${id}`;
}

export function spotLayoutCandidateId(
  reportId: string,
  role: SpotLayoutRole,
): string {
  return `${reportId}:${role}`;
}

export interface SpotLayoutCandidate<T> {
  /** Stable identity for this exact rendered activity surface. */
  id: string;
  /** Stable identity for the underlying report, shared by its two endpoints. */
  reportId: string;
  kind: SpotLayoutCandidateKind;
  lat: number;
  lon: number;
  width: number;
  height: number;
  selected?: boolean;
  watched?: boolean;
  activeBand?: boolean;
  observedAt?: number;
  /** Larger values win after semantic priority flags. */
  sourcePriority?: number;
  /** Paint-only metadata revision retained when membership is unchanged. */
  contentRevision?: string;
  payload: T;
}

export interface ProjectedSpotLayoutCandidate<T>
  extends SpotLayoutCandidate<T> {
  x: number;
  y: number;
  /** Normalized device depth. Values outside [-1, 1] are not viewable. */
  clipZ: number;
  /** False for globe-far-side and projection-invalid candidates. */
  visible: boolean;
}

export interface SpotLayoutPlacement<T> {
  candidate: ProjectedSpotLayoutCandidate<T>;
  offsetX: number;
  offsetY: number;
}

export interface SpotLayoutAggregate<T> {
  id: string;
  center: { lat: number; lon: number };
  screenCenter: { x: number; y: number };
  members: ProjectedSpotLayoutCandidate<T>[];
  memberReportIds: string[];
  count: number;
  primary: ProjectedSpotLayoutCandidate<T>;
  /** Bounded visual multiplier used by the shared aggregate beacon. */
  sizeScale: number;
}

export interface SpotLayoutResult<T> {
  placements: SpotLayoutPlacement<T>[];
  aggregates: SpotLayoutAggregate<T>[];
  rejectedIds: string[];
}

export interface SpotLayoutOptions {
  viewport: { width: number; height: number };
  viewportMarginPx?: number;
  collisionPaddingPx?: number;
  /** Minimum number of distinct reports required to create an aggregate. */
  minAggregateReportCount?: number;
  maxStackOffsetPx?: number;
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function semanticBoolean(value: boolean | undefined): number {
  return value ? 1 : 0;
}

/** Stable priority contract; lower comparator values render first. */
export function compareSpotLayoutCandidates<T>(
  left: SpotLayoutCandidate<T>,
  right: SpotLayoutCandidate<T>,
): number {
  const flags: Array<[number, number]> = [
    [semanticBoolean(right.selected), semanticBoolean(left.selected)],
    [semanticBoolean(right.watched), semanticBoolean(left.watched)],
    [semanticBoolean(right.activeBand), semanticBoolean(left.activeBand)],
  ];
  for (const [higher, lower] of flags) {
    const difference = higher - lower;
    if (difference !== 0) return difference;
  }

  const recency = (right.observedAt ?? 0) - (left.observedAt ?? 0);
  if (recency !== 0) return recency;
  const source =
    (right.sourcePriority ?? 0) - (left.sourcePriority ?? 0);
  if (source !== 0) return source;
  return left.id.localeCompare(right.id);
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function candidateBounds<T>(
  candidate: ProjectedSpotLayoutCandidate<T>,
  padding: number,
): Bounds {
  const halfWidth = candidate.width / 2 + padding;
  const halfHeight = candidate.height / 2 + padding;
  return {
    left: candidate.x - halfWidth,
    right: candidate.x + halfWidth,
    top: candidate.y - halfHeight,
    bottom: candidate.y + halfHeight,
  };
}

function boundsOverlap(left: Bounds, right: Bounds): boolean {
  return !(
    left.right < right.left ||
    right.right < left.left ||
    left.bottom < right.top ||
    right.bottom < left.top
  );
}

function translatedBounds(bounds: Bounds, offsetY: number): Bounds {
  return {
    left: bounds.left,
    right: bounds.right,
    top: bounds.top + offsetY,
    bottom: bounds.bottom + offsetY,
  };
}

function boundsCellKeys(bounds: Bounds, cellSize: number): string[] {
  const keys: string[] = [];
  const minX = Math.floor(bounds.left / cellSize);
  const maxX = Math.floor(bounds.right / cellSize);
  const minY = Math.floor(bounds.top / cellSize);
  const maxY = Math.floor(bounds.bottom / cellSize);
  for (let cellX = minX; cellX <= maxX; cellX += 1) {
    for (let cellY = minY; cellY <= maxY; cellY += 1) {
      keys.push(`${cellX},${cellY}`);
    }
  }
  return keys;
}

function normalizeLongitude(lon: number): number {
  let normalized = lon;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

function geographicCenter<T>(
  candidates: readonly ProjectedSpotLayoutCandidate<T>[],
): { lat: number; lon: number } {
  let latitude = 0;
  let longitudeX = 0;
  let longitudeY = 0;
  for (const candidate of candidates) {
    latitude += candidate.lat;
    const radians = (candidate.lon * Math.PI) / 180;
    longitudeX += Math.cos(radians);
    longitudeY += Math.sin(radians);
  }

  const vectorLength = Math.hypot(longitudeX, longitudeY);
  const lon =
    vectorLength < 1e-12
      ? normalizeLongitude(
          candidates.reduce((sum, candidate) => sum + candidate.lon, 0) /
            candidates.length,
        )
      : (Math.atan2(longitudeY, longitudeX) * 180) / Math.PI;
  return { lat: latitude / candidates.length, lon: normalizeLongitude(lon) };
}

function stableAggregateId(ids: readonly string[]): string {
  // FNV-1a keeps keys compact while retaining exact membership stability.
  const input = [...ids].sort().join("|");
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `spot-layout-${(hash >>> 0).toString(36)}`;
}

export function aggregateBeaconScale(count: number): number {
  const safeCount = Math.max(1, Number.isFinite(count) ? count : 1);
  return Math.min(2.25, 1 + Math.log2(safeCount) * 0.18);
}

function isViewportCandidate<T>(
  candidate: ProjectedSpotLayoutCandidate<T>,
  viewport: SpotLayoutOptions["viewport"],
  margin: number,
): boolean {
  return (
    candidate.visible &&
    finite(candidate.lat) &&
    finite(candidate.lon) &&
    candidate.lat >= -90 &&
    candidate.lat <= 90 &&
    candidate.lon >= -180 &&
    candidate.lon <= 180 &&
    finite(candidate.x) &&
    finite(candidate.y) &&
    finite(candidate.clipZ) &&
    candidate.clipZ >= -1 &&
    candidate.clipZ <= 1 &&
    finite(candidate.width) &&
    finite(candidate.height) &&
    candidate.width > 0 &&
    candidate.height > 0 &&
    candidate.x >= -margin &&
    candidate.x <= viewport.width + margin &&
    candidate.y >= -margin &&
    candidate.y <= viewport.height + margin
  );
}

/**
 * Layout already-projected activity candidates with a spatial hash. A
 * collision component becomes an aggregate only after it contains the
 * configured number of distinct reports. Smaller components receive bounded
 * offsets; endpoint surfaces that cannot actually consume an offset yield to
 * the higher-priority owner so no hidden member remains interactive.
 */
export function layoutProjectedSpotCandidates<T>(
  input: readonly ProjectedSpotLayoutCandidate<T>[],
  options: SpotLayoutOptions,
): SpotLayoutResult<T> {
  const margin = Math.max(0, options.viewportMarginPx ?? 64);
  const padding = Math.max(0, options.collisionPaddingPx ?? 6);
  const minAggregateReportCount = Math.max(
    1,
    Math.floor(options.minAggregateReportCount ?? 3),
  );
  const maxStackOffset = Math.max(0, options.maxStackOffsetPx ?? 36);
  // An "unbounded" fan preference still needs a finite search surface. A
  // viewport-height traversal is enough to find every visible vertical slot
  // without creating an unbounded spatial-hash loop.
  const effectiveMaxStackOffset = Math.min(
    maxStackOffset,
    options.viewport.height + margin * 2,
  );
  const sortedCandidates = input
    .filter((candidate) =>
      isViewportCandidate(candidate, options.viewport, margin),
    )
    .sort(compareSpotLayoutCandidates);
  // Candidate IDs identify concrete surfaces. Defensive de-duplication keeps a
  // malformed refresh from producing two independently interactive owners for
  // what the rest of the system treats as one label or endpoint.
  const candidateIds = new Set<string>();
  const candidates = sortedCandidates.filter((candidate) => {
    if (candidateIds.has(candidate.id)) return false;
    candidateIds.add(candidate.id);
    return true;
  });
  const acceptedIds = new Set(candidates.map((candidate) => candidate.id));
  const rejectedIds = input
    .filter((candidate) => !acceptedIds.has(candidate.id))
    .map((candidate) => candidate.id)
    .sort();

  if (candidates.length === 0) {
    return { placements: [], aggregates: [], rejectedIds };
  }

  const parent = candidates.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const unite = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  // Insert bounds into every touched cell. This catches long labels straddling
  // cell edges without falling back to an O(n²) all-pairs pass.
  const cellSize = 96;
  const cells = new Map<string, number[]>();
  const bounds = candidates.map((candidate) =>
    candidateBounds(candidate, padding),
  );
  bounds.forEach((candidateBoundsValue, index) => {
    const compared = new Set<number>();
    for (const key of boundsCellKeys(candidateBoundsValue, cellSize)) {
      for (const neighbor of cells.get(key) ?? []) {
        if (compared.has(neighbor)) continue;
        compared.add(neighbor);
        if (boundsOverlap(candidateBoundsValue, bounds[neighbor])) {
          unite(index, neighbor);
        }
      }
      const bucket = cells.get(key);
      if (bucket) bucket.push(index);
      else cells.set(key, [index]);
    }
  });

  const groups = new Map<number, ProjectedSpotLayoutCandidate<T>[]>();
  candidates.forEach((candidate, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group) group.push(candidate);
    else groups.set(root, [candidate]);
  });

  const candidateIndexById = new Map(
    candidates.map((candidate, index) => [candidate.id, index] as const),
  );
  const resolvedCandidateIds = new Set<string>();
  const placedBounds = new Map<string, Array<{ id: string; bounds: Bounds }>>();
  const insertPlacedBounds = (id: string, value: Bounds) => {
    for (const key of boundsCellKeys(value, cellSize)) {
      const bucket = placedBounds.get(key);
      const entry = { id, bounds: value };
      if (bucket) bucket.push(entry);
      else placedBounds.set(key, [entry]);
    }
  };
  const nearbyReservations = (root: number, searchBounds: Bounds): Bounds[] => {
    const reservations: Bounds[] = [];
    const seenOriginal = new Set<number>();
    const seenPlaced = new Set<string>();
    for (const key of boundsCellKeys(searchBounds, cellSize)) {
      for (const neighbor of cells.get(key) ?? []) {
        if (
          seenOriginal.has(neighbor) ||
          find(neighbor) === root ||
          resolvedCandidateIds.has(candidates[neighbor].id)
        ) {
          continue;
        }
        seenOriginal.add(neighbor);
        reservations.push(bounds[neighbor]);
      }
      for (const entry of placedBounds.get(key) ?? []) {
        if (seenPlaced.has(entry.id)) continue;
        seenPlaced.add(entry.id);
        reservations.push(entry.bounds);
      }
    }
    return reservations;
  };

  const placements: SpotLayoutPlacement<T>[] = [];
  const aggregates: SpotLayoutAggregate<T>[] = [];
  for (const unsortedGroup of groups.values()) {
    const group = [...unsortedGroup].sort(compareSpotLayoutCandidates);
    const reportIds = [...new Set(group.map((candidate) => candidate.reportId))]
      .sort();
    if (group.length > 1 && reportIds.length >= minAggregateReportCount) {
      const center = geographicCenter(group);
      const screenCenter = {
        x: group.reduce((sum, candidate) => sum + candidate.x, 0) / group.length,
        y: group.reduce((sum, candidate) => sum + candidate.y, 0) / group.length,
      };
      const sizeScale = aggregateBeaconScale(reportIds.length);
      const id = stableAggregateId(group.map((candidate) => candidate.id));
      aggregates.push({
        id,
        center,
        screenCenter,
        members: group,
        memberReportIds: reportIds,
        count: reportIds.length,
        primary: group[0],
        sizeScale,
      });
      // Reserve the actual beacon footprint for later components. Its members
      // no longer reserve their individual label/endpoint rectangles.
      group.forEach((candidate) => resolvedCandidateIds.add(candidate.id));
      const aggregateRadius = 22 * sizeScale + padding;
      insertPlacedBounds(id, {
        left: screenCenter.x - aggregateRadius,
        right: screenCenter.x + aggregateRadius,
        top: screenCenter.y - aggregateRadius,
        bottom: screenCenter.y + aggregateRadius,
      });
      continue;
    }

    for (const candidate of group) {
      const candidateIndex = candidateIndexById.get(candidate.id);
      if (candidateIndex === undefined) continue;
      const baseBounds = bounds[candidateIndex];
      const searchBounds = {
        left: baseBounds.left,
        right: baseBounds.right,
        top: baseBounds.top - effectiveMaxStackOffset,
        bottom: baseBounds.bottom + effectiveMaxStackOffset,
      };
      const reservations = nearbyReservations(find(candidateIndex), searchBounds);
      const offsetCandidates = new Set<number>([0]);

      // Labels can consume a screen-space offset; geographic endpoint meshes
      // cannot. For labels, every reservation contributes the two exact
      // boundary offsets that place this candidate immediately above/below it.
      if (candidate.kind !== "endpoint") {
        for (const reservation of reservations) {
          const below = reservation.bottom + 1 - baseBounds.top;
          const above = reservation.top - 1 - baseBounds.bottom;
          if (Math.abs(below) <= effectiveMaxStackOffset) {
            offsetCandidates.add(below);
          }
          if (Math.abs(above) <= effectiveMaxStackOffset) {
            offsetCandidates.add(above);
          }
        }
      }

      const orderedOffsets = [...offsetCandidates].sort((left, right) => {
        const magnitude = Math.abs(left) - Math.abs(right);
        if (magnitude !== 0) return magnitude;
        // Prefer the traditional downward fan when both directions fit.
        return right - left;
      });
      const offsetY = orderedOffsets.find((offset) => {
        const translated = translatedBounds(baseBounds, offset);
        const centerY = candidate.y + offset;
        return (
          centerY >= -margin &&
          centerY <= options.viewport.height + margin &&
          !reservations.some((reservation) =>
            boundsOverlap(translated, reservation),
          )
        );
      });

      resolvedCandidateIds.add(candidate.id);
      if (offsetY === undefined) {
        // A sub-threshold collision must not masquerade as a valid aggregate.
        // Suppress its lower-priority surface instead; consumers derive all hit
        // ownership from placements, so it cannot blink beneath the winner.
        rejectedIds.push(candidate.id);
        continue;
      }
      const placement = { candidate, offsetX: 0, offsetY };
      placements.push(placement);
      insertPlacedBounds(candidate.id, translatedBounds(baseBounds, offsetY));
    }
  }

  placements.sort((left, right) =>
    left.candidate.id.localeCompare(right.candidate.id),
  );
  aggregates.sort((left, right) => left.id.localeCompare(right.id));
  rejectedIds.sort();
  return { placements, aggregates, rejectedIds };
}

/** Avoid a React update when camera motion did not change layout membership. */
export function spotLayoutSignature<T>(result: SpotLayoutResult<T>): string {
  const placements = result.placements
    .map(
      ({ candidate, offsetX, offsetY }) =>
        `${candidate.id}@${offsetX.toFixed(1)},${offsetY.toFixed(1)}:${candidate.kind}:${candidate.width.toFixed(1)}x${candidate.height.toFixed(1)}:${candidate.lat.toFixed(5)},${candidate.lon.toFixed(5)}:${candidate.selected ? 1 : 0}${candidate.watched ? 1 : 0}${candidate.activeBand ? 1 : 0}:${candidate.observedAt ?? 0}:${candidate.contentRevision ?? ""}`,
    )
    .join("|");
  const aggregates = result.aggregates
    .map(
      (aggregate) =>
        `${aggregate.id}@${aggregate.center.lat.toFixed(5)},${aggregate.center.lon.toFixed(5)}[${aggregate.members.map((member) => `${member.id}:${member.kind}:${member.width.toFixed(1)}x${member.height.toFixed(1)}:${member.observedAt ?? 0}:${member.contentRevision ?? ""}`).join(",")}]`,
    )
    .join("|");
  return `${placements}::${aggregates}`;
}
