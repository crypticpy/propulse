/**
 * SpotDetailPanel Component
 *
 * Displays detailed information about a selected DX spot.
 * Shows entity info, path metrics, spot metadata, and comments
 * in a compact horizontal layout with smooth open/close animation.
 */

import { memo, useMemo } from "react";
import type { DXSpot } from "@/types/dxcluster";
import { getEntityFromCallsign } from "@/lib/utils/gridUtils";
import {
  getPathMetrics,
  formatDistance,
  formatBearing,
} from "@/lib/utils/path";
import { useActiveLocation } from "@/hooks/useActiveLocation";

interface SpotDetailPanelProps {
  spot: DXSpot | null;
  className?: string;
}

/** Continent badge color mapping */
const CONTINENT_COLORS: Record<string, { bg: string; text: string }> = {
  NA: { bg: "bg-cyan-500/20", text: "text-cyan-400" },
  SA: { bg: "bg-green-500/20", text: "text-green-400" },
  EU: { bg: "bg-blue-500/20", text: "text-blue-400" },
  AF: { bg: "bg-yellow-500/20", text: "text-yellow-400" },
  AS: { bg: "bg-purple-500/20", text: "text-purple-400" },
  OC: { bg: "bg-orange-500/20", text: "text-orange-400" },
};

/** Extract a readable prefix from a callsign for fallback display */
function getCallsignPrefix(callsign: string): string {
  const upper = callsign.toUpperCase();
  // Try to grab just the prefix portion (letters before the digit block)
  const match = upper.match(/^([A-Z0-9]{1,3})/);
  return match ? match[1] : upper.slice(0, 2);
}

export const SpotDetailPanel = memo(function SpotDetailPanel({
  spot,
  className = "",
}: SpotDetailPanelProps) {
  const activeLocation = useActiveLocation();

  const entity = useMemo(() => {
    if (!spot) return null;
    return getEntityFromCallsign(spot.dx);
  }, [spot]);

  const pathMetrics = useMemo(() => {
    if (!spot || spot.dxLat == null || spot.dxLon == null || !activeLocation) {
      return null;
    }
    return getPathMetrics(
      activeLocation.lat,
      activeLocation.lon,
      spot.dxLat,
      spot.dxLon,
    );
  }, [spot, activeLocation]);

  if (!spot) return null;

  const continentCode = entity?.continent ?? "";
  const continentStyle = CONTINENT_COLORS[continentCode] ?? {
    bg: "bg-white/10",
    text: "text-gray-400",
  };

  return (
    <div
      className={`bg-white/[0.03] border-t border-white/10 px-3 py-2 transition-all duration-200 ease-in-out ${className}`}
    >
      {/* Row 1 - Entity & Status */}
      <div className="flex items-center gap-2 mb-1">
        {entity ? (
          <>
            <span className="text-white font-semibold text-xs">
              {entity.name}
            </span>
            <span className="text-[9px] text-gray-400 font-mono">
              CQ {entity.cqZone}
            </span>
            <span className="text-[9px] text-gray-400 font-mono">
              ITU {entity.ituZone}
            </span>
          </>
        ) : (
          <span className="text-white font-semibold text-xs">
            {getCallsignPrefix(spot.dx)}
          </span>
        )}
        {continentCode && (
          <span
            className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none ${continentStyle.bg} ${continentStyle.text}`}
          >
            {continentCode}
          </span>
        )}
      </div>

      {/* Row 2 - Path & Metadata */}
      <div className="flex items-start gap-6">
        {/* Column 1 - Path */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] text-gray-400 uppercase tracking-wider">
            Path
          </span>
          {pathMetrics ? (
            <>
              <span className="text-[11px] text-gray-200 font-mono">
                {formatDistance(pathMetrics.shortPath.distance)}
              </span>
              <span className="text-[11px] text-gray-200 font-mono">
                {Math.round(pathMetrics.shortPath.bearing)}&deg;{" "}
                {formatBearing(pathMetrics.shortPath.bearing)}
              </span>
            </>
          ) : (
            <span className="text-[11px] text-gray-400 font-mono">--</span>
          )}
        </div>

        {/* Column 2 - Spot Info */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] text-gray-400 uppercase tracking-wider">
            Spot Info
          </span>
          {spot.dxGrid && (
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gray-400 uppercase">Grid</span>
              <span className="text-[11px] text-gray-200 font-mono">
                {spot.dxGrid}
              </span>
            </div>
          )}
          {spot.mode && (
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gray-400 uppercase">Mode</span>
              <span className="text-[11px] text-gray-200 font-mono">
                {spot.mode}
              </span>
            </div>
          )}
        </div>

        {/* Column 3 - Comment */}
        {spot.comment && (
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span className="text-[9px] text-gray-400 uppercase tracking-wider">
              Comment
            </span>
            <span className="text-[11px] text-gray-200 font-mono break-words">
              {spot.comment}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

SpotDetailPanel.displayName = "SpotDetailPanel";
