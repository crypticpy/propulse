import { lazy, Suspense, useMemo, useState } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useUTCClock } from "@/hooks/useUTCClock";
import { filterMapSpots } from "@/lib/map/filterMapSpots";
import { getBandColor } from "@/lib/utils/spotColors";
import { useDXStore } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import type { DXSpot } from "@/types/dxcluster";
import { HamClockTile } from "../HamClockTile";

// The full spot report is the only heavy dependency the wall pulls in; it
// loads when an operator opens the report rather than with the wall itself.
const DXSpotList = lazy(() =>
  import("@/components/dx/DXSpotList/DXSpotList").then((m) => ({
    default: m.DXSpotList,
  })),
);

/** The rail cannot scroll, so render a generous slice and let CSS clip it. */
const MAX_ROWS = 22;

/** `spot.time` is typed as Date but arrives as a string over JSON. */
function spotMillis(time: DXSpot["time"]): number {
  return time instanceof Date ? time.getTime() : new Date(time).getTime();
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

function formatFrequency(khz: number): string {
  return (khz / 1000).toFixed(3);
}

/** Trailing context: the spotter's note, else who reported it. */
function spotDetail(spot: DXSpot): string {
  const comment = spot.comment?.trim();
  return comment ? comment : `de ${spot.spotter}`;
}

/**
 * Reads the DX store the map stage's `useDXCluster` already fills. The tile
 * can be mounted on both rails at once, and each `useDXCluster` call owns its
 * own bridge socket and history, so the tile must never open a feed itself.
 */
export function ClusterTile() {
  const location = useActiveLocation();
  const allSpots = useDXStore((s) => s.spots);
  const source = useDXStore((s) => s.spotSource);
  const spotFilters = useMapStore((s) => s.spotFilters);
  const now = useUTCClock(10_000);
  const [reportOpen, setReportOpen] = useState(false);

  const spots = useMemo(
    () => filterMapSpots(allSpots ?? [], spotFilters),
    [allSpots, spotFilters],
  );
  const rows = spots.slice(0, MAX_ROWS);
  const feed = source === "bridge" ? "BRIDGE" : "CLUSTER";

  // No station/home set (wall spec §7, HW-53): a neutral state. The DX store
  // is filled by a globally-mounted connection elsewhere on the map, so this
  // tile never opens its own feed either way — only its rendering is gated.
  if (!location) {
    return (
      <HamClockTile title="DX cluster">
        <p className="hc-placeholder">SET HOME IN SETTINGS</p>
      </HamClockTile>
    );
  }

  return (
    <>
      <HamClockTile
        title="DX cluster"
        source={`${spots.length} · ${feed}`}
        grow
        onOpen={() => setReportOpen(true)}
        openLabel={`DX cluster: ${spots.length} spots. Open the full spot report`}
      >
        <div className="hc-rows">
          {rows.map((spot) => {
            const ageSeconds = (now.getTime() - spotMillis(spot.time)) / 1000;
            const band = spot.band ?? "";
            return (
              <div className="hc-row" key={spot.id}>
                <span
                  className="hc-chip"
                  style={{ background: getBandColor(band || spot.frequency) }}
                >
                  {band || "—"}
                </span>
                <span className="hc-row-call">
                  {spot.dx}
                  <small>
                    {formatFrequency(spot.frequency)}
                    {spot.mode ? ` ${spot.mode}` : ""} · {spotDetail(spot)}
                  </small>
                </span>
                <span
                  className={`hc-row-age${ageSeconds < 60 ? " hc-row-age--new" : ""}`}
                >
                  {formatAge(ageSeconds)}
                </span>
              </div>
            );
          })}
          {rows.length === 0 && (
            <p className="hc-placeholder">No spots match the active filters</p>
          )}
        </div>
      </HamClockTile>

      <DetailModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        title="DX Cluster Report"
        subtitle={`${spots.length} spots · ${feed}`}
        size="xl"
      >
        <Suspense
          fallback={
            <p className="p-4 font-mono text-xs uppercase tracking-widest text-white/40">
              Loading spots…
            </p>
          }
        >
          <DXSpotList showFilters maxHeight="60vh" />
        </Suspense>
      </DetailModal>
    </>
  );
}
