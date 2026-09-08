import { MoonTile } from "propulse";

// No props: gated on useActiveLocation. With no station configured this
// sandbox renders the honest "Set your QTH to see moon rise and set" state.
export function Wall() {
  return (
    <div style={{ width: 340 }}>
      <MoonTile />
    </div>
  );
}

export function Narrow() {
  return (
    <div style={{ width: 220 }}>
      <MoonTile />
    </div>
  );
}
