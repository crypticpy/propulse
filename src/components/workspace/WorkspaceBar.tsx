import { lazy, Suspense, useState } from "react";
import { Button, Inline } from "@/components/station-ui";
import { useActivePage, useActiveWorkspace } from "@/stores/workspaceStore";
import type { WorkspaceSettingsTabId } from "./settings/WorkspaceSettingsDialog";
import { EmptyRailButton } from "./EmptyRailButton";
import { PagePager } from "./PagePager";

// Lazy: the settings dialog pulls in every settings tab (heat-map presets,
// recipes, the widget registry walk) up front, none of which the canvas
// itself needs to paint. Loaded only once an operator actually opens it.
const WorkspaceSettingsDialog = lazy(() =>
  import("./settings/WorkspaceSettingsDialog").then((m) => ({ default: m.WorkspaceSettingsDialog })),
);

/**
 * The workspace's top bar: name, the real page pager (`PagePager`, #657,
 * replacing the earlier static "1 / N" placeholder), and three big
 * spelled-out buttons. ADD WIDGET reuses `EmptyRailButton`'s overlay so the
 * bar offers the same entry point a rail's own button does. PAGES and
 * SETTINGS both open `WorkspaceSettingsDialog`, on its Pages and Display
 * tabs respectively.
 */
export function WorkspaceBar() {
  const workspace = useActiveWorkspace();
  const page = useActivePage();
  const [settingsTab, setSettingsTab] = useState<WorkspaceSettingsTabId | null>(null);

  return (
    <div className="su-surface su-inline workspace-bar">
      <p className="su-eyebrow workspace-bar-name">{workspace.name}</p>
      <PagePager />
      <Inline className="workspace-bar-actions">
        <EmptyRailButton pageId={page.id} label="ADD WIDGET" />
        <Button variant="secondary" onClick={() => setSettingsTab("pages")}>
          PAGES
        </Button>
        <Button variant="secondary" onClick={() => setSettingsTab("display")}>
          SETTINGS
        </Button>
      </Inline>
      {settingsTab && (
        <Suspense fallback={null}>
          <WorkspaceSettingsDialog open onClose={() => setSettingsTab(null)} defaultTab={settingsTab} />
        </Suspense>
      )}
    </div>
  );
}
