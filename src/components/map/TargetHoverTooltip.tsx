/**
 * TargetHoverTooltip Component
 *
 * Hover tooltip overlay for the selected target marker.
 * Shows grid, difficulty, and an "optimal band" signal meter derived from
 * existing propagation utilities.
 */

import type {
  FocusEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  PointerEventHandler,
} from "react";
import { createPortal } from "react-dom";
import type { SUnit } from "@/types/signal";
import type { PathBandCondition } from "@/lib/utils/bands";
import { getPathStatusBgColor, getPathStatusColor } from "@/lib/utils/bands";
import {
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS,
  type DifficultyLevel,
} from "./LocationMarker";
import { useActiveStationGain } from "@/hooks/useActiveStationGain";
import {
  placeAnchoredOverlayInFrame,
  resolveOverlayFrame,
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
  /** Optional map-owned portal layer with deterministic DOM stacking order. */
  portalTarget?: Element | null;
  position: ScreenAnchor;
  label: string;
  grid?: string;
  /** Compact provider/path attribution shown beneath the primary label. */
  contextLabel?: string;
  difficulty?: DifficultyLevel;
  optimalSignal: OptimalBandSignalSummary | null;
  signalUnavailableReason?: string;
  distanceKm?: number;
  bearing?: number;
  className?: string;
  interactive?: boolean;
  onPointerEnter?: PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: PointerEventHandler<HTMLDivElement>;
  onFocus?: FocusEventHandler<HTMLDivElement>;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  onClick?: MouseEventHandler<HTMLDivElement>;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
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
  portalTarget,
  position,
  label,
  grid,
  contextLabel,
  difficulty,
  optimalSignal,
  signalUnavailableReason,
  distanceKm,
  bearing,
  className = "",
  interactive = false,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  onClick,
  onKeyDown,
}: TargetHoverTooltipProps) {
  const { txPowerWatts, physicsMode } = useActiveStationGain();
  const overlayFrame = resolveOverlayFrame(portalTarget);
  const estimatedHeight =
    (optimalSignal?.notes ? 120 : 102) +
    (distanceKm !== undefined || bearing !== undefined ? 18 : 0) +
    (contextLabel ? 16 : 0);
  const adjustedPosition = placeAnchoredOverlayInFrame(
    position,
    { width: TOOLTIP_WIDTH, height: estimatedHeight },
    overlayFrame,
    { axis: "vertical", gap: 10, padding: EDGE_PADDING },
  );

  if (!visible) {
    return null;
  }

  const difficultyColor = difficulty ? DIFFICULTY_COLORS[difficulty] : null;
  const difficultyLabel = difficulty ? DIFFICULTY_LABELS[difficulty] : null;

  const tooltipContent = (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Open spot details for ${label}` : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onPointerDown={
        interactive ? (event) => event.stopPropagation() : undefined
      }
      onDoubleClick={
        interactive ? (event) => event.stopPropagation() : undefined
      }
      className={`
        ${overlayFrame.position === "absolute" ? "absolute" : "fixed"} z-[100] ${interactive ? "pointer-events-auto cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" : "pointer-events-none"}
        bg-gray-950
        border border-white/10 rounded-lg
        shadow-xl
        ${className}
      `}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        minWidth: TOOLTIP_WIDTH,
        maxWidth: TOOLTIP_WIDTH,
      }}
    >
      {interactive && (
        // The tooltip is deliberately offset from its anchor. This transparent
        // interaction bridge covers most of that visual gap so a normal mouse
        // movement does not briefly leave both the tag and the preview.
        <span className="absolute -inset-3" aria-hidden="true" />
      )}
      <div className="px-3 py-2 border-b border-white/10">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-white font-mono font-bold text-sm truncate">
              {label}
            </div>
            {grid && (
              <div className="text-[10px] text-gray-500 font-mono">{grid}</div>
            )}
            {contextLabel && (
              <div className="mt-0.5 truncate text-[10px] text-cyan-200/70">
                {contextLabel}
              </div>
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
          Optimal Band Signal ({Math.round(txPowerWatts)}W {physicsMode})
        </div>
        <SignalMeter
          signal={optimalSignal}
          unavailableReason={signalUnavailableReason}
        />
      </div>
    </div>
  );

  return createPortal(tooltipContent, portalTarget ?? document.body);
}

TargetHoverTooltip.displayName = "TargetHoverTooltip";

export default TargetHoverTooltip;
