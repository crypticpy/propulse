/**
 * OptimalBandsPanel Component
 *
 * Floating draggable pop-out panel that displays optimal bands and distance
 * for the current path. Anchored to top-left of globe view by default,
 * but can be repositioned anywhere within the container bounds.
 */

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { useActiveStationGain } from "@/hooks/useActiveStationGain";
import { useSettingsStore } from "@/stores/settingsStore";
import { getAntennaGainForPath } from "@/lib/data/antennas";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import {
  getPathMetrics,
  getPathIllumination,
  formatDistance,
} from "@/lib/utils/path";
import {
  getEnhancedBandConditions,
  type PathBandCondition,
} from "@/lib/utils/bands";
import {
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS,
  type DifficultyLevel,
} from "./LocationMarker";

interface OptimalBandsPanelProps {
  displayTime: Date;
  className?: string;
}

/**
 * Get the top N optimal bands based on status and SNR
 */
function getOptimalBands(
  conditions: PathBandCondition[],
  count: number = 2,
): PathBandCondition[] {
  // Score each band based on status and SNR
  const statusScores: Record<string, number> = {
    excellent: 100,
    good: 75,
    fair: 50,
    poor: 25,
    closed: 0,
  };

  const scoredBands = conditions.map((cond) => ({
    ...cond,
    score: (statusScores[cond.status] || 0) + (cond.snrEstimate + 50), // Normalize SNR
  }));

  // Sort by score descending and take top N
  return scoredBands.sort((a, b) => b.score - a.score).slice(0, count);
}

// Panel dimensions for bounds checking
const PANEL_WIDTH = 192; // w-48 = 12rem = 192px
const PANEL_HEIGHT_EXPANDED = 320; // Approximate expanded height
const PANEL_HEIGHT_COLLAPSED = 40; // Approximate collapsed height

export function OptimalBandsPanel({
  displayTime,
  className = "",
}: OptimalBandsPanelProps) {
  const target = useMapStore((s) => s.target);
  const { station } = useUserStore();
  const { antennaType } = useActiveStationGain();
  const noiseEnvironment = useSettingsStore((s) => s.noiseEnvironment);
  const [isExpanded, setIsExpanded] = useState(true);

  // Draggable position state - default to top-left
  const [position, setPosition] = useState({ x: 12, y: 12 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const positionStartRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  // Find the container element (parent with relative positioning)
  useEffect(() => {
    if (panelRef.current) {
      // Find the closest parent with position relative/absolute
      let parent = panelRef.current.parentElement;
      while (parent) {
        const style = window.getComputedStyle(parent);
        if (style.position === "relative" || style.position === "absolute") {
          containerRef.current = parent;
          break;
        }
        parent = parent.parentElement;
      }
    }
  }, []);

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      positionStartRef.current = { ...position };
    },
    [position],
  );

  // Handle drag move
  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      let newX = positionStartRef.current.x + deltaX;
      let newY = positionStartRef.current.y + deltaY;

      // Constrain to container bounds
      if (containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const panelHeight = isExpanded
          ? PANEL_HEIGHT_EXPANDED
          : PANEL_HEIGHT_COLLAPSED;

        // Keep within bounds with some padding
        const minX = 4;
        const minY = 4;
        const maxX = containerRect.width - PANEL_WIDTH - 4;
        const maxY = containerRect.height - panelHeight - 4;

        newX = Math.max(minX, Math.min(maxX, newX));
        newY = Math.max(minY, Math.min(maxY, newY));
      }

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isExpanded]);

  // Fetch current solar data
  const { data: kIndexData } = useKIndex();
  const { data: solarFluxData } = useSolarFlux();

  // Get current Kp and SFI values
  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) {
      return 3;
    }
    return kIndexData[kIndexData.length - 1].kp_index;
  }, [kIndexData]);

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) {
      return 100;
    }
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

  // Calculate path metrics
  const pathMetrics = useMemo(() => {
    if (!station || !target) {
      return null;
    }
    return getPathMetrics(station.lat, station.lon, target.lat, target.lon);
  }, [station, target]);

  // Calculate enhanced band conditions
  const bandConditions = useMemo(() => {
    if (!station || !target || !pathMetrics) {
      return null;
    }
    try {
      const antennaGainDbi = getAntennaGainForPath(
        antennaType,
        pathMetrics.shortPath.distance,
      );
      return getEnhancedBandConditions(
        station.lat,
        station.lon,
        target.lat,
        target.lon,
        currentKp,
        currentSfi,
        displayTime,
        100,
        "FT8",
        antennaGainDbi,
        noiseEnvironment,
      );
    } catch {
      return null;
    }
  }, [
    station,
    target,
    pathMetrics,
    currentKp,
    currentSfi,
    displayTime,
    antennaType,
    noiseEnvironment,
  ]);

  // Get optimal bands
  const optimalBands = useMemo(() => {
    if (!bandConditions) {
      return [];
    }
    return getOptimalBands(bandConditions, 2);
  }, [bandConditions]);

  // Calculate path illumination
  const illumination = useMemo(() => {
    if (!station || !target) {
      return 0;
    }
    return getPathIllumination(
      station.lat,
      station.lon,
      target.lat,
      target.lon,
      displayTime,
    );
  }, [station, target, displayTime]);

  // Don't show if no target selected
  if (!station || !target || !pathMetrics) {
    return null;
  }

  const difficulty = pathMetrics.difficulty as DifficultyLevel;
  const difficultyColor = DIFFICULTY_COLORS[difficulty];
  const difficultyLabel = DIFFICULTY_LABELS[difficulty];

  return (
    <div
      ref={panelRef}
      className={`absolute z-10 ${className}`}
      style={{
        left: position.x,
        top: position.y,
        cursor: isDragging ? "grabbing" : undefined,
      }}
    >
      {/* Collapsed state - just a small indicator */}
      {!isExpanded && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg
                     bg-deep-space/90 backdrop-blur-sm border border-white/10
                     hover:border-white/20 transition-all shadow-lg"
        >
          {/* Drag handle */}
          <div
            onMouseDown={handleDragStart}
            className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 hover:bg-white/10 rounded"
            title="Drag to reposition"
          >
            <svg
              className="w-3 h-3 text-gray-500"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="5" cy="5" r="2" />
              <circle cx="12" cy="5" r="2" />
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="5" cy="19" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </div>
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: difficultyColor }}
          />
          <span className="text-xs font-mono text-gray-300">
            {formatDistance(pathMetrics.shortPath.distance)}
          </span>
          <button
            onClick={() => setIsExpanded(true)}
            className="p-0.5 hover:bg-white/10 rounded transition-colors"
            title="Expand"
          >
            <svg
              className="w-3 h-3 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Expanded panel */}
      {isExpanded && (
        <div
          className="w-48 rounded-lg bg-deep-space/95 backdrop-blur-sm
                     border border-white/10 shadow-xl overflow-hidden"
        >
          {/* Header with drag handle */}
          <div
            className="flex items-center justify-between px-3 py-2 border-b border-white/10"
            style={{ cursor: isDragging ? "grabbing" : undefined }}
          >
            <div className="flex items-center gap-2">
              {/* Drag handle */}
              <div
                onMouseDown={handleDragStart}
                className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 hover:bg-white/10 rounded"
                title="Drag to reposition"
              >
                <svg
                  className="w-3 h-3 text-gray-500"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <circle cx="5" cy="5" r="2" />
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="5" cy="19" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </div>
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: difficultyColor }}
              />
              <span className="text-xs font-medium text-gray-300 uppercase tracking-wide">
                Path Info
              </span>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1 rounded hover:bg-white/10 transition-colors"
              title="Collapse"
            >
              <svg
                className="w-3 h-3 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 15l7-7 7 7"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-3 space-y-2">
            {/* Distance */}
            <div>
              <div className="text-[10px] text-gray-500 mb-0.5">Distance</div>
              <div className="text-lg font-mono text-white">
                {formatDistance(pathMetrics.shortPath.distance)}
              </div>
              <div className="text-[10px] text-gray-500">
                {pathMetrics.hops} hop{pathMetrics.hops > 1 ? "s" : ""} •{" "}
                {Math.round(illumination)}% daylight
              </div>
            </div>

            {/* Difficulty */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500">Difficulty:</span>
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{
                  backgroundColor: `${difficultyColor}20`,
                  color: difficultyColor,
                }}
              >
                {difficultyLabel}
              </span>
            </div>

            {/* Optimal Bands */}
            <div>
              <div className="text-[10px] text-gray-500 mb-1">
                Optimal Bands
              </div>
              {optimalBands.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {optimalBands.map((band, index) => (
                    <div
                      key={band.band}
                      className="flex items-center justify-between p-1.5 rounded
                                 bg-white/5 border border-white/10"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-4 text-center text-[10px] font-bold ${
                            index === 0
                              ? "text-signal-green"
                              : "text-caution-amber"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <span className="text-sm font-mono text-white">
                          {band.band}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          band.status === "excellent"
                            ? "bg-signal-green/20 text-signal-green"
                            : band.status === "good"
                              ? "bg-good/20 text-good"
                              : band.status === "fair"
                                ? "bg-caution-amber/20 text-caution-amber"
                                : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {band.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500 italic">
                  No bands available
                </div>
              )}
            </div>

            {/* Target info */}
            <div className="pt-2 border-t border-white/5 text-[10px] text-gray-400 font-mono">
              → {target.name || target.grid || "Target"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OptimalBandsPanel;
