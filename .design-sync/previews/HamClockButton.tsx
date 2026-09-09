import { HamClockButton } from "propulse";

/** The wall's one button shape: every clickable action renders through this,
 * always ALL CAPS with a 44px+ hit target. Real call sites: HamClockDialog
 * actions, DisplayTab's "SET HOME", KioskTab's "OPEN KIOSK EDITOR". */
export function Variants() {
  return (
    <div
      style={{
        background: "var(--hc-bg)",
        padding: 16,
        display: "flex",
        gap: 10,
      }}
    >
      <HamClockButton variant="primary">SAVE</HamClockButton>
      <HamClockButton variant="quiet">CANCEL</HamClockButton>
      <HamClockButton variant="danger">DELETE FEED</HamClockButton>
    </div>
  );
}

export function States() {
  return (
    <div
      style={{
        background: "var(--hc-bg)",
        padding: 16,
        display: "flex",
        gap: 10,
      }}
    >
      <HamClockButton variant="primary" busy>
        REFRESH
      </HamClockButton>
      <HamClockButton variant="quiet" disabled>
        SET HOME
      </HamClockButton>
      <HamClockButton variant="primary" size="lg">
        DONE
      </HamClockButton>
    </div>
  );
}
