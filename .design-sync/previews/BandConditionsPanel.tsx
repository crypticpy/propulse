import { BandConditionsPanel, Surface } from "propulse";

// BandConditionsPanel only takes displayTime/className/compact + panel-chrome
// callbacks -- the actual per-band verdicts come from the map/band stores.
// This sandbox has no station/path set, so this is the honest default state
// the floating panel shows before a target is picked.
export function Default() {
  return (
    <Surface style={{ width: 320, height: 420 }}>
      <BandConditionsPanel displayTime={new Date("2026-09-08T18:00:00Z")} />
    </Surface>
  );
}

export function Compact() {
  return (
    <Surface style={{ width: 320, height: 200 }}>
      <BandConditionsPanel
        displayTime={new Date("2026-09-08T18:00:00Z")}
        compact
      />
    </Surface>
  );
}
