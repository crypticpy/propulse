import { BestBandTile } from "propulse";

// No props: gated on useActiveLocation (the operator's QTH from
// userStore). This sandbox has no station configured, so it renders the
// tile's real "SET HOME IN SETTINGS" neutral state (wall spec §7, HW-53) —
// not an error, the documented behaviour for no QTH.
export function Wall() {
  return (
    <div style={{ width: 340 }}>
      <BestBandTile />
    </div>
  );
}

export function Narrow() {
  return (
    <div style={{ width: 220 }}>
      <BestBandTile />
    </div>
  );
}
