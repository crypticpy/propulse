import type { BandLadderEntry } from "@/hooks/useBandVerdicts";
import type { CanonicalLadderRow } from "@/hooks/useBandLadder";

/**
 * Persisted ladder entries retain hysteresis across reloads, but the UI must
 * not call them live until the current input set is ready.
 */
export function readyBandHealthByBand(
  entries: BandLadderEntry[],
  ready: boolean,
): Map<string, BandLadderEntry> {
  if (!ready) return new Map();
  return new Map(entries.map((entry) => [entry.band, entry]));
}

/** Keep the collapsed and expanded headline indicators on the same ladder. */
export function bandHealthDotClass(entry: BandLadderEntry): string {
  if (entry.stable === "hot") return "bg-plasma-orange";
  if (entry.stable === "verified") return "bg-signal-green";
  if (entry.stable === "stirring") return "bg-caution-amber";
  return "bg-gray-500";
}

/**
 * Return the limiting observation time for the active canonical scope. Query
 * fetch time is not evidence freshness: an endpoint can successfully return
 * unchanged stored rows long after the collector stops updating them.
 */
export function canonicalScopeUpdatedAt(
  rows: Iterable<CanonicalLadderRow>,
  scopeType: CanonicalLadderRow["scopeType"],
  scopeKey: string,
): number | undefined {
  let oldest: number | undefined;
  for (const row of rows) {
    if (row.scopeType !== scopeType || row.scopeKey !== scopeKey) continue;
    const updatedAt = Date.parse(row.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) continue;
    oldest = oldest === undefined ? updatedAt : Math.min(oldest, updatedAt);
  }
  return oldest;
}
