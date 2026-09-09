import type { SpotFeedMetadata, SpotWindowMinutes } from "@/lib/api/spotFeed";
export const MAP_SPOT_AGES = [15, 30, 60] as const;
export function normalizeMapSpotAge(value: number): SpotWindowMinutes {
  return MAP_SPOT_AGES.includes(value as SpotWindowMinutes) ? value as SpotWindowMinutes : 30;
}
export function spotWithinAge(time: Date, minutes: SpotWindowMinutes, now: number): boolean {
  const observed = time.getTime();
  return Number.isFinite(observed) && observed <= now && observed >= now - minutes * 60_000;
}
export function spotFeedState(
  metadata: SpotFeedMetadata | undefined,
  enabled: boolean,
  loading: boolean,
  error: boolean,
  now: number,
): string {
  if (!enabled) return "OFF";
  if (error) return metadata ? "STALE" : "UNAVAILABLE";
  if (!metadata) return loading ? "LOADING" : "NO DATA";
  if (metadata.status === "unknown") return "UNKNOWN";
  if (metadata.status === "stale") return "STALE";
  if (metadata.observedAt === null) return "NO REPORTS";
  if (metadata.staleAfterSeconds !== null && now - metadata.observedAt > metadata.staleAfterSeconds * 1000) return "STALE";
  return "CURRENT";
}
