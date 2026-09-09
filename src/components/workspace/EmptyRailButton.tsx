import { useState } from "react";
import { Button } from "@/components/station-ui";
import { WIDGET_REGISTRY } from "@/lib/workspace/registry";
import { useActivePage, useWorkspaceStore } from "@/stores/workspaceStore";
import { CentreOverlay } from "./CentreOverlay";

export interface EmptyRailButtonProps {
  /** The page a picked widget is added to (`addWidget(pageId, id)`). */
  pageId: string;
  label?: string;
}

/**
 * One big "+ ADD WIDGET" button, shown wherever a rail or the space is
 * empty. Clicking it opens a minimal centred overlay listing every
 * placeable registry id with an "ADD TO THIS PAGE" row — the real picker
 * (with search, densities, previews) is #657; this exists so the shell can
 * be exercised end to end. `autoDock` (via `addWidget`) decides where the
 * widget lands, not this button: owner rule 8 is "click where to add", but
 * targeting a specific rail from the click site is left to the #657 picker.
 *
 * A refusal is shown inline in this same overlay and nothing else happens
 * (epic #652 rule 3: refuse, never evict, never spill).
 */
export function EmptyRailButton({ pageId, label = "+ ADD WIDGET" }: EmptyRailButtonProps) {
  const [open, setOpen] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const addWidget = useWorkspaceStore((s) => s.addWidget);
  // Only one workspace/page is visible at a time in this PR, so the active
  // page's widget list is what "already placed" means here.
  const activePage = useActivePage();

  const placeableEntries = Object.values(WIDGET_REGISTRY).filter(
    (entry) => entry.status !== "planned" && !activePage.widgetIds.includes(entry.id),
  );

  const handleAdd = (widgetId: string) => {
    const result = addWidget(pageId, widgetId);
    if (result.ok) {
      setRefusal(null);
      setOpen(false);
    } else {
      setRefusal(result.reason);
    }
  };

  return (
    <>
      <Button
        variant="primary"
        className="workspace-add-widget-button"
        onClick={() => {
          setRefusal(null);
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <CentreOverlay
        open={open}
        onClose={() => setOpen(false)}
        title="ADD WIDGET"
        purpose="Pick a widget to add to this page. The layout docks it automatically."
      >
        <div className="su-stack workspace-add-widget-list">
          {refusal && (
            <p className="su-hint" role="alert">
              {refusal}
            </p>
          )}
          {placeableEntries.map((entry) => (
            <div key={entry.id} className="su-inline workspace-add-widget-row">
              <span>{entry.title}</span>
              <Button variant="secondary" onClick={() => handleAdd(entry.id)}>
                ADD TO THIS PAGE
              </Button>
            </div>
          ))}
        </div>
      </CentreOverlay>
    </>
  );
}
