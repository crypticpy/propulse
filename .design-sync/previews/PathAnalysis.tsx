import { PathAnalysis, Surface } from "propulse";

// PathAnalysis only takes displayTime/className/collapse+panel-chrome
// callbacks -- the actual worked path (station/DX/band) is read from the
// map store. This sandbox has no path selected, so this is the honest
// default/empty state the floating panel shows before a target is picked.
export function Default() {
  return (
    <Surface style={{ width: 300, height: 380 }}>
      <PathAnalysis displayTime={new Date("2026-09-08T18:00:00Z")} />
    </Surface>
  );
}

export function Collapsed() {
  return (
    <Surface style={{ width: 300 }}>
      <PathAnalysis
        displayTime={new Date("2026-09-08T18:00:00Z")}
        collapsed
        onToggleCollapse={() => {}}
      />
    </Surface>
  );
}
