import { HamClockTabs } from "propulse";

/** Remote-friendly tab strip (arrow keys move focus, Enter/Space commits).
 * Real call site: HamClockSettingsDialog's vertical settings tabs. */
export function Vertical() {
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16, width: 420 }}>
      <HamClockTabs
        label="Settings"
        orientation="vertical"
        defaultActive="display"
        tabs={[
          {
            id: "view",
            label: "View",
            content: <p className="hcc-kiosk-summary">Flat map · WALL density.</p>,
          },
          {
            id: "display",
            label: "Display",
            content: <p className="hcc-kiosk-summary">Units: AUTO · Map content: ACTIVITY.</p>,
          },
          {
            id: "layers",
            label: "Layers",
            content: <p className="hcc-kiosk-summary">MUF, Aurora and DRAP overlays enabled.</p>,
          },
        ]}
      />
    </div>
  );
}

export function Horizontal() {
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16, width: 420 }}>
      <HamClockTabs
        label="Report tabs"
        orientation="horizontal"
        defaultActive="10m"
        tabs={[
          {
            id: "20m",
            label: "20M",
            content: <p className="hcc-kiosk-summary">SFI 142 · Kp 3 · reliability 78%.</p>,
          },
          {
            id: "15m",
            label: "15M",
            content: <p className="hcc-kiosk-summary">SFI 142 · Kp 3 · reliability 61%.</p>,
          },
          {
            id: "10m",
            label: "10M",
            content: <p className="hcc-kiosk-summary">SFI 142 · Kp 3 · reliability 34%.</p>,
          },
        ]}
      />
    </div>
  );
}
