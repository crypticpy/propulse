/**
 * HamClockSpotsSidebar -- DX Spots content panel for the HamClock sidebar
 *
 * Wraps the existing DXSpotList component inside a compact vertical layout
 * with a header showing live spot count and an optional target-indicator bar
 * when a DX target is set on the map.
 *
 * No props needed -- reads everything from stores.
 */

import { DXSpotList } from "@/components/dx/DXSpotList/DXSpotList";
import { useDXCluster } from "@/hooks/useDXCluster";
import { useMapStore } from "@/stores/mapStore";

// ---------------------------------------------------------------------------
// Crosshair SVG (target indicator icon)
// ---------------------------------------------------------------------------

function CrosshairIcon() {
  return (
    <svg
      className="w-3 h-3 text-plasma-orange shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HamClockSpotsSidebar() {
  // Spot count for the header badge
  const { allSpots } = useDXCluster();
  const spotCount = allSpots?.length ?? 0;

  // Current DX target (if any)
  const target = useMapStore((s) => s.target);

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          {spotCount > 0 && (
            <div className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
          )}
          <span className="text-xs font-medium text-gray-300 uppercase tracking-wider">
            DX Spots
          </span>
        </div>
        <span className="text-xs text-gray-500 font-mono">{spotCount}</span>
      </div>

      {/* ── Target indicator (shown only when a target is set) ── */}
      {target && (
        <div className="px-3 py-1.5 border-b border-plasma-orange/30 bg-plasma-orange/5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <CrosshairIcon />
            <span className="text-xs text-plasma-orange font-medium truncate">
              {target.name || "Target"}
            </span>
            {target.grid && (
              <span className="text-[10px] text-gray-500 shrink-0">
                {target.grid}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Spot list (fills remaining space) ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <DXSpotList
          showFilters={false}
          showHeader={false}
          maxHeight="100%"
          className="!bg-transparent !border-0 !rounded-none"
        />
      </div>
    </div>
  );
}
