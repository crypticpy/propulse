import { autoDock } from "@/lib/workspace/autoDock";
import { canvasRulesFor } from "@/lib/workspace/canvasRules";
import type { RailSide, RailState, RailWidth } from "@/lib/workspace/types";
import { useActivePage, useActiveWorkspace, useWorkspaceStore } from "@/stores/workspaceStore";
import { RailSlot } from "./RailSlot";
import { SpaceSlot } from "./SpaceSlot";

/** Rail pixel width per width step (workstation "desk" numbers have no exact px spec; a proposed default, same spirit as the rail weight budgets in `canvasRules.ts`). */
const RAIL_WIDTH_PX: Record<RailWidth, number> = { narrow: 200, normal: 280, wide: 380 };
/** A collapsed rail still shows its "SHOW ... RAIL" handle at this width. */
const RAIL_COLLAPSED_PX = 56;
const BOTTOM_RAIL_HEIGHT_PX = 180;

function railPx(state: RailState | undefined): number {
  if (!state) return 0;
  return state.collapsed ? RAIL_COLLAPSED_PX : RAIL_WIDTH_PX[state.width];
}

/**
 * The workstation shell: applies `canvasRulesFor("workstation")`, runs
 * `autoDock` over the active page's stored widget ids to find out where
 * each one landed, and lays out `SpaceSlot` + `RailSlot`s in a CSS grid
 * sized by each rail's width step / collapsed state.
 */
export function WorkspaceCanvas() {
  const workspace = useActiveWorkspace();
  const page = useActivePage();
  const setRailCollapsed = useWorkspaceStore((s) => s.setRailCollapsed);
  const setRailWidth = useWorkspaceStore((s) => s.setRailWidth);

  const rules = canvasRulesFor(workspace.canvasType);
  const dock = autoDock(page.widgetIds, rules);

  const spaceWidgetId = dock.placements.find((p) => p.slot.kind === "space")?.widgetId;
  const widgetIdsFor = (side: RailSide) =>
    dock.placements
      .filter((p) => p.slot.kind === "rail" && p.slot.side === side)
      .map((p) => p.widgetId);

  const leftRail = rules.rails.find((r) => r.side === "left");
  const rightRail = rules.rails.find((r) => r.side === "right");
  const bottomRail = rules.rails.find((r) => r.side === "bottom");

  const leftState = workspace.rails.find((r) => r.side === "left");
  const rightState = workspace.rails.find((r) => r.side === "right");
  const bottomState = workspace.rails.find((r) => r.side === "bottom");

  return (
    <div
      className="workspace-canvas"
      style={{
        display: "grid",
        gap: "0.75rem",
        gridTemplateColumns: `${railPx(leftState)}px 1fr ${railPx(rightState)}px`,
        gridTemplateRows: `1fr ${bottomRail ? (bottomState?.collapsed ? RAIL_COLLAPSED_PX : BOTTOM_RAIL_HEIGHT_PX) : 0}px`,
      }}
    >
      {leftRail && leftState && (
        <div style={{ gridColumn: 1, gridRow: 1 }}>
          <RailSlot
            rail={leftRail}
            state={leftState}
            widgetIds={widgetIdsFor("left")}
            pageId={page.id}
            onToggleCollapsed={() => setRailCollapsed("left", !leftState.collapsed)}
            onSetWidth={(width) => setRailWidth("left", width)}
          />
        </div>
      )}
      <div style={{ gridColumn: 2, gridRow: 1 }}>
        <SpaceSlot widgetId={spaceWidgetId} pageId={page.id} />
      </div>
      {rightRail && rightState && (
        <div style={{ gridColumn: 3, gridRow: 1 }}>
          <RailSlot
            rail={rightRail}
            state={rightState}
            widgetIds={widgetIdsFor("right")}
            pageId={page.id}
            onToggleCollapsed={() => setRailCollapsed("right", !rightState.collapsed)}
            onSetWidth={(width) => setRailWidth("right", width)}
          />
        </div>
      )}
      {bottomRail && bottomState && (
        <div style={{ gridColumn: "1 / span 3", gridRow: 2 }}>
          <RailSlot
            rail={bottomRail}
            state={bottomState}
            widgetIds={widgetIdsFor("bottom")}
            pageId={page.id}
            onToggleCollapsed={() => setRailCollapsed("bottom", !bottomState.collapsed)}
            onSetWidth={(width) => setRailWidth("bottom", width)}
          />
        </div>
      )}
    </div>
  );
}
