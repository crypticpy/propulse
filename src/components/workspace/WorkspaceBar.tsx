import { useState } from "react";
import { Button, Inline } from "@/components/station-ui";
import { useActivePage, useActiveWorkspace } from "@/stores/workspaceStore";
import { CentreOverlay } from "./CentreOverlay";
import { EmptyRailButton } from "./EmptyRailButton";

/**
 * The workspace's top bar: name, a pager slot (the `HamClockPager` idiom —
 * ◀ TITLE n/N ▶ — empty/static until pages exist, #657), and three big
 * spelled-out buttons. ADD WIDGET reuses `EmptyRailButton`'s overlay so the
 * bar offers the same entry point a rail's own button does. PAGES and
 * SETTINGS are placeholder overlays until #657 ships the real panels.
 */
export function WorkspaceBar() {
  const workspace = useActiveWorkspace();
  const page = useActivePage();
  const [pagesOpen, setPagesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="su-surface su-inline workspace-bar">
      <p className="su-eyebrow workspace-bar-name">{workspace.name}</p>
      <div className="workspace-bar-pager" aria-hidden="true">
        <span>◀</span>
        <b>{page.title.toUpperCase()}</b>
        <span>{`1 / ${workspace.pages.length}`}</span>
        <span>▶</span>
      </div>
      <Inline className="workspace-bar-actions">
        <EmptyRailButton pageId={page.id} label="ADD WIDGET" />
        <Button variant="secondary" onClick={() => setPagesOpen(true)}>
          PAGES
        </Button>
        <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
          SETTINGS
        </Button>
      </Inline>
      <CentreOverlay
        open={pagesOpen}
        onClose={() => setPagesOpen(false)}
        title="PAGES"
        purpose="Page management arrives in a later release (#657)."
      >
        <p className="su-hint">Adding, renaming and reordering pages arrives in #657.</p>
      </CentreOverlay>
      <CentreOverlay
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="SETTINGS"
        purpose="Workspace settings arrive in a later release (#657)."
      >
        <p className="su-hint">Workspace-level settings arrive in #657.</p>
      </CentreOverlay>
    </div>
  );
}
