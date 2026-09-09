import "./workspace.css";
import { autoDock } from "@/lib/workspace/autoDock";
import { canvasRulesFor } from "@/lib/workspace/canvasRules";
import type { RailSide, RailState, RailWidth } from "@/lib/workspace/types";
import {
  useActivePage,
  useActiveWorkspace,
  useEffectiveCanvasType,
  useWorkspaceStore,
} from "@/stores/workspaceStore";
import { RailSlot } from "./RailSlot";
import { SpaceSlot } from "./SpaceSlot";

/** Left/right rail pixel width per width step (workstation "desk" numbers have no exact px spec; a proposed default, same spirit as the rail weight budgets in `canvasRules.ts`). */
const RAIL_WIDTH_PX: Record<RailWidth, number> = { narrow: 200, normal: 280, wide: 380 };
/** A collapsed rail still shows its "SHOW ... RAIL" handle at this width/height. */
const RAIL_COLLAPSED_PX = 56;
/** Bottom rail row height per width step — same three steps as the side rails, so the width control has a visible effect there too. */
const BOTTOM_RAIL_HEIGHT_PX: Record<RailWidth, number> = { narrow: 120, normal: 180, wide: 260 };

function railPx(state: RailState | undefined): number {
  if (!state) return 0;
  return state.collapsed ? RAIL_COLLAPSED_PX : RAIL_WIDTH_PX[state.width];
}

function bottomRailPx(state: RailState | undefined): number {
  if (!state) return 0;
  return state.collapsed ? RAIL_COLLAPSED_PX : BOTTOM_RAIL_HEIGHT_PX[state.width];
}

/**
 * The workspace shell: applies `canvasRulesFor(useEffectiveCanvasType())`
 * (#686 review — the override `WorkspacePage` sets on a narrower viewport,
 * else the workspace's own stored `canvasType`; see `workspaceStore.ts`'s
 * `resolveCanvasType` doc comment for why this must be the one shared
 * resolver every rules-consuming surface reads, not a prop threaded only
 * through this component), runs `autoDock` over the active page's stored
 * widget ids to find out where each one landed, and lays out `SpaceSlot` +
 * `RailSlot`s in a CSS grid sized by each rail's width step / collapsed
 * state. Rail *state* (collapsed/width) still comes from the stored
 * `workspace.rails`, matched by side — tablet only declares a `right` rail,
 * which the workstation-shaped store state already has, so no migration is
 * needed. Trade-off, accepted per `autoDock`'s own "refuse honestly, never
 * crash" contract: a widget docked under workstation's wider rail budgets
 * can be refused when re-evaluated here under tablet's narrower
 * single-rail budget, rather than silently dropped or spilled.
 */
export function WorkspaceCanvas() {
  const workspace = useActiveWorkspace();
  const page = useActivePage();
  const setRailCollapsed = useWorkspaceStore((s) => s.setRailCollapsed);
  const setRailWidth = useWorkspaceStore((s) => s.setRailWidth);
  const canvasType = useEffectiveCanvasType();

  const rules = canvasRulesFor(canvasType);
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
        // Guard on whether the canvas's rules *declare* the rail, not just
        // on rail state: tablet's stored rail state is the workstation
        // shape (left/right/bottom all present, #686 review P1) even though
        // tablet rules declare only `right`, so gating on state alone left a
        // dead 280px left gutter on tablet. Mirrors the row template's own
        // `bottomRail ? ... : 0` guard below.
        gridTemplateColumns: `${leftRail ? railPx(leftState) : 0}px 1fr ${rightRail ? railPx(rightState) : 0}px`,
        gridTemplateRows: `1fr ${bottomRail ? bottomRailPx(bottomState) : 0}px`,
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
