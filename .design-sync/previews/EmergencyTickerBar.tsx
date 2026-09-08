import { EmergencyTickerBar, Surface } from "propulse";

// EmergencyTickerBar takes zero props. Its scrolling entries are built
// entirely from alertsStore (default []) and the useSwpcAlerts network hook;
// with no active alerts and no reliable network fetch in this sandbox, the
// component's real render is null (its documented "no active emergency"
// state -- it only mounts a bar when WARNING/CRITICAL alerts exist). There
// is no prop to inject ticker entries.
export function Default() {
  return (
    <Surface style={{ width: 480, height: 80, position: "relative" }}>
      <EmergencyTickerBar />
    </Surface>
  );
}
