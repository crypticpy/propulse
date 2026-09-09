import { DxTargetTile } from "propulse";

// No props: reads the map's chosen target from useMapStore. No target is
// picked in this sandbox, so it renders the honest "PICK A TARGET ON THE
// MAP" state.
export function Wall() {
  return (
    <div style={{ width: 340 }}>
      <DxTargetTile />
    </div>
  );
}

export function Narrow() {
  return (
    <div style={{ width: 220 }}>
      <DxTargetTile />
    </div>
  );
}
