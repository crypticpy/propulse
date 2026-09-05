import { HamClockDialog, HamClockTabs } from "../controls";
import { DisplayTab } from "./DisplayTab";
import { KioskTab } from "./KioskTab";
import { LayersTab } from "./LayersTab";
import { MapTab } from "./MapTab";
import { PagesTilesTab } from "./PagesTilesTab";
import { ThemeTab } from "./ThemeTab";

export interface HamClockSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The one centered settings surface for the wall (B5/HW-26), replacing the
 * header's hover-fragile, off-screen-prone popouts (`HamClockDisplaySettings`
 * and the wall controls popout). Layers (HW-21/HW-39) and Map (HW-55) now
 * read from the shared layer registry, same as every other tab. Only the
 * active tab's content mounts (`HamClockTabs`), so a tab with heavier
 * dependencies (Kiosk needs a router) never pays its cost until an operator
 * opens it.
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
