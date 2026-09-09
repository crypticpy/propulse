import { ISSSkyTracker, Surface } from "propulse";

// ISSSkyTracker takes no props at all -- it computes TLE-based pass
// prediction internally. This sandbox has no orbital data loaded, so this
// is the honest default state on first mount.
export function Default() {
  return (
    <Surface style={{ width: 340, height: 260 }}>
      <ISSSkyTracker />
    </Surface>
  );
}

export function Compact() {
  return (
    <Surface style={{ width: 220, height: 220 }}>
      <ISSSkyTracker />
    </Surface>
  );
}
