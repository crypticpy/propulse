import { GreyLineTile } from "propulse";

// No props: gated on useActiveLocation. With no station configured this
// sandbox renders the honest "SET HOME IN SETTINGS" state.
export function Wall() {
  return (
    <div style={{ width: 340 }}>
      <GreyLineTile />
    </div>
  );
}

export function Narrow() {
  return (
    <div style={{ width: 220 }}>
      <GreyLineTile />
    </div>
  );
}
