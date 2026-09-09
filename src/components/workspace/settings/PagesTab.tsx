import { useState } from "react";
import { Button, ReorderControls } from "@/components/station-ui";
import { HamClockSegmented, HamClockToggleRow } from "@/components/map/hamclock/wall/controls";
import { useActiveWorkspace, useWorkspaceStore } from "@/stores/workspaceStore";

/** How many page rows `HamClockDialog`'s fixed-height, non-scrolling body shows at once (owner rule: no in-widget scrolling — see `EmptyRailButton`'s identical `ROWS_PER_PAGE` pattern). */
const ROWS_PER_PAGE = 6;

type DwellSeconds = "15" | "30" | "60" | "120";
const DWELL_OPTIONS: { value: DwellSeconds; label: string }[] = [
  { value: "15", label: "15 S" },
  { value: "30", label: "30 S" },
  { value: "60", label: "60 S" },
  { value: "120", label: "120 S" },
];

/**
 * Page CRUD/reorder plus auto-page (#657). Pages pin to the workspace (epic
 * #652 decision 2) — there is no "move to another workspace" here, only
 * add / rename / reorder / remove within this one. Reordering uses
 * `ReorderControls` (station-ui's up/down icon buttons), never
 * drag-and-drop (owner rule 8).
 */
export function PagesTab() {
  const workspace = useActiveWorkspace();
  const addPage = useWorkspaceStore((s) => s.addPage);
  const removePage = useWorkspaceStore((s) => s.removePage);
  const renamePage = useWorkspaceStore((s) => s.renamePage);
  const movePage = useWorkspaceStore((s) => s.movePage);
  const setActivePage = useWorkspaceStore((s) => s.setActivePage);
  const setAutoPage = useWorkspaceStore((s) => s.setAutoPage);

  const [pageIndex, setPageIndex] = useState(0);
  const [refusal, setRefusal] = useState<string | null>(null);

  const { pages } = workspace;
  const totalPages = Math.max(1, Math.ceil(pages.length / ROWS_PER_PAGE));
  const clampedPageIndex = Math.min(pageIndex, totalPages - 1);
  const rows = pages.slice(clampedPageIndex * ROWS_PER_PAGE, clampedPageIndex * ROWS_PER_PAGE + ROWS_PER_PAGE);

  function handleRemove(pageId: string) {
    const result = removePage(pageId);
    setRefusal(result.ok ? null : result.reason);
  }

  return (
    <div className="su-stack workspace-settings-pages">
      {refusal && (
        <p className="su-hint" role="alert">
          {refusal}
        </p>
      )}
      <div className="su-stack workspace-settings-page-list">
        {rows.map((page, rowIndex) => {
          const absoluteIndex = clampedPageIndex * ROWS_PER_PAGE + rowIndex;
          return (
            <div key={page.id} className="workspace-settings-page-row">
              <ReorderControls
                label={page.title}
                first={absoluteIndex === 0}
                last={absoluteIndex === pages.length - 1}
                onMoveUp={() => movePage(page.id, "up")}
                onMoveDown={() => movePage(page.id, "down")}
              />
              <input
                className="workspace-settings-page-name"
                aria-label={`${page.title} name`}
                defaultValue={page.title}
                onBlur={(event) => renamePage(page.id, event.currentTarget.value)}
              />
              <span className="su-hint">{`${page.widgetIds.length} widget${page.widgetIds.length === 1 ? "" : "s"}`}</span>
              <Button
                variant={page.id === workspace.activePageId ? "primary" : "secondary"}
                onClick={() => setActivePage(page.id)}
              >
                {page.id === workspace.activePageId ? "ACTIVE" : "GO TO PAGE"}
              </Button>
              <Button variant="quiet" onClick={() => handleRemove(page.id)} disabled={pages.length <= 1}>
                REMOVE
              </Button>
            </div>
          );
        })}
      </div>
      <div className="workspace-add-widget-pager">
        <Button
          variant="quiet"
          onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
          disabled={clampedPageIndex === 0}
        >
          ◀ PREVIOUS
        </Button>
        <span className="su-hint">{`Page ${clampedPageIndex + 1} of ${totalPages}`}</span>
        <Button
          variant="quiet"
          onClick={() => setPageIndex((i) => Math.min(totalPages - 1, i + 1))}
          disabled={clampedPageIndex >= totalPages - 1}
        >
          NEXT ▶
        </Button>
      </div>
      <Button
        variant="primary"
        onClick={() => {
          setRefusal(null);
          addPage();
        }}
      >
        + ADD PAGE
      </Button>
      <HamClockToggleRow
        label="Auto-page"
        detail="Flips through this workspace's pages on a timer"
        checked={workspace.autoPage.enabled}
        onChange={(enabled) => setAutoPage({ ...workspace.autoPage, enabled })}
        options={
          <HamClockSegmented
            label="Dwell"
            value={String(workspace.autoPage.dwellSeconds) as DwellSeconds}
            onChange={(value) => setAutoPage({ ...workspace.autoPage, dwellSeconds: Number(value) })}
            options={DWELL_OPTIONS}
          />
        }
      />
    </div>
  );
}
