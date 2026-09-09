import { SdrScopeTile } from "propulse";

/**
 * SdrScopeTile takes an optional `title` override; the live spectrum comes
 * from the SDR store, which nothing feeds without a connected receiver in
 * this harness. It renders the designed "NO RECEIVER" idle state.
 */
export function Default() {
  return (
    <div style={{ width: 480, height: 300, background: "var(--hc-bg)" }}>
      <SdrScopeTile />
    </div>
  );
}

export function CustomTitle() {
  return (
    <div style={{ width: 320, height: 260, background: "var(--hc-bg)" }}>
      <SdrScopeTile title="Panadapter" />
    </div>
  );
}
