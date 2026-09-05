import { canonicalKey, type CanonicalLadderRow } from "@/hooks/useBandLadder";
import type { ActiveScope, BandLadderEntry } from "@/hooks/useBandVerdicts";
import { LADDER_RANK } from "@/lib/verdict/ladder";

/** Select the strongest live band, breaking equal ladder states with the
 * observation and reporter evidence already used by the detail dialog.
 * Shared by the desk hero and the wall Best Band tile so both agree. */
export function selectBestBand(
  entries: BandLadderEntry[],
): BandLadderEntry | null {
  return entries.reduce<BandLadderEntry | null>((best, entry) => {
    if (!best) return entry;
    const rankDelta = LADDER_RANK[entry.stable] - LADDER_RANK[best.stable];
    if (rankDelta !== 0) return rankDelta > 0 ? entry : best;
    const observationDelta =
      entry.result.inputs.obs20m - best.result.inputs.obs20m;
    if (observationDelta !== 0) return observationDelta > 0 ? entry : best;
    return entry.result.inputs.reporters20m > best.result.inputs.reporters20m
      ? entry
      : best;
  }, null);
}

/** Resolve the canonical ladder row backing a band inside the active scope.
 * DX scopes have no canonical row, so they resolve to undefined. */
export function canonicalForBand(
  canonicalByKey: Map<string, CanonicalLadderRow> | undefined,
  scope: ActiveScope,
  band: string,
): CanonicalLadderRow | undefined {
  if (!canonicalByKey) return undefined;
  if (scope.type === "regional" && scope.continent) {
    return canonicalByKey.get(canonicalKey("regional", scope.continent, band));
  }
  if (scope.type === "global") {
    return canonicalByKey.get(canonicalKey("global", "", band));
  }
  return undefined;
}
