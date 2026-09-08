import type { ClusterWindowMinutes } from "@/lib/api/spotFeed";
import type { DXSpot } from "@/types/dxcluster";

/** Existing list controls include five minutes and the retained two-hour sample. */
export function clusterAgeMinutes(value?: number): number {
  if (value === 0) return 120;
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.min(value, 120) : 30;
}
export function clusterRequestWindow(value?: number): ClusterWindowMinutes {
  const age = clusterAgeMinutes(value);
  return age <= 15 ? 15 : age <= 30 ? 30 : age <= 60 ? 60 : 120;
}
export function clusterObservedAt(spots: readonly DXSpot[]): number | null {
  const values = spots.map(spot => new Date(spot.time).getTime()).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}
export function filterClusterAge(spots: readonly DXSpot[], age: number | undefined, now: number): DXSpot[] {
  const cutoff = now - clusterAgeMinutes(age) * 60_000;
  return spots.filter(spot => {
    const time = new Date(spot.time).getTime();
    return Number.isFinite(time) && time >= cutoff && time <= now;
  });
}
