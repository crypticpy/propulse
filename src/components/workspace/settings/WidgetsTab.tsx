import { useState } from "react";
import { Button } from "@/components/station-ui";
import { HamClockSegmented, HamClockToggleRow } from "@/components/map/hamclock/wall/controls";
import { autoDock } from "@/lib/workspace/autoDock";
import { canvasRulesFor, railOrientation } from "@/lib/workspace/canvasRules";
import { getRegistryEntry, WIDGET_REGISTRY } from "@/lib/workspace/registry";
import type { CanvasRules, WidgetRegistryEntry } from "@/lib/workspace/types";
import { useActivePage, useActiveWorkspace, useWorkspaceStore } from "@/stores/workspaceStore";

/** Matches `EmptyRailButton`'s own eligibility check (context "any") — every widget that could dock somewhere on this canvas, hero or rail. */
function isPlaceable(entry: WidgetRegistryEntry, rules: CanvasRules): boolean {
  const spaceCompatible = rules.heroAllowed && rules.heroDensity !== null && entry.canSpace && entry.densities.includes(rules.heroDensity);
  const railCompatible = entry.densities.some((density) => rules.railDensities.includes(density));
  return spaceCompatible || railCompatible;
}

function heroEligible(entry: WidgetRegistryEntry, rules: CanvasRules): boolean {
  return rules.heroAllowed && rules.heroDensity !== null && entry.canSpace && entry.densities.includes(rules.heroDensity);
}

function placementLabel(widgetId: string, dock: ReturnType<typeof autoDock>): string {
  const placement = dock.placements.find((p) => p.widgetId === widgetId);
  if (!placement) {
    const refusal = dock.refusals.find((r) => r.widgetId === widgetId);
    return refusal ? "Doesn't fit" : "Not placed";
  }
  if (placement.slot.kind === "space") return "Hero";
  if (placement.slot.kind === "rail") return `${placement.slot.side.charAt(0).toUpperCase()}${placement.slot.side.slice(1)} rail`;
  return "Placed";
}

const ROWS_PER_PAGE = 6;
type Section = "page" | "add" | "rails";

/**
 * The widget picker, EDIT mode and rail toggles in one tab (#657 — merged
 * with `WidgetsTab` to stay inside the issue's file budget). Owner rules:
 * click-to-add only, no drag-and-drop; ADD WIDGET stays the primary action
 * until a side is full, and this tab's "ON THIS PAGE" section is the EDIT
 * mode that removes a widget or, for a hero-eligible one, moves it between
 * the space and a rail. MAKE HERO / MOVE TO RAIL reorder `page.widgetIds`
 * (`setWidgetOrder`) — `autoDock` (pure, owned by #655) always docks the
 * *first* eligible hero-capable widget into the space, so this is the whole
 * mechanism; see `workspaceStore.ts`'s docblock for the one case where it is
 * a no-op (a widget that is the page's only hero-eligible one stays hero
 * either way).
 */
export function WidgetsTab() {
  const [section, setSection] = useState<Section>("page");
  const workspace = useActiveWorkspace();
  const page = useActivePage();
  const addWidget = useWorkspaceStore((s) => s.addWidget);
  const removeWidget = useWorkspaceStore((s) => s.removeWidget);
  const setWidgetOrder = useWorkspaceStore((s) => s.setWidgetOrder);
  const setRailCollapsed = useWorkspaceStore((s) => s.setRailCollapsed);

  const rules = canvasRulesFor(workspace.canvasType);
  const dock = autoDock(page.widgetIds, rules);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [addPageIndex, setAddPageIndex] = useState(0);

  function moveToFront(widgetId: string) {
    const result = setWidgetOrder(page.id, [widgetId, ...page.widgetIds.filter((id) => id !== widgetId)]);
    setRefusal(result.ok ? null : result.reason);
  }
  function moveToEnd(widgetId: string) {
    const result = setWidgetOrder(page.id, [...page.widgetIds.filter((id) => id !== widgetId), widgetId]);
    setRefusal(result.ok ? null : result.reason);
  }

  const placeableEntries = Object.values(WIDGET_REGISTRY).filter(
    (entry) => entry.status !== "planned" && !page.widgetIds.includes(entry.id) && isPlaceable(entry, rules),
  );
  const addTotalPages = Math.max(1, Math.ceil(placeableEntries.length / ROWS_PER_PAGE));
  const clampedAddPageIndex = Math.min(addPageIndex, addTotalPages - 1);
  const addRows = placeableEntries.slice(
    clampedAddPageIndex * ROWS_PER_PAGE,
    clampedAddPageIndex * ROWS_PER_PAGE + ROWS_PER_PAGE,
  );

  return (
    <div className="su-stack workspace-settings-widgets">
      <HamClockSegmented
        label="Section"
        hideLabel
        value={section}
        onChange={setSection}
        options={[
          { value: "page", label: "ON THIS PAGE" },
          { value: "add", label: "ADD WIDGET" },
          { value: "rails", label: "RAILS" },
        ]}
      />

      {section === "page" && (
        <div className="su-stack workspace-settings-widget-list">
          {refusal && (
            <p className="su-hint" role="alert">
              {refusal}
            </p>
          )}
          {page.widgetIds.length === 0 && <p className="su-hint">This page has no widgets yet. Add one from the ADD WIDGET section.</p>}
          {page.widgetIds.map((widgetId) => {
            const entry = getRegistryEntry(widgetId);
            const title = entry?.title ?? widgetId;
            const isHero = dock.placements.some((p) => p.widgetId === widgetId && p.slot.kind === "space");
            const canHero = entry ? heroEligible(entry, rules) : false;
            return (
              <div key={widgetId} className="workspace-settings-widget-row">
                <div className="workspace-add-widget-row-text">
                  <p className="workspace-add-widget-row-title">{title}</p>
                  <p className="su-hint workspace-add-widget-row-desc">{placementLabel(widgetId, dock)}</p>
                </div>
                {canHero && !isHero && (
                  <Button variant="secondary" onClick={() => moveToFront(widgetId)}>
                    MAKE HERO
                  </Button>
                )}
                {canHero && isHero && (
                  <Button variant="secondary" onClick={() => moveToEnd(widgetId)}>
                    MOVE TO RAIL
                  </Button>
                )}
                <Button variant="quiet" onClick={() => removeWidget(page.id, widgetId)}>
                  REMOVE
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {section === "add" && (
        <div className="su-stack workspace-settings-widget-list">
          {refusal && (
            <p className="su-hint" role="alert">
              {refusal}
            </p>
          )}
          {addRows.map((entry) => (
            <div key={entry.id} className="workspace-settings-widget-row">
              <div className="workspace-add-widget-row-text">
                <p className="workspace-add-widget-row-title">{entry.title}</p>
              </div>
              <Button
                variant="primary"
                onClick={() => {
                  const result = addWidget(page.id, entry.id);
                  setRefusal(result.ok ? null : result.reason);
                }}
              >
                ADD TO THIS PAGE
              </Button>
            </div>
          ))}
          <div className="workspace-add-widget-pager">
            <Button variant="quiet" onClick={() => setAddPageIndex((i) => Math.max(0, i - 1))} disabled={clampedAddPageIndex === 0}>
              ◀ PREVIOUS
            </Button>
            <span className="su-hint">{`Page ${clampedAddPageIndex + 1} of ${addTotalPages}`}</span>
            <Button
              variant="quiet"
              onClick={() => setAddPageIndex((i) => Math.min(addTotalPages - 1, i + 1))}
              disabled={clampedAddPageIndex >= addTotalPages - 1}
            >
              NEXT ▶
            </Button>
          </div>
        </div>
      )}

      {section === "rails" && (
        <div className="su-stack workspace-settings-rail-list">
          {rules.rails.map((rail) => {
            const state = workspace.rails.find((r) => r.side === rail.side);
            if (!state) return null;
            const label = `${rail.side.charAt(0).toUpperCase()}${rail.side.slice(1)} rail`;
            return (
              <HamClockToggleRow
                key={rail.side}
                label={label}
                detail={`${railOrientation(rail.side) === "vertical" ? "Side" : "Bottom"} rail, ${rail.weightBudget} slot budget`}
                checked={!state.collapsed}
                onChange={(on) => setRailCollapsed(rail.side, !on)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
