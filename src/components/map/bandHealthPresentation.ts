import type { BandLadderEntry } from "@/hooks/useBandVerdicts";

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
