import { ActivationsTile } from "propulse";

// No props: sources live POTA/SOTA spots from useActivationSpots (React
// Query). This sandbox has no network feed running, so it renders the
// honest "reading feeds" empty-count state — a real, styled wall
// composition rather than a blank card. Two widths show the rail's real
// 18vw-of-viewport footprint next to a narrower deployment.
export function Wall() {
  return (
    <div style={{ width: 340 }}>
      <ActivationsTile />
    </div>
  );
}

export function Narrow() {
  return (
    <div style={{ width: 220 }}>
      <ActivationsTile />
    </div>
  );
}
