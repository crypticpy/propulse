import { clusterPayloadToSpot } from "@/lib/api/dxcluster";
import type { ClusterSpotPayload } from "@/types/bridge";
import type { DXSpot } from "@/types/dxcluster";

/** The bridge and cluster daemon both accept minute-resolution clock skew. */
export const CLUSTER_BRIDGE_FUTURE_TOLERANCE_MS = 60_000;

function spotMillis(spot: DXSpot): number {
  return spot.time instanceof Date ? spot.time.getTime() : Date.parse(spot.time);
}

export function filterBridgeSpotAge(
  spots: readonly DXSpot[],
  maxAgeMinutes: number | undefined,
  now: number,
): DXSpot[] {
  const cutoff = Number.isFinite(maxAgeMinutes) && maxAgeMinutes! > 0
    ? now - maxAgeMinutes! * 60_000
    : Number.NEGATIVE_INFINITY;
  return spots.filter((spot) => {
    const observedAt = spotMillis(spot);
    return Number.isFinite(observedAt) && observedAt >= cutoff &&
      observedAt <= now + CLUSTER_BRIDGE_FUTURE_TOLERANCE_MS;
  });
}

export function readClusterBridgeSpot(payload: unknown, now: number): DXSpot | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const requiredText = [row.id, row.dx, row.spotter];
  const optionalText = [row.band, row.mode, row.dxGrid, row.spotterGrid];
  const observedAt = typeof row.time === "string" ? Date.parse(row.time) : Number.NaN;
  if (!requiredText.every((value) => typeof value === "string" && value.trim().length > 0 && value.length <= 256) ||
      optionalText.some((value) => value !== undefined && (typeof value !== "string" || value.length > 256)) ||
      (row.comment !== undefined && (typeof row.comment !== "string" || row.comment.length > 2_048)) ||
      typeof row.frequency !== "number" || !Number.isFinite(row.frequency) || row.frequency <= 0 ||
      !Number.isFinite(observedAt) || observedAt > now + CLUSTER_BRIDGE_FUTURE_TOLERANCE_MS) return null;
  return clusterPayloadToSpot({
    ...row,
    comment: typeof row.comment === "string" ? row.comment : "",
  } as unknown as ClusterSpotPayload);
}

/** Atomically merge a broadcast into the reusable shared source snapshot. */
export function mergeClusterBridgeSpot(
  existing: readonly DXSpot[],
  incoming: DXSpot,
  maxAgeMinutes: number | undefined,
  limit: number,
  now: number,
): DXSpot[] {
  const cap = Number.isFinite(limit)
    ? Math.max(10, Math.min(200, Math.floor(limit)))
    : 50;
  return filterBridgeSpotAge(
    [incoming, ...existing.filter((spot) => spot.id !== incoming.id)],
    maxAgeMinutes,
    now,
  ).sort((a, b) => spotMillis(b) - spotMillis(a)).slice(0, cap);
}
