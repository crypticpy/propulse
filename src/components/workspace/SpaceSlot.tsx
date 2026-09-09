import { Suspense } from "react";
import { getRegistryEntry } from "@/lib/workspace/registry";
import { EmptyRailButton } from "./EmptyRailButton";
import { getWidgetComponent } from "./widgetLoaders";

/** The "coming soon" card shown for a widget id with no live form yet, and as
 * the Suspense fallback while a live tile's chunk is still loading (#670). */
function PlaceholderBody({ title }: { title: string }) {
  return (
    <div className="workspace-widget-placeholder">
      <p className="su-eyebrow">{title}</p>
      <p className="su-hint">Coming soon</p>
    </div>
  );
}

/**
 * One placed widget, wherever it lands (space or a rail). Densities other
 * than "work" have no live form yet (`widgetLoaders.ts`), so most ids still
 * fall back to a plain placeholder card showing the registry title.
 */
export function WidgetCard({ widgetId }: { widgetId: string }) {
  const entry = getRegistryEntry(widgetId);
  const title = entry?.title ?? widgetId;
  const LiveTile = getWidgetComponent(widgetId, "work");

  return (
    <div className="su-surface workspace-widget-card" data-testid={`workspace-widget-${widgetId}`}>
      {LiveTile ? (
        <Suspense fallback={<PlaceholderBody title={title} />}>
          <LiveTile />
        </Suspense>
      ) : (
        <PlaceholderBody title={title} />
      )}
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
      {widgetId ? <WidgetCard widgetId={widgetId} /> : <EmptyRailButton pageId={pageId} context="space" />}
    </div>
  );
}
