import { WSJTXStatusPanel } from "propulse";

// className/defaultCollapsed only — connection + decodes come from
// useWSJTXStore, which has no bridge connection in this sandbox. Renders the
// component's own honest "WSJT-X not connected" guidance, same as a desk
// with the ProPulse Bridge not running.
export function Expanded() {
  return (
    <div style={{ width: 420 }}>
      <WSJTXStatusPanel />
    </div>
  );
}

export function Collapsed() {
  return (
    <div style={{ width: 420 }}>
      <WSJTXStatusPanel defaultCollapsed />
    </div>
  );
}
