import { PropagationForecastMini } from "propulse";

// PropagationForecastMini reads station/target from stores with no props to
// set them — DsProvider has no persisted station, so this is the honest
// empty state (station/solar-data-unavailable text), same constraint as
// PropagationForecast. See learnings.
export function NoTargetSelected() {
  return (
    <div style={{ width: 640, height: 220 }}>
      <PropagationForecastMini displayTime={new Date()} className="h-full" />
    </div>
  );
}
