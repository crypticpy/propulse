import { clusterPayloadToSpot } from "@/lib/api/dxcluster";
import type { ClusterSpotPayload } from "@/types/bridge";
import type { DXSpot } from "@/types/dxcluster";
import { filterClusterAge } from "./clusterHistory";

export function readClusterBridgeSpot(payload: unknown, now: number): DXSpot | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  if (![row.id, row.dx, row.spotter].every(value => typeof value === "string" && value.trim().length > 0 && value.length <= 256) ||
    typeof row.frequency !== "number" || !Number.isFinite(row.frequency) || row.frequency <= 0 ||
    typeof row.time !== "string" || !Number.isFinite(Date.parse(row.time)) || Date.parse(row.time) > now ||
    [row.band, row.mode, row.dxGrid, row.spotterGrid].some(value => value !== undefined && typeof value !== "string")) return null;
  return clusterPayloadToSpot({ ...row, comment: typeof row.comment === "string" ? row.comment : "" } as unknown as ClusterSpotPayload);
}

/** Each bridge broadcast has one report ID shared by all connected observers. */
export function mergeClusterBridgeSpot(existing: readonly DXSpot[], incoming: DXSpot, maxAge: number | undefined, limit: number, now: number): DXSpot[] {
  const cap = Number.isFinite(limit) ? Math.max(10, Math.min(200, Math.floor(limit))) : 50;
  return filterClusterAge([incoming, ...existing.filter(spot => spot.id !== incoming.id)], maxAge, now)
    .sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0,cap);
}
