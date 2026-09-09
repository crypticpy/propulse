/**
 * Phone page 2: contact list (#659, refs #632).
 *
 * Spots on the cursor's current band, newest first, capped at 50 rows (a
 * phone screen never needs to render an unbounded cluster feed). Tapping a
 * row calls `selectSpot`, which writes the shared cursor's `target` (and
 * re-confirms `band`) — the second leg of the #632 trace.
 */

import { EmptyState } from "@/components/station-ui";
import { selectVisibleSpots, useDXStore } from "@/stores/dxStore";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import type { DXSpot } from "@/types/dxcluster";

const MAX_ROWS = 50;

function toEpochMs(time: Date | string): number {
  return time instanceof Date ? time.getTime() : new Date(time).getTime();
}

function minutesAgo(time: Date | string): number {
  return Math.max(0, Math.round((Date.now() - toEpochMs(time)) / 60_000));
}

export function PhoneContactList() {
  const band = useOperatingStateStore((state) => state.cursor.band);
  const targetSpotId = useOperatingStateStore((state) => state.cursor.target?.spotId ?? null);
  const selectSpot = useOperatingStateStore((state) => state.selectSpot);
  const spots = useDXStore(selectVisibleSpots);

  if (!band) {
    return (
      <EmptyState title="NO BAND SELECTED">
        Pick a band on the Band ladder page first.
      </EmptyState>
    );
  }

  const bandSpots = spots
    .filter((spot) => spot.band === band)
    .sort((a, b) => toEpochMs(b.time) - toEpochMs(a.time))
    .slice(0, MAX_ROWS);

  if (bandSpots.length === 0) {
    return (
      <EmptyState title="NO SPOTS">No spots on {band.toUpperCase()} in the current window.</EmptyState>
    );
  }

  function pick(spot: DXSpot) {
    selectSpot({
      id: spot.id,
      callsign: spot.dx,
      band: spot.band ?? band,
      frequency: spot.frequency,
      mode: spot.mode ?? null,
      grid: spot.dxGrid ?? null,
    });
  }

  return (
    <div className="phone-contact-list" role="list" aria-label={`Spots on ${band.toUpperCase()}`}>
      {bandSpots.map((spot) => (
        <div key={spot.id} role="listitem">
          <button
            type="button"
            className="phone-contact-row"
            data-selected={spot.id === targetSpotId}
            onClick={() => pick(spot)}
          >
            <span className="phone-contact-row-call">{spot.dx}</span>
            <span className="phone-contact-row-detail su-mono">
              {(spot.frequency / 1000).toFixed(3)} · {spot.mode ?? "—"}
            </span>
            <span className="su-hint phone-contact-row-age">{minutesAgo(spot.time)}m</span>
          </button>
        </div>
      ))}
    </div>
  );
}
