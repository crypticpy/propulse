/**
 * MapTooltip Component
 *
 * A hover tooltip overlay for map views showing grid information
 * and DX spot activity. Uses glassmorphism styling and smart positioning
 * to stay within viewport bounds.
 */

import { useMemo, useLayoutEffect, useRef, useState } from "react";
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
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: TOOLTIP_WIDTH, height: TOOLTIP_HEIGHT });
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 1920 : window.innerWidth,
    height: typeof window === "undefined" ? 1080 : window.innerHeight,
  }));
  useLayoutEffect(() => {
    if (!visible || !tooltipRef.current) return;
    const element = tooltipRef.current;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      setBounds((previous) => previous.width === width && previous.height === height ? previous : { width, height });
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [visible]);
  const adjustedPosition = useMemo(() => {
    const x = position.x + 15 + bounds.width > viewport.width - EDGE_PADDING
      ? position.x - bounds.width - 15 : position.x + 15;
    const y = position.y + 10 + bounds.height > viewport.height - EDGE_PADDING
      ? position.y - bounds.height - 10 : position.y + 10;
    return {
      x: Math.max(EDGE_PADDING, Math.min(x, viewport.width - bounds.width - EDGE_PADDING)),
      y: Math.max(EDGE_PADDING, Math.min(y, viewport.height - bounds.height - EDGE_PADDING)),
    };
  }, [position, bounds, viewport]);

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
      ref={tooltipRef}
      className={`
        fixed z-50 pointer-events-none
        bg-su-panel/80 backdrop-blur-md
        border border-su-line/40 rounded-lg
        shadow-xl
        transition-opacity duration-200
        ${visible ? "opacity-100" : "opacity-0"}
        ${className}
      `}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        maxWidth: Math.min(TOOLTIP_WIDTH, viewport.width - EDGE_PADDING * 2),
      }}
    >
      <div className="p-3 space-y-1.5">
        {/* Grid locator header */}
        <div className="text-su-text font-mono font-bold text-sm">{grid}</div>

        {/* Spot count */}
        {spotCount > 0 ? (
          <>
            <div className="text-su-muted text-xs">
              {spotCount} spot{spotCount !== 1 ? "s" : ""}
            </div>

            {/* Band breakdown */}
            {bandBreakdown.length > 0 && (
              <div className="text-xs text-su-muted">
                {bandBreakdown.map((b, i) => (
                  <span key={b.band}>
                    {i > 0 && <span className="text-su-muted"> | </span>}
                    <span className="text-cyan-400">{b.band}</span>
                    <span className="text-su-muted">: {b.count}</span>
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
                    <span className="text-su-muted font-mono truncate">
                      {info.callsign}
                    </span>
                    <span className="text-cyan-400/80 font-mono text-xs flex-shrink-0">
                      {formatFrequencyMHz(info.frequency)}
                    </span>
                  </div>
                ))}
                {spots.length > recentSpotInfo.length && (
                  <div className="text-su-muted text-xs">
                    +{spots.length - recentSpotInfo.length} more...
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-su-muted text-xs">No active spots</div>
        )}
      </div>
    </div>
  );

  // Render via portal to document.body
  return createPortal(tooltipContent, document.body);
}

MapTooltip.displayName = "MapTooltip";

export default MapTooltip;
