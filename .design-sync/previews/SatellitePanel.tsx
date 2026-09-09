import { SatellitePanel } from "propulse";

export function Collapsed() {
  return (
    <div style={{ width: 320 }}>
      <SatellitePanel collapsed onToggleCollapse={() => {}} />
    </div>
  );
}

export function Panel() {
  return (
    <div style={{ width: 320, height: 420 }}>
      <SatellitePanel onToggleCollapse={() => {}} />
    </div>
  );
}
