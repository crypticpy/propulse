import { railOrientation } from "@/lib/workspace/canvasRules";
import type { RailSpec, RailState, RailWidth } from "@/lib/workspace/types";
import { Button } from "@/components/station-ui";
import { EmptyRailButton } from "./EmptyRailButton";
import { WidgetCard } from "./SpaceSlot";

const WIDTH_STEPS: readonly RailWidth[] = ["narrow", "normal", "wide"];

function railLabel(side: RailSpec["side"]): string {
  return `${side.charAt(0).toUpperCase()}${side.slice(1)} rail`;
}

export interface RailSlotProps {
  rail: RailSpec;
  state: RailState;
  /** Widget ids `autoDock` placed on this rail, in placement order. */
  widgetIds: readonly string[];
  pageId: string;
  onToggleCollapsed: () => void;
  onSetWidth: (width: RailWidth) => void;
}

/**
 * One rail (left / right / bottom). Collapsed is a drawer pull-tab: only the
 * "SHOW ... RAIL" handle remains, nothing inside is rendered (owner rule:
 * rails collapse like a drawer on click and pull back out). Expanded shows
 * the rail's label, its collapse handle, the narrow/normal/wide width step
 * (`applyRailWidth`, called by the store), and either its placed widgets or
 * one big "+ ADD WIDGET" button when the rail is empty.
 */
export function RailSlot({ rail, state, widgetIds, pageId, onToggleCollapsed, onSetWidth }: RailSlotProps) {
  const label = railLabel(rail.side);

  if (state.collapsed) {
    return (
      <div
        className={`su-surface workspace-rail workspace-rail--collapsed workspace-rail--${rail.side}`}
        data-testid={`workspace-rail-${rail.side}`}
      >
        <Button variant="quiet" onClick={onToggleCollapsed}>
          {`SHOW ${rail.side.toUpperCase()} RAIL`}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`su-surface workspace-rail workspace-rail--${railOrientation(rail.side)} workspace-rail--${rail.side}`}
      data-testid={`workspace-rail-${rail.side}`}
    >
      <div className="su-inline workspace-rail-head">
        <p className="su-eyebrow">{label}</p>
        <Button variant="quiet" onClick={onToggleCollapsed}>
          {`HIDE ${rail.side.toUpperCase()} RAIL`}
        </Button>
      </div>
      <div className="su-inline workspace-rail-width" role="group" aria-label={`${label} width`}>
        {WIDTH_STEPS.map((step) => (
          <Button key={step} variant={state.width === step ? "primary" : "secondary"} onClick={() => onSetWidth(step)}>
            {step.toUpperCase()}
          </Button>
        ))}
      </div>
      <div className="su-stack workspace-rail-body">
        {widgetIds.length === 0 ? (
          <EmptyRailButton pageId={pageId} context="rail" />
        ) : (
          widgetIds.map((id) => <WidgetCard key={id} widgetId={id} />)
        )}
      </div>
    </div>
  );
}
