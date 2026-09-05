import { HamClockDialog, HamClockTabs } from "../controls";
import { DisplayTab } from "./DisplayTab";
import { KioskTab } from "./KioskTab";
import { LayersTab, MapTab } from "./PlaceholderTabs";
import { PagesTilesTab } from "./PagesTilesTab";
import { ThemeTab } from "./ThemeTab";

export interface HamClockSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The one centered settings surface for the wall (B5/HW-26), replacing the
 * header's hover-fragile, off-screen-prone popouts (`HamClockDisplaySettings`
 * and the wall controls popout). Layers and Map are placeholders until their
 * registry lands in B6; every other tab is live. Only the active tab's
 * content mounts (`HamClockTabs`), so a tab with heavier dependencies (Kiosk
 * needs a router) never pays its cost until an operator opens it.
 */
export function HamClockSettingsDialog({
  open,
  onClose,
}: HamClockSettingsDialogProps) {
  return (
    <HamClockDialog
      open={open}
      onClose={onClose}
      title="SETTINGS"
      purpose="Display, pages, layers, map and theme for this HamClock wall."
      size="settings"
    >
      <HamClockTabs
        label="Settings"
        tabs={[
          { id: "display", label: "Display", content: <DisplayTab /> },
          {
            id: "pages",
            label: "Pages & Tiles",
            content: <PagesTilesTab />,
          },
          { id: "layers", label: "Layers", content: <LayersTab /> },
          { id: "map", label: "Map", content: <MapTab /> },
          { id: "theme", label: "Theme", content: <ThemeTab /> },
          { id: "kiosk", label: "Kiosk", content: <KioskTab /> },
        ]}
      />
    </HamClockDialog>
  );
}
