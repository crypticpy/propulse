/**
 * MapTooltip Component
 *
 * A hover tooltip overlay for map views showing grid information
 * and DX spot activity. Uses glassmorphism styling and smart positioning
 * to stay within viewport bounds.
 */

import { useMemo } from "react";
import { createPortal } from "react-dom";
import type { DXSpot } from "@/types/dxcluster";

export interface MapTooltipProps {
  /** Whether the tooltip is visible */
  visible: boolean;
  /** Screen coordinates for positioning */
  position: { x: number; y: number };
  /** Maidenhead grid locator (e.g., "CN87ML") */
  grid: string;
  /** Optional DX spots in this grid */
  spots?: DXSpot[];
  /** Additional CSS classes */
  className?: string;
}

/** Tooltip dimensions for positioning calculations */
const TOOLTIP_WIDTH = 220;
const TOOLTIP_HEIGHT = 160;
const EDGE_PADDING = 10;

/**
 * Count spots per band and return top bands
 */
function getBandBreakdown(spots: DXSpot[]): { band: string; count: number }[] {
  const bandCounts = new Map<string, number>();

  for (const spot of spots) {
    if (spot.band) {
      bandCounts.set(spot.band, (bandCounts.get(spot.band) || 0) + 1);
    }
  }

  return Array.from(bandCounts.entries())
    .map(([band, count]) => ({ band, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

/**
 * Format frequency for display in MHz
 * @param freqKHz - Frequency in kHz
 * @returns Formatted frequency string with MHz suffix
 */
function formatFrequencyMHz(freqKHz: number): string {
  return `${(freqKHz / 1000).toFixed(3)} MHz`;
}

/**
 * Spot info with callsign and frequency
 */
interface SpotInfo {
  callsign: string;
  frequency: number;
  mode?: string;
}

/**
 * Get recent spots with callsign and frequency
 */
function getRecentSpotInfo(spots: DXSpot[], maxCount: number = 3): SpotInfo[] {
  const sortedSpots = [...spots].sort(
    (a, b) => b.time.getTime() - a.time.getTime(),
  );

  const spotInfos: SpotInfo[] = [];
  const seen = new Set<string>();

  for (const spot of sortedSpots) {
    if (!seen.has(spot.dx)) {
      spotInfos.push({
        callsign: spot.dx,
        frequency: spot.frequency,
        mode: spot.mode,
      });
      seen.add(spot.dx);
      if (spotInfos.length >= maxCount) {
        break;
      }
    }
  }

  return spotInfos;
}

/**
 * MapTooltip Component
 *
 * Renders a tooltip overlay showing grid information and spot activity.
 * Auto-positions to avoid screen edges.
 */
export function MapTooltip({
  visible,
  position,
  grid,
  spots = [],
  className = "",
}: MapTooltipProps) {
  // Calculate adjusted position to keep tooltip on screen
  const adjustedPosition = useMemo(() => {
    const { x, y } = position;
    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : 1920;
    const viewportHeight =
      typeof window !== "undefined" ? window.innerHeight : 1080;

    // Adjust X position - show on left side if too close to right edge
    let adjustedX = x + 15; // Offset from cursor
    if (adjustedX + TOOLTIP_WIDTH > viewportWidth - EDGE_PADDING) {
      adjustedX = x - TOOLTIP_WIDTH - 15;
    }

    // Adjust Y position - show above if too close to bottom
    let adjustedY = y + 10;
    if (adjustedY + TOOLTIP_HEIGHT > viewportHeight - EDGE_PADDING) {
      adjustedY = y - TOOLTIP_HEIGHT - 10;
    }

    // Ensure not negative
    adjustedX = Math.max(EDGE_PADDING, adjustedX);
    adjustedY = Math.max(EDGE_PADDING, adjustedY);

    return { x: adjustedX, y: adjustedY };
  }, [position]);

  // Process spot data
  const spotCount = spots.length;
  const bandBreakdown = useMemo(() => getBandBreakdown(spots), [spots]);
  const recentSpotInfo = useMemo(() => getRecentSpotInfo(spots, 3), [spots]);

  // Don't render if not visible
  if (!visible) {
    return null;
  }

  const tooltipContent = (
    <div
      className={`
        fixed z-50 pointer-events-none
        bg-black/80 backdrop-blur-md
        border border-white/10 rounded-lg
        shadow-xl
        transition-opacity duration-200
        ${visible ? "opacity-100" : "opacity-0"}
        ${className}
      `}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        maxWidth: TOOLTIP_WIDTH,
      }}
    >
      <div className="p-3 space-y-1.5">
        {/* Grid locator header */}
        <div className="text-white font-mono font-bold text-sm">{grid}</div>

        {/* Spot count */}
        {spotCount > 0 ? (
          <>
            <div className="text-gray-400 text-xs">
              {spotCount} spot{spotCount !== 1 ? "s" : ""}
            </div>

            {/* Band breakdown */}
            {bandBreakdown.length > 0 && (
              <div className="text-xs text-gray-300">
                {bandBreakdown.map((b, i) => (
                  <span key={b.band}>
                    {i > 0 && <span className="text-gray-500"> | </span>}
                    <span className="text-cyan-400">{b.band}</span>
                    <span className="text-gray-500">: {b.count}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Recent spots with callsign and frequency */}
            {recentSpotInfo.length > 0 && (
              <div className="space-y-0.5">
                {recentSpotInfo.map((info, i) => (
                  <div
                    key={`${info.callsign}-${i}`}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="text-gray-300 font-mono truncate">
                      {info.callsign}
                    </span>
                    <span className="text-cyan-400/80 font-mono text-[10px] flex-shrink-0">
                      {formatFrequencyMHz(info.frequency)}
                    </span>
                  </div>
                ))}
                {spots.length > recentSpotInfo.length && (
                  <div className="text-gray-500 text-[10px]">
                    +{spots.length - recentSpotInfo.length} more...
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-gray-500 text-xs">No active spots</div>
        )}
      </div>
    </div>
  );

  // Render via portal to document.body
  return createPortal(tooltipContent, document.body);
}

MapTooltip.displayName = "MapTooltip";

export default MapTooltip;
