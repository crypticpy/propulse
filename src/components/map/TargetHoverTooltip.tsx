/**
 * TargetHoverTooltip Component
 *
 * Hover tooltip overlay for the selected target marker.
 * Shows grid, difficulty, and an "optimal band" signal meter derived from
 * existing propagation utilities.
 */

import { useMemo } from "react";
import { createPortal } from "react-dom";
import type { SUnit } from "@/types/signal";
import type { PathBandCondition } from "@/lib/utils/bands";
import { getPathStatusBgColor, getPathStatusColor } from "@/lib/utils/bands";
import {
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS,
  type DifficultyLevel,
} from "./LocationMarker";
import {
  placeAnchoredOverlay,
  type ScreenAnchor,
} from "@/lib/map/anchoredOverlay";

export interface OptimalBandSignalSummary {
  band: string;
  status: PathBandCondition["status"];
  sUnit?: SUnit;
  snrEstimate?: number;
  confidence?: number;
  notes?: string;
  isEstimated?: boolean;
}

export interface TargetHoverTooltipProps {
  visible: boolean;
  position: ScreenAnchor;
  label: string;
  grid?: string;
  difficulty?: DifficultyLevel;
  optimalSignal: OptimalBandSignalSummary | null;
  signalUnavailableReason?: string;
  distanceKm?: number;
  bearing?: number;
  className?: string;
}

const TOOLTIP_WIDTH = 260;
const EDGE_PADDING = 10;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatConfidence(confidence?: number) {
  if (confidence === undefined || Number.isNaN(confidence)) {
    return null;
  }
  return `${Math.round(clamp(confidence, 0, 100))}%`;
}

function SignalMeter({
  signal,
  unavailableReason,
}: {
  signal: OptimalBandSignalSummary | null;
  unavailableReason?: string;
}) {
  if (unavailableReason) {
    return <div className="text-xs text-gray-400">{unavailableReason}</div>;
  }
  if (!signal) {
    return (
      <div className="text-xs text-gray-400">
        No viable propagation on modeled HF bands
      </div>
    );
  }

  const statusText = signal.status.toUpperCase();
  const statusTextClass = getPathStatusColor(signal.status);
  const statusBgClass = getPathStatusBgColor(signal.status);

  const sUnitValue = clamp(signal.sUnit?.value ?? 0, 0, 9);
  const fillPct = (sUnitValue / 9) * 100;
  const confidenceText = formatConfidence(signal.confidence);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-white">
            {signal.band}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusBgClass} ${statusTextClass}`}
          >
            {statusText}
          </span>
          {signal.isEstimated && (
            <span className="text-[10px] text-gray-500">EST</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-mono text-white">
            {signal.sUnit?.text ?? "--"}
          </span>
          {confidenceText && (
            <span className="text-[10px] text-gray-500">{confidenceText}</span>
          )}
        </div>
      </div>

      <div className="h-2 rounded bg-white/10 overflow-hidden relative">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-alert-red via-caution-amber to-signal-green"
          style={{ width: `${fillPct}%` }}
        />
        <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded" />
      </div>

      {signal.notes && (
        <div className="text-[10px] text-gray-500 line-clamp-2">
          {signal.notes}
        </div>
      )}
    </div>
  );
}

export function TargetHoverTooltip({
  visible,
  position,
  label,
  grid,
  difficulty,
  optimalSignal,
  signalUnavailableReason,
  distanceKm,
  bearing,
  className = "",
}: TargetHoverTooltipProps) {
  const adjustedPosition = useMemo(() => {
    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : 1920;
    const viewportHeight =
      typeof window !== "undefined" ? window.innerHeight : 1080;

    const estimatedHeight =
      (optimalSignal?.notes ? 120 : 102) +
      (distanceKm !== undefined || bearing !== undefined ? 18 : 0);
    return placeAnchoredOverlay(
      position,
      { width: TOOLTIP_WIDTH, height: estimatedHeight },
      { width: viewportWidth, height: viewportHeight },
      { axis: "vertical", gap: 10, padding: EDGE_PADDING },
    );
  }, [bearing, distanceKm, position, optimalSignal?.notes]);

  if (!visible) {
    return null;
  }

  const difficultyColor = difficulty ? DIFFICULTY_COLORS[difficulty] : null;
  const difficultyLabel = difficulty ? DIFFICULTY_LABELS[difficulty] : null;

  const tooltipContent = (
    <div
      className={`
        fixed z-50 pointer-events-none
        bg-gray-900/95 backdrop-blur-md
        border border-white/10 rounded-lg
        shadow-xl
        transition-opacity duration-150
        ${visible ? "opacity-100" : "opacity-0"}
        ${className}
      `}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        minWidth: TOOLTIP_WIDTH,
        maxWidth: TOOLTIP_WIDTH,
      }}
    >
      <div className="px-3 py-2 border-b border-white/10">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-white font-mono font-bold text-sm truncate">
              {label}
            </div>
            {grid && (
              <div className="text-[10px] text-gray-500 font-mono">{grid}</div>
            )}
          </div>
          {difficultyLabel && difficultyColor && (
            <span
              className="px-2 py-0.5 rounded text-[10px] font-semibold border"
              style={{
                color: difficultyColor,
                borderColor: `${difficultyColor}80`,
                backgroundColor: `${difficultyColor}1a`,
              }}
            >
              {difficultyLabel}
            </span>
          )}
        </div>
      </div>

      <div className="px-3 py-2 space-y-1.5">
        {(distanceKm !== undefined || bearing !== undefined) && (
          <div className="flex items-center justify-between font-mono text-[10px] text-gray-400">
            <span>
              {distanceKm !== undefined
                ? `${Math.round(distanceKm).toLocaleString()} km`
                : "Distance unavailable"}
            </span>
            {bearing !== undefined && (
              <span className="text-cyan-300">
                {Math.round(bearing).toString().padStart(3, "0")}°
              </span>
            )}
          </div>
        )}
        <div className="text-[10px] uppercase tracking-wide text-gray-500">
          Optimal Band Signal (100W FT8)
        </div>
        <SignalMeter
          signal={optimalSignal}
          unavailableReason={signalUnavailableReason}
        />
      </div>
    </div>
  );

  return createPortal(tooltipContent, document.body);
}

TargetHoverTooltip.displayName = "TargetHoverTooltip";

export default TargetHoverTooltip;
