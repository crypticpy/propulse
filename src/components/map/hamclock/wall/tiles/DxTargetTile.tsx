import { lazy, Suspense, useMemo, useState } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { latLonToGrid } from "@/lib/utils/grid";
import { formatDistance, getPathMetrics } from "@/lib/utils/path";
import { useMapStore } from "@/stores/mapStore";
import { HamClockTile, TileHero, TileSub } from "../HamClockTile";

// The report is only worth its bytes once an operator opens it.
const DxTargetReport = lazy(() =>
  import("../reports/DxTargetReport").then((m) => ({
    default: m.DxTargetReport,
  })),
);

/**
 * The map's chosen DX target as a wall tile: grid square hero, distance and
 * bearing from the active QTH as the sub line. Retires the accordion
 * sidebar's "DX Target" panel, which also duplicated the DE identity block
 * this tile deliberately leaves out (wall spec §15, HW-25).
 */
export function DxTargetTile() {
  const target = useMapStore((s) => s.target);
  const location = useActiveLocation();
  const [reportOpen, setReportOpen] = useState(false);

  const metrics = useMemo(
    () =>
      target && location
        ? getPathMetrics(location.lat, location.lon, target.lat, target.lon)
        : null,
    [target, location],
  );

  if (!target) {
    return (
      <HamClockTile title="DX target" source="DX">
        <TileHero tone="hc-dim-text">—</TileHero>
        <TileSub>
          <span>PICK A TARGET ON THE MAP</span>
        </TileSub>
      </HamClockTile>
    );
  }

  const grid = target.grid || latLonToGrid(target.lat, target.lon);

  return (
    <>
      <HamClockTile
        title="DX target"
        source="DX"
        state="var(--hc-accent)"
        onOpen={() => setReportOpen(true)}
        openLabel={`DX target ${grid}. Open the DX target report`}
      >
        <TileHero tone="hc-accent-text">{grid}</TileHero>
        <TileSub>
          {metrics ? (
            <>
              <span>{formatDistance(metrics.shortPath.distance)}</span>
              <span>
                BRG <b>{Math.round(metrics.shortPath.bearing)}°</b>
              </span>
            </>
          ) : (
            <span>SET YOUR QTH TO SEE DISTANCE AND BEARING</span>
          )}
        </TileSub>
      </HamClockTile>

      {reportOpen && (
        <Suspense fallback={null}>
          <DxTargetReport open onClose={() => setReportOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
