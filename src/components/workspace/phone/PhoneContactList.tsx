/**
 * Phone page 2: contact list (#659, refs #632).
 *
 * Spots on the cursor's current band, newest first, capped at 50 rows (a
 * phone screen never needs to render an unbounded cluster feed). Tapping a
 * row calls `selectSpot`, which writes the shared cursor's `target` (and
 * re-confirms `band`) — the second leg of the #632 trace.
 */

import { useMemo } from "react";
import { EmptyState } from "@/components/station-ui";
import { useDXStore } from "@/stores/dxStore";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import type { DXSpot } from "@/types/dxcluster";
import { usePhoneTick } from "./usePhoneTick";

const MAX_ROWS = 50;

function toEpochMs(time: Date | string): number {
  return time instanceof Date ? time.getTime() : new Date(time).getTime();
}

function minutesAgo(time: Date | string): number {
  return Math.max(0, Math.round((Date.now() - toEpochMs(time)) / 60_000));
}

export function PhoneContactList() {
  const band = useOperatingStateStore((state) => state.cursor.band);
  const targetSpotId = useOperatingStateStore(
    (state) => state.cursor.target?.spotId ?? null,
  );
  const selectSpot = useOperatingStateStore((state) => state.selectSpot);
  // `selectVisibleSpots` allocates a fresh filtered array on every call once
  // `hiddenSpotIds` is non-empty, which is not a stable useSyncExternalStore
  // snapshot and re-renders forever. Subscribe to the two raw fields (each a
  // stable reference until it actually changes) and filter inside the
  // memo below instead (pattern: `BandConditions.tsx`).
  const spots = useDXStore((state) => state.spots);
  const hiddenSpotIds = useDXStore((state) => state.hiddenSpotIds);
  // Refreshes spot ages every 60s so they don't freeze at first-render values
  // (#685 P3).
  const tick = usePhoneTick();

  const bandSpots = useMemo(() => {
    const visibleSpots =
      hiddenSpotIds.size === 0
        ? spots
        : spots.filter((spot) => !hiddenSpotIds.has(spot.id));
    return visibleSpots
      .filter((spot) => spot.band === band)
      .sort((a, b) => toEpochMs(b.time) - toEpochMs(a.time))
      .slice(0, MAX_ROWS);
    // `tick` isn't read above; it's only in the deps to force a periodic
    // recompute so spot ages don't freeze (#685 P3).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots, hiddenSpotIds, band, tick]);

  if (!band) {
    return (
      <EmptyState title="NO BAND SELECTED">
        Pick a band on the Band ladder page first.
      </EmptyState>
    );
  }

  if (bandSpots.length === 0) {
    return (
      <EmptyState title="NO SPOTS">
        No spots on {band.toUpperCase()} in the current window.
      </EmptyState>
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
    <div
      className="phone-contact-list"
      role="list"
      aria-label={`Spots on ${band.toUpperCase()}`}
    >
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
            <span className="su-hint phone-contact-row-age">
              {minutesAgo(spot.time)}m
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}
