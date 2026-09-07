import { useUserStore } from "@/stores/userStore";
import { useDXStore } from "@/stores/dxStore";
import { PSK_WINDOWS, type PskWindowMinutes } from "@/lib/hamclock/pskStation";
import { MAP_SPOT_AGES } from "@/lib/map/spotAge";
import { useMapSpotFeed } from "@/hooks/useMapSpotFeed";
import { useMapStore } from "@/stores/mapStore";
import { HamClockSegmented } from "../controls";

const DENSITIES = [10, 50, 100, 150, 200];

/** Shared map cap; choosing fewer points does not reduce activity evidence. */
export function SpotsTab() {
  const scope = useMapStore(s => s.spotFeedScope);
  const setScope = useMapStore(s => s.setSpotFeedScope);
  const personal = scope === "psk-station";
  const density = useMapStore((s) => s.displayDensity);
  const setDensity = useMapStore((s) => s.setDisplayDensity);
  const age = useMapStore((s) => s.spotAgeMinutes);
  const setAge = useMapStore((s) => s.setSpotAgeMinutes);
  const layers = useMapStore((s) => s.layers);
  const spotFilters = useMapStore((s) => s.spotFilters);
  const station = useUserStore((s) => s.station);
  const sources = useDXStore((s) => s.filters.sources);
  const feed = useMapSpotFeed({
    grid: station?.grid,
    enabled: layers.spots || layers.spotTraces || layers.gridActivity,
    sources,
    spotFilters,
  });
  // Preserve an intermediate value chosen with the existing desktop slider.
  const choices = DENSITIES.includes(density)
    ? DENSITIES
    : [...DENSITIES, density].sort((a, b) => a - b);
  return (
    <div className="hcc-tabgrid">
      <HamClockSegmented label="Map spot feed" value={scope} onChange={setScope} options={[
        { value: "global", label: "GLOBAL SAMPLE" },
        { value: "psk-station", label: "MY PSK REPORTS" },
      ]} />
      <HamClockSegmented
        label="Map spot limit"
        value={String(density)}
        onChange={(value) => setDensity(Number(value))}
        options={choices.map((value) => ({ value: String(value), label: String(value) }))}
      />
      <HamClockSegmented
        label="Map spot age"
        value={String(personal ? feed.station.view.minutes : age)}
        onChange={(value) => personal ? feed.station.view.setMinutes(Number(value) as PskWindowMinutes) : setAge(Number(value))}
        options={(personal ? PSK_WINDOWS : MAP_SPOT_AGES).map(value => ({ value: String(value), label: `${value} MIN` }))}
      />
      <p className="hcc-row-detail">
        {personal
          ? `${feed.station.view.direction === "of" ? "OF" : "BY"} ${feed.station.feed.callsign ?? "station call required"} · ${feed.station.view.band.toUpperCase()} · last ${feed.station.view.minutes} minutes. Direction and band follow the PSK report. Only paths with both reported locators appear. Loaded history may be incomplete.`
          : `Loaded sample · last ${age} minutes. Reports expire as the clock advances; this is not a complete interval count.`}
      </p>
      <p className="hcc-row-detail" aria-label="Map spot sources">
        PSK {feed.sourceStates.PSKReporter} · RBN {feed.sourceStates.RBN} · WSJT-X {feed.sourceStates["WSJT-X"]}
      </p>
      <p className="hcc-row-detail">
        Draw up to {density} eligible spots. Fewer spots reduce clutter; activity
        summaries keep their available evidence. The feed may contain fewer spots.
      </p>
      <p className="hcc-row-detail">Flat map: circle = transmitter · square = receiver.</p>
    </div>
  );
}
