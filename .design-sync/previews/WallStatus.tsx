import { WallStatus } from "propulse";

/**
 * WallStatus has no props — every indicator (NET, BRIDGE, RIG, CLUSTER,
 * MODEL) reads a store another hook already fills. With no bridge, rig or
 * cluster connection in the preview harness it renders the real idle/off
 * state for each indicator, matching what the footer shows before an
 * operator connects anything.
 */
export function Default() {
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16 }}>
      <WallStatus />
    </div>
  );
}

export function Wide() {
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16, width: 900 }}>
      <WallStatus />
    </div>
  );
}
