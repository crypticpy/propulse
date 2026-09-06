import { useMemo } from "react";
import { useUTCClock } from "@/hooks/useUTCClock";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { rankLoadedDx } from "@/lib/hamclock/topDx";
import { resolveUnits } from "@/lib/hamclock/units";
import { filterMapSpots } from "@/lib/map/filterMapSpots";
import { useDXStore } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { HamClockButton } from "../controls";
import { useVisibleRows } from "../useVisibleRows";

export function BandTopDx() {
  const home = useActiveLocation();
  const spots = useDXStore((s) => s.spots);
  const filters = useMapStore((s) => s.spotFilters);
  const units = useHamClockDisplayStore((s) => s.units);
  const now = useUTCClock(30_000).getTime();
  const rows = useMemo(
    () => (home ? rankLoadedDx(filterMapSpots(spots, filters), home, now) : []),
    [home, spots, filters, now],
  );
  const [ref, visible] = useVisibleRows<HTMLDivElement>(rows.length);
  const resolved = resolveUnits(units, home?.grid);
  const distance = (km: number) =>
    `${Math.round(km * (resolved === "imperial" ? 0.621371 : 1)).toLocaleString()} ${resolved === "imperial" ? "mi" : "km"}`;
  return (
    <>
      <p className="hcr-note">
        TOP {Math.min(visible, rows.length)} OF {rows.length} LOCATED · LOADED
        DX CLUSTER · UP TO 60 MIN · FROM HOME
      </p>
      {!home ? (
        <p className="hcr-note">SET HOME IN SETTINGS</p>
      ) : rows.length === 0 ? (
        <p className="hcr-note">NO LOCATED SPOTS IN WINDOW</p>
      ) : (
        <div ref={ref} className="hcr-top-dx-list">
          {rows.slice(0, visible).map(({ spot, target, km }) => (
            <HamClockButton
              key={spot.id}
              onClick={() => {
                const map = useMapStore.getState();
                map.setTarget({ ...target, name: spot.dx, grid: spot.dxGrid });
                map.setCenterLocation(target.lat, target.lon);
                useDXStore.getState().setSelectedSpot(spot);
              }}
            >
              {spot.dx} · {spot.band ?? "—"} · {distance(km)} ·{" "}
              {Math.max(
                0,
                Math.floor((now - new Date(spot.time).getTime()) / 60_000),
              )}{" "}
              MIN
            </HamClockButton>
          ))}
        </div>
      )}
      <p className="hcr-note">
        Loaded reports are a sample, not every station on air. Missing or
        approximate locations are not ranked.
      </p>
      <table className="sr-only">
        <caption>Top DX · loaded cluster sample</caption>
        <thead>
          <tr>
            <th>Callsign</th>
            <th>Band</th>
            <th>Distance from home</th>
            <th>Reported UTC</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ spot, km }) => (
            <tr key={spot.id}>
              <td>{spot.dx}</td>
              <td>{spot.band}</td>
              <td>{distance(km)}</td>
              <td>{new Date(spot.time).toISOString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
