import { useMemo, useState } from "react";
import { BandVerdictDetailsDialog } from "@/components/dx/BandVerdictDetailsDialog";
import { useBandActivity } from "@/hooks/useBandActivity";
import {
  canonicalKey,
  useBandLadder,
  type CanonicalLadderRow,
} from "@/hooks/useBandLadder";
import {
  useBandVerdicts,
  type ActiveScope,
  type BandLadderEntry,
} from "@/hooks/useBandVerdicts";
import {
  LADDER_LABEL,
  LADDER_TEXT_CLASSES,
} from "@/lib/verdict/presentation";
import { LADDER_RANK } from "@/lib/verdict/ladder";

/** Select the strongest live band, breaking equal ladder states with the
 * observation and reporter evidence already used by the detail dialog. */
function selectBestBand(entries: BandLadderEntry[]): BandLadderEntry | null {
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

function canonicalForBand(
  canonicalByKey: Map<string, CanonicalLadderRow> | undefined,
  scope: ActiveScope,
  band: string,
): CanonicalLadderRow | undefined {
  if (!canonicalByKey) return undefined;
  if (scope.type === "regional" && scope.continent) {
    return canonicalByKey.get(
      canonicalKey("regional", scope.continent, band),
    );
  }
  if (scope.type === "global") {
    return canonicalByKey.get(canonicalKey("global", "", band));
  }
  return undefined;
}

/** Live, evidence-backed headline for the wall display. It deliberately uses
 * the same Band Health hooks and detail dialog as Home and PropSphere. */
export function HamClockBestBandHero() {
  const { bands, ready, scope, activityScope } = useBandVerdicts();
  const { data: activityByBand } = useBandActivity(activityScope);
  const { data: canonicalByKey } = useBandLadder();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const best = useMemo(
    () => (ready ? selectBestBand(bands) : null),
    [bands, ready],
  );
  const bestStatus = best
    ? best.fading
      ? "Fading"
      : LADDER_LABEL[best.stable]
    : null;
  const activity = best ? activityByBand?.get(best.band) : undefined;
  const canonical = best
    ? canonicalForBand(canonicalByKey, scope, best.band)
    : undefined;

  return (
    <section className="border-b border-white/10 bg-gradient-to-r from-plasma-orange/[0.08] via-white/[0.025] to-transparent p-2.5">
      <button
        type="button"
        disabled={!best}
        onClick={() => setDetailsOpen(true)}
        aria-haspopup={best ? "dialog" : undefined}
        aria-label={
          best
            ? `Best band now: ${best.band}, ${bestStatus}. Open band health details`
            : "Best band now is waiting for live band health"
        }
        className="w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/70 disabled:cursor-wait"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="font-orbitron text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">
            Best Band Now
          </span>
          <span className="truncate font-mono text-[8px] uppercase text-white/25">
            {scope.label}
          </span>
        </span>

        {best ? (
          <span className="mt-1 flex items-end justify-between gap-2">
            <span className="flex min-w-0 items-baseline gap-2">
              <span
                className={`font-orbitron text-2xl font-bold leading-none ${LADDER_TEXT_CLASSES[best.stable]}`}
              >
                {best.band}
              </span>
              <span
                className={`truncate font-mono text-[10px] font-semibold uppercase ${LADDER_TEXT_CLASSES[best.stable]}`}
              >
                {bestStatus}
              </span>
            </span>
            <span className="shrink-0 font-mono text-[8px] tabular-nums text-white/35">
              {best.result.inputs.obs20m} obs ·{" "}
              {best.result.inputs.reporters20m} rx
            </span>
          </span>
        ) : (
          <span className="mt-1 block font-mono text-xs text-white/35">
            Waiting for live evidence…
          </span>
        )}
      </button>

      {detailsOpen && best && (
        <BandVerdictDetailsDialog
          entry={best}
          activity={activity}
          canonical={canonical}
          scopeLabel={scope.label}
          onClose={() => setDetailsOpen(false)}
        />
      )}
    </section>
  );
}
