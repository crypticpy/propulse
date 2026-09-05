import { lazy, Suspense, useMemo, useState } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useBandVerdicts } from "@/hooks/useBandVerdicts";
import { selectBestBand } from "@/lib/verdict/bestBand";
import { HamClockTile, TileHero, TileSub } from "../HamClockTile";
import {
  LADDER_WALL_CLASS,
  LADDER_WALL_LABEL,
  LADDER_WALL_STATE,
} from "../tokens";

// The report is only worth its bytes once an operator opens it.
const BestBandReport = lazy(() =>
  import("../reports/BestBandReport").then((m) => ({
    default: m.BestBandReport,
  })),
);

/**
 * Best band now, wall density. Same hooks and selection as the desk hero;
 * the drill-down is the ranked Best Band report (HW-31), not the desk's
 * single-band evidence dialog.
 */
export function BestBandTile() {
  const location = useActiveLocation();
  const { bands, ready, scope } = useBandVerdicts();
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
        <Suspense fallback={null}>
          <BestBandReport open onClose={() => setDetailsOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
