/**
 * SpotDetailPanel Component
 *
 * Displays detailed information about a selected DX spot.
 * Shows entity info, path metrics, spot metadata, and comments
 * in a compact horizontal layout with smooth open/close animation.
 */

import { memo, useMemo, useCallback } from "react";
import type { DXSpot } from "@/types/dxcluster";
import { getEntityFromCallsign } from "@/lib/utils/gridUtils";
import {
  getPathMetrics,
  formatDistance,
  formatBearing,
} from "@/lib/utils/path";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useRigStore } from "@/stores/rigStore";
import { InfoTip } from "@/components/ui/Tooltip";
import { GEOGRAPHY_TOOLTIPS } from "@/constants/tooltips";

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

/** Format a frequency in kHz for human-readable display (e.g., "14.074 MHz") */
function formatFrequencyDisplay(kHz: number): string {
  const mhz = kHz / 1000;
  return mhz >= 1000
    ? `${(mhz / 1000).toFixed(3)} GHz`
    : `${mhz.toFixed(3)} MHz`;
}

/**
 * Map a DX spot mode string to the rig operating mode.
 * Digital modes use USB, SSB depends on frequency, others pass through.
 */
function mapSpotModeToRigMode(
  mode: string | undefined,
  frequencyKHz: number,
): string {
  const upper = (mode || "").toUpperCase();
  switch (upper) {
    case "FT8":
    case "FT4":
    case "JT65":
    case "JT9":
    case "PSK31":
    case "RTTY":
      return "USB";
    case "CW":
      return "CW";
    case "SSB":
      return frequencyKHz < 10000 ? "LSB" : "USB";
    case "AM":
      return "AM";
    case "FM":
      return "FM";
    default:
      return "USB";
  }
}

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
  const catEnabled = useRigStore((s) => s.catEnabled);
  const setPendingFrequency = useRigStore((s) => s.setPendingFrequency);
  const setPendingMode = useRigStore((s) => s.setPendingMode);

  const handleTune = useCallback(() => {
    if (!spot) return;
    setPendingFrequency(spot.frequency * 1000); // kHz → Hz
    setPendingMode(mapSpotModeToRigMode(spot.mode, spot.frequency));
  }, [spot, setPendingFrequency, setPendingMode]);

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
            <span className="text-white font-semibold text-xs inline-flex items-center gap-1">
              {entity.name}
              <InfoTip content={GEOGRAPHY_TOOLTIPS.dxccEntity} />
            </span>
            <span className="text-[9px] text-gray-400 font-mono inline-flex items-center gap-0.5">
              CQ {entity.cqZone} <InfoTip content={GEOGRAPHY_TOOLTIPS.cqZone} />
            </span>
            <span className="text-[9px] text-gray-400 font-mono inline-flex items-center gap-0.5">
              ITU {entity.ituZone}{" "}
              <InfoTip content={GEOGRAPHY_TOOLTIPS.ituZone} />
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
              <span className="text-[9px] text-gray-400 uppercase inline-flex items-center gap-0.5">
                Grid <InfoTip content={GEOGRAPHY_TOOLTIPS.maidenheadGrid} />
              </span>
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

        {/* Tune button - only when CAT is enabled */}
        {catEnabled && (
          <div className="flex items-end ml-auto flex-shrink-0">
            <button
              onClick={handleTune}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 rounded-md transition-colors"
              title={`Tune radio to ${formatFrequencyDisplay(spot.frequency)}`}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                />
              </svg>
              Tune to {formatFrequencyDisplay(spot.frequency)} {spot.mode || ""}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

SpotDetailPanel.displayName = "SpotDetailPanel";
