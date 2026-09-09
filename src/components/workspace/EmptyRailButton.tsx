import { useState } from "react";
import { Button } from "@/components/station-ui";
import { canvasRulesFor } from "@/lib/workspace/canvasRules";
import { WIDGET_REGISTRY } from "@/lib/workspace/registry";
import type { CanvasRules, WidgetRegistryEntry } from "@/lib/workspace/types";
import { useActivePage, useActiveWorkspace, useWorkspaceStore } from "@/stores/workspaceStore";
import { CentreOverlay } from "./CentreOverlay";

/** How many rows `HamClockDialog`'s fixed-height, non-scrolling body can show at once. */
const ROWS_PER_PAGE = 8;

/**
 * Where this button lives — the picker only offers widgets that can
 * actually land there, mirroring `autoDock`'s own eligibility checks
 * (`autoDock.ts` lines ~65 and ~197-199) rather than a looser guess:
 * - `"space"`: hero-eligible only (`canSpace` and the canvas's `heroDensity`).
 * - `"rail"`: any density the canvas's rails accept (`railDensities`).
 * - `"any"`: either of the above — used by the workspace bar's button,
 *   which does not target one slot (`autoDock` picks where it lands).
 */
export type WidgetPickerContext = "space" | "rail" | "any";

function isCompatible(entry: WidgetRegistryEntry, rules: CanvasRules, context: WidgetPickerContext): boolean {
  const spaceCompatible = rules.heroAllowed && rules.heroDensity !== null && entry.canSpace && entry.densities.includes(rules.heroDensity);
  const railCompatible = entry.densities.some((density) => rules.railDensities.includes(density));
  if (context === "space") return spaceCompatible;
  if (context === "rail") return railCompatible;
  return spaceCompatible || railCompatible;
}

/** A short, factual one-liner built from registry fields — there is no authored `description` field (yet; that is #657's picker). */
function describeEntry(entry: WidgetRegistryEntry): string {
  const place = entry.canSpace ? "Fits the space or a rail" : "Fits a rail";
  const scope = entry.scope === "global" ? "always shown" : `follows the active ${entry.scope}`;
  return `${place}, ${scope}.`;
}

export interface EmptyRailButtonProps {
  /** The page a picked widget is added to (`addWidget(pageId, id)`). */
  pageId: string;
  label?: string;
  /** @default "any" */
  context?: WidgetPickerContext;
}

/**
 * One big "+ ADD WIDGET" button, shown wherever a rail or the space is
 * empty. Clicking it opens a minimal centred overlay listing every
 * compatible registry id with an "ADD TO THIS PAGE" row — the real picker
 * (with search, previews) is #657; this exists so the shell can be
 * exercised end to end. `autoDock` (via `addWidget`) decides where the
 * widget lands, not this button: owner rule 8 is "click where to add", but
 * targeting a specific rail from the click site is left to the #657 picker.
 *
 * `HamClockDialog`'s body is a fixed-height, non-scrolling surface (owner
 * rule: no in-widget scrolling), so the list is paged — `ROWS_PER_PAGE` rows
 * at a time with big "◀ PREVIOUS" / "NEXT ▶" buttons, the `HamClockPager`
 * idiom.
 *
 * A refusal is shown inline in this same overlay and nothing else happens
 * (epic #652 rule 3: refuse, never evict, never spill).
 */
export function EmptyRailButton({ pageId, label = "+ ADD WIDGET", context = "any" }: EmptyRailButtonProps) {
  const [open, setOpen] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const addWidget = useWorkspaceStore((s) => s.addWidget);
  const workspace = useActiveWorkspace();
  // Only one workspace/page is visible at a time in this PR, so the active
  // page's widget list is what "already placed" means here.
  const activePage = useActivePage();
  const rules = canvasRulesFor(workspace.canvasType);

  const placeableEntries = Object.values(WIDGET_REGISTRY).filter(
    (entry) =>
      entry.status !== "planned" &&
      !activePage.widgetIds.includes(entry.id) &&
      isCompatible(entry, rules, context),
  );

  const totalPages = Math.max(1, Math.ceil(placeableEntries.length / ROWS_PER_PAGE));
  const clampedPageIndex = Math.min(pageIndex, totalPages - 1);
  const pageEntries = placeableEntries.slice(
    clampedPageIndex * ROWS_PER_PAGE,
    clampedPageIndex * ROWS_PER_PAGE + ROWS_PER_PAGE,
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
          setPageIndex(0);
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
          {pageEntries.map((entry) => (
            <div key={entry.id} className="workspace-add-widget-row">
              <div className="workspace-add-widget-row-text">
                <p className="workspace-add-widget-row-title">{entry.title}</p>
                <p className="su-hint workspace-add-widget-row-desc">{describeEntry(entry)}</p>
              </div>
              <Button variant="secondary" onClick={() => handleAdd(entry.id)}>
                ADD TO THIS PAGE
              </Button>
            </div>
          ))}
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
        </div>
      </CentreOverlay>
    </>
  );
}
