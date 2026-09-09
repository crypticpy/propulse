/**
 * Phone page 1: band ladder (#659, refs #632, #653 heat-map baseline).
 *
 * Aggregates the shared heat-map grid (`computeHeatmap`, one cell per band x
 * continent) down to one row per band, dropping the continent split per the
 * owner's round-2 correction ("drop the continent-picker World scope
 * emphasis; band visibility is the phone workspace's own setting") — a phone
 * operator picks a band, not a continent. Rows are filtered to
 * `workspaceStore.phoneVisibleBands` (the phone's own visibility setting,
 * distinct from the workstation's `display.visibleBands`) and coloured by
 * the same `LADDER_HUE_PRESET` bucket colours the wall heat map uses, so the
 * verdict language matches across canvases.
 *
 * Tapping a row writes the shared cursor's `band` (#658) — the first leg of
 * the #632 trace this canvas exists to prove out.
 */

import { useMemo } from "react";
import { EmptyState } from "@/components/station-ui";
import { BAND_ORDER } from "@/lib/data/bandRanges";
import { LADDER_RANK, type LadderState } from "@/lib/verdict/ladder";
import {
  computeHeatmap,
  dxSpotToHeatmapInput,
  LADDER_HUE_PRESET,
  type HeatmapCell,
  type HeatmapSpotInput,
} from "@/lib/widgets/heatmap";
import { useDXStore } from "@/stores/dxStore";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { usePhoneTick } from "./usePhoneTick";

interface BandRow {
  band: string;
  count: number;
  ladder: LadderState;
}

/** Sum spot counts and take the hottest verdict across every continent for one band. */
function aggregateByBand(cells: HeatmapCell[]): Map<string, BandRow> {
  const rows = new Map<string, BandRow>();
  for (const cell of cells) {
    const existing = rows.get(cell.band);
    if (!existing) {
      rows.set(cell.band, {
        band: cell.band,
        count: cell.count,
        ladder: cell.ladder,
      });
      continue;
    }
    existing.count += cell.count;
    if (LADDER_RANK[cell.ladder] > LADDER_RANK[existing.ladder]) {
      existing.ladder = cell.ladder;
    }
  }
  return rows;
}

export function PhoneBandLadder() {
  // `selectVisibleSpots` allocates a fresh filtered array on every call once
  // `hiddenSpotIds` is non-empty, which is not a stable useSyncExternalStore
  // snapshot and re-renders forever. Subscribe to the two raw fields (each a
  // stable reference until it actually changes) and filter inside the
  // existing memo instead (pattern: `BandConditions.tsx`).
  const spots = useDXStore((state) => state.spots);
  const hiddenSpotIds = useDXStore((state) => state.hiddenSpotIds);
  const visibleBands = useWorkspaceStore((state) => state.phoneVisibleBands);
  const currentBand = useOperatingStateStore((state) => state.cursor.band);
  const setBand = useOperatingStateStore((state) => state.setBand);
  const setTarget = useOperatingStateStore((state) => state.setTarget);
  // Refreshes ladder verdicts every 60s so they don't freeze at first-render
  // values (#685 P3) — `computeHeatmap` buckets spots into a moving time
  // window, so the same spot set can carry a different verdict a minute on.
  const tick = usePhoneTick();

  const rows = useMemo(() => {
    const visibleSpots =
      hiddenSpotIds.size === 0
        ? spots
        : spots.filter((spot) => !hiddenSpotIds.has(spot.id));
    const inputs = visibleSpots
      .map(dxSpotToHeatmapInput)
      .filter((input): input is HeatmapSpotInput => input !== null);
    const byBand = aggregateByBand(computeHeatmap(inputs));
    // `computeHeatmap` always emits one cell per (band x continent) pair, so
    // `byBand` is guaranteed an entry for every band in `BAND_ORDER` — no
    // fallback needed here.
    return BAND_ORDER.filter((band) => visibleBands.includes(band)).map(
      (band) => byBand.get(band)!,
    );
    // `tick` isn't read above; it's only in the deps to force a periodic
    // recompute of the time-relative verdict (#685 P3).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots, hiddenSpotIds, visibleBands, tick]);

  if (rows.length === 0) {
    return (
      <EmptyState title="NO BANDS VISIBLE">
        Turn a band back on in SETUP to see it here.
      </EmptyState>
    );
  }

  return (
    <div className="phone-band-ladder" role="list" aria-label="Bands">
      {rows.map((row) => (
        <div key={row.band} role="listitem">
          <button
            type="button"
            className="phone-band-row"
            data-selected={row.band === currentBand}
            style={{
              borderInlineStartColor:
                LADDER_HUE_PRESET.bucketColors[LADDER_RANK[row.ladder]],
            }}
            onClick={() => {
              // A target picked on another band must not carry over as this
              // band's "current selection" (Codex P2 on #685): per-field
              // cursor writes leave `target` untouched, so clear it here
              // whenever the band actually changes.
              if (row.band !== currentBand) setTarget(null);
              setBand(row.band);
            }}
          >
            <span className="phone-band-row-name">
              {row.band.toUpperCase()}
            </span>
            <span className="phone-band-row-verdict">
              {row.ladder.toUpperCase()}
            </span>
            <span className="su-mono">{row.count}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
