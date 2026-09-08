import { BandActivityTile } from "propulse";

// No props: reads useBandVerdicts/useBandActivity, both live spot-count
// data with no static override. This sandbox has no spot feed connected,
// so it renders the tile's honest "no spots in this scope yet" state.
export function Wall() {
  return (
    <div style={{ width: 340 }}>
      <BandActivityTile />
    </div>
  );
}

export function Narrow() {
  return (
    <div style={{ width: 220 }}>
      <BandActivityTile />
    </div>
  );
}
