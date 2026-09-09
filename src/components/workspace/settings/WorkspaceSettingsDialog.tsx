import { HamClockTabs } from "@/components/map/hamclock/wall/controls";
import "../workspace-settings.css";
import { CentreOverlay } from "../CentreOverlay";
import { DisplayTab } from "./DisplayTab";
import { PagesTab } from "./PagesTab";
import { RecipesTab } from "./RecipesTab";
import { WidgetsTab } from "./WidgetsTab";

export type WorkspaceSettingsTabId = "pages" | "widgets" | "recipes" | "display";

export interface WorkspaceSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  /** Which tab opens first — `WorkspaceBar`'s PAGES and SETTINGS buttons both open this dialog, on different tabs. */
  defaultTab?: WorkspaceSettingsTabId;
}

/**
 * The one centred settings surface for a workspace (#657), built the same
 * way the wall's `HamClockSettingsDialog` is: `HamClockDialog` (via
 * `CentreOverlay`, the workspace's own thin wrapper) plus `HamClockTabs`.
 * PagesTab owns page CRUD/reorder and auto-page; WidgetsTab is the picker
 * (click-to-add, then an EDIT mode for MAKE HERO / MOVE TO RAIL / REMOVE and
 * the rail ON/OFF toggles); RecipesTab seeds a new page from a starter
 * layout; DisplayTab carries the heat-map preset/thresholds/colours, text
 * size, per-rail width and this workspace's visible bands (owner round 2).
 */
export function WorkspaceSettingsDialog({ open, onClose, defaultTab = "pages" }: WorkspaceSettingsDialogProps) {
  return (
    <CentreOverlay
      open={open}
      onClose={onClose}
      title="WORKSPACE SETTINGS"
      purpose="Pages, widgets, recipes and display for this workspace."
    >
      <HamClockTabs
        label="Workspace settings"
        orientation="vertical"
        defaultActive={defaultTab}
        tabs={[
          { id: "pages", label: "Pages", content: <PagesTab /> },
          { id: "widgets", label: "Widgets", content: <WidgetsTab /> },
          { id: "recipes", label: "Recipes", content: <RecipesTab /> },
          { id: "display", label: "Display", content: <DisplayTab /> },
        ]}
      />
    </CentreOverlay>
  );
}
