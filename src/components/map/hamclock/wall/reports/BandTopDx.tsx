import { useMemo } from "react";
import { TuneButton } from "@/components/radio/TuneButton";
import { useUTCClock } from "@/hooks/useUTCClock";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useOptionalViewEffectiveSpots } from "@/hooks/useViewClusterSpots";
import { rankLoadedDx } from "@/lib/hamclock/topDx";
import { resolveUnits } from "@/lib/hamclock/units";
import { filterMapSpots } from "@/lib/map/filterMapSpots";
import {
  modeMatchesSelection,
  modeSelectionMatchesEverything,
  normalizeMode,
  normalizeModeSelection,
} from "@/lib/spots/presentation/modes";
import { useDXStore } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { useOptionalViewRuntime } from "@/components/views/ViewRuntimeContext";
import { HamClockButton } from "../controls";
import { useVisibleRows } from "../useVisibleRows";

const BRIDGE_CLOCK_TOLERANCE_MS = 60_000;

export function BandTopDx() {
  const runtime = useOptionalViewRuntime();
  const home = useActiveLocation();
  const spots = useDXStore((s) => s.spots);
  const source = useDXStore((s) => s.spotSource);
  // Band/mode filters come from the bound view's own runtime (SP-09 round 3),
  // not the retired `mapStore.spotFilters`. This report is also reachable
  // unbound — a report pinned from the wall re-mounts inside
  // `HamClockPinnedReportHost`, which `WorkspacePage.tsx` mounts with no
  // `ViewProvider` above it (PR #615 review finding 1) — so this must fall
  // back to unfiltered defaults instead of throwing.
  const viewSpots = useOptionalViewEffectiveSpots();
  const units = useHamClockDisplayStore((s) => s.units);
  const now = useUTCClock(30_000).getTime();
  const modeSelection = useMemo(
    () => normalizeModeSelection(viewSpots.filters.modes),
    [viewSpots.filters.modes],
  );
  const rows = useMemo(() => {
    if (!home) return [];
    // `filterMapSpots` only understands a flat mode string[] (no alias
    // normalization); apply the bound view's mode selection separately with
    // the same category/alias-aware matcher `DXSpotList` uses.
    const bandFiltered = filterMapSpots(spots, { bands: viewSpots.filters.bands, modes: [] });
    const eligible = modeSelectionMatchesEverything(modeSelection)
      ? bandFiltered
      : bandFiltered.filter((spot) => modeMatchesSelection(normalizeMode(spot.mode), modeSelection));
    return rankLoadedDx(eligible, home, now, source === "bridge" ? BRIDGE_CLOCK_TOLERANCE_MS : 0);
  }, [home, spots, viewSpots.filters.bands, modeSelection, now, source]);
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
            <div className="hcr-top-dx-row" key={spot.id}>
            <HamClockButton
              onClick={() => {
                const map = useMapStore.getState();
                map.setTarget({ ...target, name: spot.dx, grid: spot.dxGrid });
                map.setCenterLocation(target.lat, target.lon);
                useDXStore.getState().setSelectedSpot(spot);
                runtime?.selectSpot(spot.id, { lat: target.lat, lon: target.lon });
              }}
            >
              {spot.dx} · {spot.band ?? "—"} · {distance(km)} ·{" "}
              {Math.max(
                0,
                Math.floor((now - new Date(spot.time).getTime()) / 60_000),
              )}{" "}
              MIN
            </HamClockButton>
            <TuneButton frequencyKHz={spot.frequency} mode={spot.mode || null} wall />
            </div>
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
