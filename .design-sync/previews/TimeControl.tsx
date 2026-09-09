import { TimeControl } from "propulse";

export function Default() {
  return (
    <div style={{ width: 320, height: 420 }}>
      <TimeControl />
    </div>
  );
}

export function Narrow() {
  return (
    <div style={{ width: 240, height: 420 }}>
      <TimeControl />
    </div>
  );
}
