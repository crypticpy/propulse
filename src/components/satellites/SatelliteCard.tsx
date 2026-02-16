/**
 * SatelliteCard -- Compact glass-morphism card for the satellite database grid.
 *
 * Shows category badge, TLE age badge, track toggle, name, NORAD ID,
 * transponder frequencies, next pass info. Clicking the card opens
 * the SatelliteDetailModal (handled by parent via onCardClick).
 * Follows the NetCard glass-morphism pattern.
 */

import { formatDistanceToNow } from "date-fns";
import { CATEGORY_META, formatFreqMHz } from "@/lib/utils/satellite";
import { getTransponder } from "@/lib/data/satelliteTransponders";
import type { SatelliteInfoExtended, PassPrediction } from "@/types/satellite";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SatelliteCardProps {
  satellite: SatelliteInfoExtended;
  nextPass: PassPrediction | null;
  isTracked: boolean;
  onTrackToggle: (noradId: number, track: boolean) => void;
  onCardClick: (satellite: SatelliteInfoExtended) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** TLE age badge styling */
function getTleAgeBadge(age: "fresh" | "aging" | "stale") {
  switch (age) {
    case "fresh":
      return {
        label: "Fresh",
        className:
          "bg-signal-green/15 text-signal-green border-signal-green/30",
      };
    case "aging":
      return {
        label: "Aging",
        className:
          "bg-caution-amber/15 text-caution-amber border-caution-amber/30",
      };
    case "stale":
      return {
        label: "Stale",
        className: "bg-alert-red/15 text-alert-red border-alert-red/30",
      };
  }
}

/** Format pass time as relative duration string */
function formatPassTime(pass: PassPrediction): string {
  const now = new Date();
  const aosDate =
    pass.aos instanceof Date
      ? pass.aos
      : new Date(pass.aos as unknown as string);

  if (aosDate <= now) {
    return "Now";
  }

  return formatDistanceToNow(aosDate, { addSuffix: true });
}

/** Category left border color — static map so Tailwind JIT can purge correctly */
const CATEGORY_BORDER_COLORS: Record<string, string> = {
  iss: "border-l-white",
  fm: "border-l-green-400",
  linear: "border-l-cyan-400",
  digital: "border-l-orange-400",
  weather: "border-l-purple-400",
  other: "border-l-gray-400",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SatelliteCard({
  satellite,
  nextPass,
  isTracked,
  onTrackToggle,
  onCardClick,
}: SatelliteCardProps) {
  const catMeta = CATEGORY_META[satellite.category];
  const tleAgeBadge = getTleAgeBadge(satellite.tleAge);
  const transponder = getTransponder(satellite.name, satellite.noradId);

  // Primary uplink/downlink from first transponder
  const primaryTransponder = transponder?.transponders[0] ?? null;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTrackToggle(satellite.noradId, !isTracked);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onCardClick(satellite)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCardClick(satellite);
        }
      }}
      className={`w-full text-left bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-4 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.05] cursor-pointer group border-l-2 ${CATEGORY_BORDER_COLORS[satellite.category] ?? "border-l-gray-400"}`}
    >
      {/* Top row: Category badge + TLE age badge + Track Toggle */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          {/* Category badge */}
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${catMeta.bg} ${catMeta.color}`}
          >
            {catMeta.label}
          </span>

          {/* TLE age badge */}
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${tleAgeBadge.className}`}
          >
            {tleAgeBadge.label}
          </span>
        </div>

        {/* Track toggle switch */}
        <button
          onClick={handleToggle}
          aria-label={isTracked ? "Untrack satellite" : "Track satellite"}
          aria-pressed={isTracked}
          className="relative flex-shrink-0 w-[44px] h-[24px] rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/50"
          style={{
            backgroundColor: isTracked
              ? "rgba(34, 197, 94, 0.4)"
              : "rgba(255, 255, 255, 0.1)",
          }}
        >
          <span
            className={`absolute top-[2px] left-[2px] w-[20px] h-[20px] rounded-full transition-transform duration-200 ${
              isTracked
                ? "translate-x-[20px] bg-signal-green"
                : "translate-x-0 bg-gray-400"
            }`}
          />
        </button>
      </div>

      {/* Satellite name */}
      <h3 className="text-lg font-bold text-white truncate mb-0.5 group-hover:text-plasma-orange transition-colors">
        {satellite.name}
      </h3>

      {/* NORAD ID */}
      <p className="text-xs text-gray-400 font-mono mb-2">
        NORAD {satellite.noradId}
      </p>

      {/* Transponder frequencies */}
      {primaryTransponder && (
        <div className="flex items-center gap-3 text-xs font-mono text-gray-300 mb-2">
          {primaryTransponder.uplinkRangeHz[0] > 0 && (
            <span className="flex items-center gap-1">
              <svg
                className="w-3 h-3 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 10l7-7m0 0l7 7m-7-7v18"
                />
              </svg>
              {formatFreqMHz(primaryTransponder.uplinkRangeHz[0])}
            </span>
          )}
          {primaryTransponder.downlinkRangeHz[0] > 0 && (
            <span className="flex items-center gap-1">
              <svg
                className="w-3 h-3 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
              {formatFreqMHz(primaryTransponder.downlinkRangeHz[0])}
            </span>
          )}
        </div>
      )}

      {/* Next pass row */}
      {nextPass && (
        <div className="flex items-center gap-1 text-xs text-cyan-400 mb-2">
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>
            Next: {formatPassTime(nextPass)} · {Math.round(nextPass.maxEl)}° max
            el
          </span>
        </div>
      )}

      {/* Custom badge */}
      {satellite.isCustom && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/15 text-purple-400 border border-purple-500/30">
          Custom
        </span>
      )}
    </div>
  );
}
