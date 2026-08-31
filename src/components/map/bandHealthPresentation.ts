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
