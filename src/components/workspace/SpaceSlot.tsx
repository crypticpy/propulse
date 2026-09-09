import { getRegistryEntry } from "@/lib/workspace/registry";
import { EmptyRailButton } from "./EmptyRailButton";

/**
 * One placed widget, wherever it lands (space or a rail). Mounting the real
 * wall-tile component here would pull the entire `wall/tiles` barrel (every
 * tile module) into this route's bundle — that barrel is already reachable
 * from the wall route, and a second reachability path makes the bundler
 * split it into a new shared chunk that collides with the app-shell precache
 * glob. Live content wiring is out of scope for the shell (#656); every
 * placed widget shows its registry title in a plain placeholder card for
 * now.
 */
export function WidgetCard({ widgetId }: { widgetId: string }) {
  const entry = getRegistryEntry(widgetId);
  const title = entry?.title ?? widgetId;

  return (
    <div className="su-surface workspace-widget-card" data-testid={`workspace-widget-${widgetId}`}>
      <div className="workspace-widget-placeholder">
        <p className="su-eyebrow">{title}</p>
        <p className="su-hint">Coming soon</p>
      </div>
    </div>
  );
}

export interface SpaceSlotProps {
  /** The hero widget's id, when `autoDock` placed one there this render. */
  widgetId?: string;
  /** The page this slot belongs to — passed through to `EmptyRailButton` when empty. */
  pageId: string;
}

/** The workstation's hero slot: a placed widget, or the big "+ ADD WIDGET" button. */
export function SpaceSlot({ widgetId, pageId }: SpaceSlotProps) {
  return (
    <div className="su-surface workspace-space" data-testid="workspace-space">
      {widgetId ? <WidgetCard widgetId={widgetId} /> : <EmptyRailButton pageId={pageId} />}
    </div>
  );
}
