import { canonicalKey, type CanonicalLadderRow } from "@/hooks/useBandLadder";
import type { ActiveScope, BandLadderEntry } from "@/hooks/useBandVerdicts";
import { LADDER_RANK } from "@/lib/verdict/ladder";
import { verdictIsCurrent } from "@/lib/verdict/presentation";

/** A canonical row plus whether the collector has stopped ticking it. A
 * stale row is still returned (never dropped) so a panel can show it with
 * an age qualifier instead of silently repeating an old call as current. */
export interface CanonicalBandRow extends CanonicalLadderRow {
  stale: boolean;
}

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

/** Resolve the canonical ladder row backing a band inside the active scope,
 * gated by the same 30-minute staleness rule as the Home ladder (DS-07) so
 * every consumer of this row agrees on whether it still describes now.
 * DX scopes have no canonical row, so they resolve to undefined. */
export function canonicalForBand(
  canonicalByKey: Map<string, CanonicalLadderRow> | undefined,
  scope: Pick<ActiveScope, "type" | "continent">,
  band: string,
  now: number = Date.now(),
): CanonicalBandRow | undefined {
  if (!canonicalByKey) return undefined;
  let row: CanonicalLadderRow | undefined;
  if (scope.type === "regional" && scope.continent) {
    row = canonicalByKey.get(canonicalKey("regional", scope.continent, band));
  } else if (scope.type === "global") {
    row = canonicalByKey.get(canonicalKey("global", "", band));
  }
  if (!row) return undefined;
  return { ...row, stale: !verdictIsCurrent(Date.parse(row.updatedAt), now) };
}
