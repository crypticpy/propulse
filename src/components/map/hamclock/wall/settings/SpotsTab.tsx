import { useUserStore } from "@/stores/userStore";
import { PSK_WINDOWS, type PskWindowMinutes } from "@/lib/hamclock/pskStation";
import { MAP_SPOT_AGES } from "@/lib/map/spotAge";
import { useMapSpotFeed } from "@/hooks/useMapSpotFeed";
import { useMapStore } from "@/stores/mapStore";
import {
  useViewEffectiveSpots,
  useViewSpotFilterPatch,
} from "@/hooks/useViewClusterSpots";
import { HamClockSegmented } from "../controls";

const DENSITIES = [10, 50, 100, 150, 200];

/** Shared map cap; choosing fewer points does not reduce activity evidence. */
export function SpotsTab() {
  const scope = useMapStore(s => s.spotFeedScope);
  const setScope = useMapStore(s => s.setSpotFeedScope);
  const personal = scope === "psk-station";
  // The bound view's own spot budget — nothing reads `mapStore.displayDensity`
  // for the map's spot cap any more; renderers cap on `prefs.filters.spotLimit`.
  const viewSpots = useViewEffectiveSpots();
  const patchViewFilters = useViewSpotFilterPatch();
  const density = viewSpots.filters.spotLimit;
  const age = useMapStore((s) => s.spotAgeMinutes);
  const setAge = useMapStore((s) => s.setSpotAgeMinutes);
  const layers = useMapStore((s) => s.layers);
  const station = useUserStore((s) => s.station);
  // Same derivation `useViewMapSpots` uses (empty selection -> undefined, so
  // an empty list means "no source filter" rather than "no sources"),
  // instead of the retired `useDXStore` filter, so this status strip
  // describes the feed the map actually renders (PR #615 review finding 5).
  const sources =
    viewSpots.filters.sources.length > 0 ? viewSpots.filters.sources : undefined;
  // No `spotFilters` here on purpose, but not for the reason previously
  // claimed: `useLiveSpots`'s query keys never included `spotFilters` (it
  // only narrows `evidenceSpots`/`spots`, which this tab never renders), so
  // passing it here would have been inert, not a second live-spots query
  // (PR #615 review finding 5).
  const feed = useMapSpotFeed({
    grid: station?.grid,
    enabled: layers.spots || layers.spotTraces || layers.gridActivity || layers.spectrumRing,
    sources,
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
        onChange={(value) => patchViewFilters({ spotLimit: Number(value) })}
        options={choices.map((value) => ({ value: String(value), label: String(value) }))}
      />
      <HamClockSegmented
        label="Map spot age"
        value={String(personal ? feed.station.view.minutes : age)}
        onChange={(value) => {
          if (personal) {
            feed.station.view.setMinutes(Number(value) as PskWindowMinutes);
            return;
          }
          // `setAge` only widens the ingest window (`mapStore.spotAgeMinutes`);
          // the renderer independently caps at the bound view's own
          // `filters.maxAgeMinutes` (default 30), so a wider ingest window
          // alone never surfaces older spots on the map (PR #615 review
          // finding 4). Patch both together.
          setAge(Number(value));
          patchViewFilters({ maxAgeMinutes: Number(value) });
        }}
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
