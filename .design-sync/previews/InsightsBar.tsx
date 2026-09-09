import { InsightsBar } from "propulse";

// displayTime is the only settable prop; the four sections (Cluster/Log/
// Bands/History) read useDXStore/useLogbook/useSolarFlux/useKIndex directly.
// With none hydrated in this sandbox each section renders its own honest
// zero/N-A state — the real first-load strip before any feed arrives.
export function Strip() {
  return (
    <div style={{ width: 640 }}>
      <InsightsBar displayTime={new Date()} />
    </div>
  );
}

export function Narrow() {
  return (
    <div style={{ width: 380 }}>
      <InsightsBar displayTime={new Date()} />
    </div>
  );
}
