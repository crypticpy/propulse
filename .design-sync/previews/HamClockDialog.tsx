import { HamClockButton, HamClockDialog, HamClockTabs } from "propulse";

/**
 * The wall's centered settings/report shell (real call site:
 * HamClockSettingsDialog). Authored open, per the brief's overlay
 * instruction — this dialog is portalled and full-viewport by design
 * (AccessibleDialog + inert background), so it is expected to fill the
 * capture card rather than sit flush inside it.
 */
export function SettingsShell() {
  return (
    <HamClockDialog
      open
      onClose={() => {}}
      title="SETTINGS"
      purpose="View, display, pages, layers, spots, map and theme for this wall."
      size="settings"
      hint="SELECT to apply · BACK to cancel"
      actions={<HamClockButton variant="primary">DONE</HamClockButton>}
    >
      <HamClockTabs
        label="Settings"
        orientation="vertical"
        defaultActive="display"
        tabs={[
          {
            id: "view",
            label: "View",
            content: <p className="hcc-kiosk-summary">Flat map · WALL density</p>,
          },
          {
            id: "display",
            label: "Display",
            content: <p className="hcc-kiosk-summary">Units: AUTO · Map content: ACTIVITY</p>,
          },
          {
            id: "spots",
            label: "Spots",
            content: <p className="hcc-kiosk-summary">DX cluster · DXHeat feed</p>,
          },
        ]}
      />
    </HamClockDialog>
  );
}

export function ConfigDialog() {
  return (
    <HamClockDialog
      open
      onClose={() => {}}
      title="NEWS FEEDS"
      purpose="Choose which contest and DXpedition feeds appear on the wall."
      size="config"
      actions={<HamClockButton onClick={() => {}}>DONE</HamClockButton>}
    >
      <p className="hcc-kiosk-summary">
        WA7BNM Contest Calendar and NG3K ADXO are enabled.
      </p>
    </HamClockDialog>
  );
}
