import { OperatorProfile, Surface } from "propulse";

// className only — callsign, grid, license class, and the active VFO all
// come from useUserStore/useOperatingStore, which default to station: null
// in this sandbox (no persisted QTH). OperatorProfile renders its own
// honest "No station configured" branch before any of the VFO chrome.
export function Empty() {
  return (
    <Surface style={{ width: 340, height: 160 }}>
      <OperatorProfile />
    </Surface>
  );
}

// Real call site: PropSphere top row, full-width h-full.
export function TopRow() {
  return (
    <Surface style={{ width: 640, height: 120 }}>
      <OperatorProfile className="h-full" />
    </Surface>
  );
}
