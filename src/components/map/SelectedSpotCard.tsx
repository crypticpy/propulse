import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useMapSpotSelection } from "@/hooks/useMapSpotSelection";
import { useDXStore } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import { useRigStore } from "@/stores/rigStore";
import { useUserStore } from "@/stores/userStore";
import { useWatchStore } from "@/stores/watchStore";
import { getEntityFromCallsign } from "@/lib/utils/gridUtils";
import {
  formatBearing,
  formatDistance,
  getPathMetrics,
} from "@/lib/utils/path";
import { getModeColor } from "@/lib/utils/spotColors";
import {
  getPathStatusBgColor,
  getPathStatusColor,
} from "@/lib/utils/bands";
import {
  formatSpotCopyText,
  getSpotPresentationSource,
  mapSpotModeToRigMode,
  type PresentableSpot,
} from "@/lib/map/spotPresentation";
import {
  placeAnchoredOverlay,
  type ScreenAnchor,
} from "@/lib/map/anchoredOverlay";
import {
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS,
  type DifficultyLevel,
} from "./LocationMarker";
import type { OptimalBandSignalSummary } from "./TargetHoverTooltip";
import {
  formatSpotAge,
  getAgeBadgeColors,
  getSpotAgeInfo,
} from "./LiveSpotArcs";

export interface SelectedSpotCardProps {
  spot: PresentableSpot | null;
  position: ScreenAnchor;
  difficulty?: DifficultyLevel;
  optimalSignal?: OptimalBandSignalSummary | null;
  signalUnavailableReason?: string;
  onOperator: () => void;
  onViewPath?: () => void;
  onClose: () => void;
}

const CARD_WIDTH = 364;
const CARD_HEIGHT = 520;
const EDGE_PADDING = 10;

function formatFrequency(frequencyKhz: number) {
  return frequencyKhz >= 1000
    ? `${(frequencyKhz / 1000).toFixed(3)} MHz`
    : `${frequencyKhz.toFixed(1)} kHz`;
}

function formatUtc(value: Date) {
  return `${value.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })} UTC`;
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.025] px-2 py-1.5">
      <div className="text-[9px] font-medium uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div
        className="mt-0.5 truncate font-mono text-[11px] text-gray-200"
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  active = false,
  disabled = false,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md border px-2 py-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300 disabled:cursor-default disabled:opacity-70 ${
        active
          ? "border-signal-green/35 bg-signal-green/10 text-signal-green"
          : "border-white/10 bg-white/5 text-gray-300 hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

/** Canonical non-modal detail and action surface for every map spot. */
export function SelectedSpotCard({
  spot,
  position,
  difficulty,
  optimalSignal,
  signalUnavailableReason,
  onOperator,
  onViewPath,
  onClose,
}: SelectedSpotCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const selectMapSpot = useMapSpotSelection();
  const selectedSpotId = useDXStore((state) => state.selectedSpot?.id);
  const target = useMapStore((state) => state.target);
  const { station } = useUserStore();
  const setWatch = useWatchStore((state) => state.setWatch);
  const catEnabled = useRigStore((state) => state.catEnabled);
  const setPendingFrequency = useRigStore(
    (state) => state.setPendingFrequency,
  );
  const setPendingMode = useRigStore((state) => state.setPendingMode);

  const adjustedPosition = useMemo(() => {
    const viewport = {
      width: typeof window === "undefined" ? 1920 : window.innerWidth,
      height: typeof window === "undefined" ? 1080 : window.innerHeight,
    };
    return placeAnchoredOverlay(
      position,
      {
        width: Math.min(CARD_WIDTH, viewport.width - EDGE_PADDING * 2),
        height: Math.min(CARD_HEIGHT, viewport.height - EDGE_PADDING * 2),
      },
      viewport,
      { axis: "horizontal", gap: 14, padding: EDGE_PADDING },
    );
  }, [position]);

  useEffect(() => {
    if (!spot) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const timeout = window.setTimeout(() => {
      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, spot]);

  const pathMetrics = useMemo(() => {
    if (
      !spot ||
      !station ||
      !Number.isFinite(spot.dxLat) ||
      !Number.isFinite(spot.dxLon)
    ) {
      return null;
    }
    try {
      return getPathMetrics(
        station.lat,
        station.lon,
        spot.dxLat!,
        spot.dxLon!,
      );
    } catch {
      return null;
    }
  }, [spot, station]);

  const handleSetTarget = useCallback(() => {
    if (spot) selectMapSpot(spot);
  }, [selectMapSpot, spot]);

  const handleViewPath = useCallback(() => {
    if (!spot) return;
    selectMapSpot(spot);
    onViewPath?.();
  }, [onViewPath, selectMapSpot, spot]);

  const handleCopy = useCallback(async () => {
    if (!spot || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(formatSpotCopyText(spot));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard permissions can be denied in embedded or insecure contexts.
    }
  }, [spot]);

  const handleQRZ = useCallback(() => {
    if (!spot) return;
    window.open(
      `https://www.qrz.com/db/${encodeURIComponent(spot.dx)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }, [spot]);

  const handleWatch = useCallback(() => {
    if (spot) setWatch({ callsign: spot.dx, txOrRx: "either" });
  }, [setWatch, spot]);

  const handleTune = useCallback(() => {
    if (!spot) return;
    setPendingFrequency(spot.frequency * 1000);
    setPendingMode(mapSpotModeToRigMode(spot.mode, spot.frequency));
  }, [setPendingFrequency, setPendingMode, spot]);

  if (!spot) return null;

  const modeColor = getModeColor(spot.mode);
  const sourcePresentation = getSpotPresentationSource(spot);
  const difficultyColor = difficulty ? DIFFICULTY_COLORS[difficulty] : null;
  const spotTime = spot.time instanceof Date ? spot.time : new Date(spot.time);
  const ageColors = getAgeBadgeColors(getSpotAgeInfo(spotTime).ageCategory);
  const entity = getEntityFromCallsign(spot.dx);
  const targetSelected =
    selectedSpotId === spot.id &&
    !!target &&
    Number.isFinite(spot.dxLat) &&
    Number.isFinite(spot.dxLon) &&
    Math.abs(target.lat - spot.dxLat!) < 0.0001 &&
    Math.abs(target.lon - spot.dxLon!) < 0.0001;

  return createPortal(
    <section
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      aria-label={`Spot details for ${spot.dx}`}
      className="fixed z-[70] flex max-h-[calc(100vh-20px)] w-[min(364px,calc(100vw-20px))] flex-col overflow-hidden rounded-xl border border-white/15 bg-gray-950/95 text-gray-200 shadow-2xl backdrop-blur-xl"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        borderTopColor: modeColor,
        borderTopWidth: 3,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-base font-bold text-white">
              {spot.dx}
            </h3>
            {spot.dxLocApprox && (
              <span className="rounded border border-caution-amber/30 bg-caution-amber/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-caution-amber">
                Approx
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-gray-400">
            {entity?.name || "Station location"}
            {entity?.continent ? ` · ${entity.continent}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-gray-500 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Close spot details"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path
              d="M3 3l8 8M11 3l-8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="overflow-y-auto">
        <div className="space-y-2.5 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-sm text-white">
              {formatFrequency(spot.frequency)}
            </span>
            {spot.band && (
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-gray-300">
                {spot.band}
              </span>
            )}
            {spot.mode && (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                style={{ backgroundColor: modeColor }}
              >
                {spot.mode}
              </span>
            )}
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: sourcePresentation.bgColor,
                color: sourcePresentation.color,
              }}
            >
              {sourcePresentation.label}
            </span>
            <span
              className={`rounded border px-1.5 py-0.5 text-[9px] ${ageColors.bg} ${ageColors.text} ${ageColors.border}`}
            >
              {formatSpotAge(spotTime)}
            </span>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.035] px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wide text-gray-500">
                Path outlook
              </span>
              {difficulty && difficultyColor && (
                <span
                  className="rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    color: difficultyColor,
                    borderColor: `${difficultyColor}70`,
                    backgroundColor: `${difficultyColor}16`,
                  }}
                >
                  {DIFFICULTY_LABELS[difficulty]}
                </span>
              )}
            </div>
            {pathMetrics && (
              <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-gray-400">
                <span>{formatDistance(pathMetrics.shortPath.distance)}</span>
                <span>
                  {Math.round(pathMetrics.shortPath.bearing)}° {formatBearing(pathMetrics.shortPath.bearing)}
                </span>
              </div>
            )}
            {optimalSignal ? (
              <>
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white">
                      {optimalSignal.band}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${getPathStatusBgColor(optimalSignal.status)} ${getPathStatusColor(optimalSignal.status)}`}
                    >
                      {optimalSignal.status}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-cyan-300">
                    {optimalSignal.sUnit?.text ?? "Signal pending"}
                  </span>
                </div>
                <div className="relative mt-1.5 h-1.5 overflow-hidden rounded bg-white/10">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-alert-red via-caution-amber to-signal-green"
                    style={{
                      width: `${Math.max(0, Math.min(100, ((optimalSignal.sUnit?.value ?? 0) / 9) * 100))}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <p className="mt-1.5 text-[10px] text-gray-500">
                {signalUnavailableReason || "No viable modeled HF band right now"}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <DetailValue label="DX grid" value={spot.dxGrid || "Not reported"} />
            <DetailValue label="Spotted by" value={spot.spotter || "Unknown"} />
            <DetailValue
              label="Spotter grid"
              value={spot.spotterGrid || spot.receiverGrid || "Not reported"}
            />
            <DetailValue label="Time" value={formatUtc(spotTime)} />
            {spot.snr !== undefined && (
              <DetailValue label="Signal-to-noise" value={`${spot.snr} dB`} />
            )}
            {spot.wpm !== undefined && (
              <DetailValue label="CW speed" value={`${spot.wpm} WPM`} />
            )}
            {spot.activation && (
              <>
                <DetailValue
                  label="Activation"
                  value={`${spot.activation.program} ${spot.activation.reference}`}
                />
                <DetailValue
                  label="Reference name"
                  value={spot.activation.referenceName}
                />
                <DetailValue
                  label="Activation source"
                  value={spot.activation.source}
                />
              </>
            )}
          </div>

          {spot.comment && (
            <div className="rounded-md border border-white/10 bg-white/[0.025] px-2.5 py-2">
              <div className="text-[9px] font-medium uppercase tracking-wider text-gray-500">
                Spot comment
              </div>
              <p className="mt-1 text-xs leading-relaxed text-gray-300">
                {spot.comment}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5 border-t border-white/10 px-3 py-2.5">
          <ActionButton
            onClick={handleSetTarget}
            active={targetSelected}
            disabled={targetSelected}
          >
            {targetSelected ? "Target selected" : "Set target"}
          </ActionButton>
          <ActionButton onClick={handleViewPath}>View path</ActionButton>
          <ActionButton onClick={handleCopy}>
            {copied ? "Copied" : "Copy details"}
          </ActionButton>
          <ActionButton onClick={onOperator}>Operator</ActionButton>
          <ActionButton onClick={handleQRZ}>Open QRZ</ActionButton>
          <ActionButton onClick={handleWatch}>Watch</ActionButton>
          {catEnabled && (
            <ActionButton
              onClick={handleTune}
              title={`Tune to ${formatFrequency(spot.frequency)}`}
            >
              Tune radio
            </ActionButton>
          )}
        </div>
      </div>
    </section>,
    document.body,
  );
}

SelectedSpotCard.displayName = "SelectedSpotCard";

export default SelectedSpotCard;
