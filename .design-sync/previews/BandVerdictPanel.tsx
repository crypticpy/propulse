import { BandVerdictPanel } from "propulse";

// No props: entirely driven by useBandVerdicts/useBandActivity/useBandLadder
// hooks + verdictStore. With no live SFI/Kp feed in this sandbox,
// useBandVerdicts.ready stays false and the panel renders its own honest
// "Waiting for solar data…" branch — the same state the app shows on first
// load before the physics inputs arrive. Two widths show the wrap behaviour.
export function Wall() {
  return (
    <div style={{ width: 420 }}>
      <BandVerdictPanel />
    </div>
  );
}

export function Narrow() {
  return (
    <div style={{ width: 260 }}>
      <BandVerdictPanel />
    </div>
  );
}
