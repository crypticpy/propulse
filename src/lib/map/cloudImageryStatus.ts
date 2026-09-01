export type CloudImageryStatus =
  | "loading"
  | "available"
  | "partial"
  | "unavailable";

/** Resolve renderer-observed tile results into a user-facing cloud status. */
export function resolveCloudImageryStatus(
  tileResults: readonly boolean[],
): CloudImageryStatus {
  const successfulTiles = tileResults.filter(Boolean).length;
  if (successfulTiles === 0) return "unavailable";
  if (successfulTiles < tileResults.length) return "partial";
  return "available";
}
