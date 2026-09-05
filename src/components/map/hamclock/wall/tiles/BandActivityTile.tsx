import { Fragment, useMemo } from "react";
import { useBandActivity } from "@/hooks/useBandActivity";
import { useBandVerdicts } from "@/hooks/useBandVerdicts";
import { getBandColor } from "@/lib/utils/spotColors";
import { HamClockTile, TileHero, TileSub } from "../HamClockTile";

/** A rail tile can carry six bars before the type stops reading at ten feet. */
const MAX_BARS = 6;

/**
 * Per-band spot counts as a bar chart, hottest first. The scope comes from the
 * same ladder the Best Band tile reads, so both tiles always describe the same
 * population of spots.
 */
export function BandActivityTile() {
  const { scope, activityScope } = useBandVerdicts();
  const { data, isPending, isError } = useBandActivity(activityScope);

  const bars = useMemo(() => {
    const entries = [...(data?.values() ?? [])].filter(
      (entry) => entry.count60m > 0,
    );
    entries.sort((a, b) => b.count60m - a.count60m);
    return entries.slice(0, MAX_BARS);
  }, [data]);

  const source = scope.label.toUpperCase();

  if (bars.length === 0) {
    return (
      <HamClockTile title="Band activity" source={source}>
        <TileHero tone="hc-dim-text">—</TileHero>
        <TileSub>
          <span>
            {isError
              ? "Activity feed unavailable"
              : isPending
                ? "Counting spots…"
                : "No spots in this scope yet"}
          </span>
        </TileSub>
      </HamClockTile>
    );
  }

  const [top] = bars;
  const total = bars.reduce((sum, entry) => sum + entry.count60m, 0);

  return (
    <HamClockTile
      title="Band activity"
      source={`${source} · 60 MIN`}
      state={getBandColor(top.band)}
    >
      <div className="hc-heroline">
        <TileHero flush>{top.band.toUpperCase()}</TileHero>
        <div className="hc-verdict hc-glow hc-accent-text">
          {top.count60m.toLocaleString()}
        </div>
      </div>
      <div className="hc-bars">
        {bars.map((entry) => (
          <Fragment key={entry.band}>
            <span className="hc-bars-k">{entry.band}</span>
            <span className="hc-bar">
              <i
                style={{
                  width: `${Math.max(2, (entry.count60m / top.count60m) * 100)}%`,
                  color: getBandColor(entry.band),
                }}
              />
            </span>
            <span className="hc-bars-v">{entry.count60m}</span>
          </Fragment>
        ))}
      </div>
      <TileSub>
        <span>
          <b>{total.toLocaleString()}</b> spots · {bars.length} bands
        </span>
      </TileSub>
    </HamClockTile>
  );
}
