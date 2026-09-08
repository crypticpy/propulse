import { PropagationForecast } from "propulse";

// PropagationForecast reads its station and target from useUserStore /
// useMapStore with no props to set either — DsProvider mounts a fresh store
// with no persisted station, so the "no QTH configured" empty state below is
// the only state reachable without hacking localStorage/stores (disallowed
// by the wave brief). See learnings for the note.
export function NoStationConfigured() {
  return (
    <div style={{ width: 320 }}>
      <PropagationForecast displayTime={new Date()} />
    </div>
  );
}
