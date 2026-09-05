import { useMemo, useState } from "react";
import { BandVerdictDetailsDialog } from "@/components/dx/BandVerdictDetailsDialog";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useBandActivity } from "@/hooks/useBandActivity";
import { useBandLadder } from "@/hooks/useBandLadder";
import { useBandVerdicts } from "@/hooks/useBandVerdicts";
import { canonicalForBand, selectBestBand } from "@/lib/verdict/bestBand";
import { HamClockTile, TileHero, TileSub } from "../HamClockTile";
import {
  LADDER_WALL_CLASS,
  LADDER_WALL_LABEL,
  LADDER_WALL_STATE,
} from "../tokens";

/**
 * Best band now, wall density. Same hooks, same selection and the same
 * evidence dialog as the desk hero — only the presentation changes.
 */
export function BestBandTile() {
  const location = useActiveLocation();
  const { bands, ready, scope, activityScope } = useBandVerdicts();
  const { data: activityByBand } = useBandActivity(activityScope);
  const { data: canonicalByKey } = useBandLadder();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { best, second } = useMemo(() => {
    if (!ready) return { best: null, second: null };
    const top = selectBestBand(bands);
    return {
      best: top,
      second: top ? selectBestBand(bands.filter((b) => b !== top)) : null,
    };
  }, [bands, ready]);

  // No station/home set (wall spec §7, HW-53): a neutral state, never an
  // error or a stalled fetch. The band-verdict hooks above are shared,
  // globally-cached data (not a per-tile fetch), so there is nothing to
  // suppress — only the tile's own rendering is gated.
  if (!location) {
    return (
      <HamClockTile title="Best band now">
        <TileHero tone="hc-dim-text">—</TileHero>
        <TileSub>
          <span>SET HOME IN SETTINGS</span>
        </TileSub>
      </HamClockTile>
    );
  }

  if (!best) {
    return (
      <HamClockTile title="Best band now" source={scope.label.toUpperCase()}>
        <TileHero tone="hc-dim-text">—</TileHero>
        <TileSub>
          <span>Waiting for live evidence…</span>
        </TileSub>
      </HamClockTile>
    );
  }

  const verdict = best.fading ? "FADING" : LADDER_WALL_LABEL[best.stable];
  const tone = best.fading ? "hc-warn" : LADDER_WALL_CLASS[best.stable];
  const state = best.fading ? "var(--hc-warn)" : LADDER_WALL_STATE[best.stable];

  return (
    <>
      <HamClockTile
        title="Best band now"
        source={scope.label.toUpperCase()}
        state={state}
        onOpen={() => setDetailsOpen(true)}
        openLabel={`Best band now: ${best.band}, ${verdict}. Open band health report`}
      >
        <div className="hc-heroline">
          <TileHero tone={tone} flush>
            {best.band.toUpperCase()}
          </TileHero>
          <div className={`hc-verdict hc-glow ${tone}`}>{verdict}</div>
        </div>
        <TileSub>
          <span>
            <b>{best.result.inputs.obs20m}</b> spots ·{" "}
            <b>{best.result.inputs.reporters20m}</b> rx
          </span>
          {second && (
            <span>
              {second.band.toUpperCase()} {LADDER_WALL_LABEL[second.stable]}
            </span>
          )}
        </TileSub>
      </HamClockTile>

      {detailsOpen && (
        <BandVerdictDetailsDialog
          entry={best}
          activity={activityByBand?.get(best.band)}
          canonical={canonicalForBand(canonicalByKey, scope, best.band)}
          scopeLabel={scope.label}
          onClose={() => setDetailsOpen(false)}
        />
      )}
    </>
  );
}
