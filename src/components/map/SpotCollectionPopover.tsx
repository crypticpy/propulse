import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import type { LiveSpot } from "@/types/livespot";
import { SPOT_SOURCE_COLORS } from "@/types/livespot";
import {
  normalizePresentableSpot,
  type PresentableSpot,
} from "@/lib/map/spotPresentation";
import {
  placeAnchoredOverlay,
  type ScreenAnchor,
} from "@/lib/map/anchoredOverlay";
import { getModeColor } from "@/lib/utils/spotColors";
import {
  formatSpotAge,
  getAgeBadgeColors,
  getSpotAgeInfo,
} from "./LiveSpotArcs";

export interface SpotCollectionPopoverProps {
  visible: boolean;
  position: ScreenAnchor;
  title: string;
  subtitle?: string;
  spots: readonly PresentableSpot[];
  onClose: () => void;
  onSpotSelect: (spot: LiveSpot) => void;
}

const POPOVER_WIDTH = 330;
const POPOVER_HEIGHT = 430;
const EDGE_PADDING = 10;

function formatFrequency(frequencyKhz: number) {
  return frequencyKhz >= 1000
    ? `${(frequencyKhz / 1000).toFixed(3)} MHz`
    : `${frequencyKhz.toFixed(1)} kHz`;
}

/** Shared member list for clusters, aggregate pins, collectors, and grids. */
export function SpotCollectionPopover({
  visible,
  position,
  title,
  subtitle,
  spots,
  onClose,
  onSpotSelect,
}: SpotCollectionPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const sortedSpots = useMemo(
    () =>
      [...spots].sort((a, b) => {
        const aTime =
          a.time instanceof Date ? a.time.getTime() : new Date(a.time).getTime();
        const bTime =
          b.time instanceof Date ? b.time.getTime() : new Date(b.time).getTime();
        return bTime - aTime;
      }),
    [spots],
  );
  const summary = useMemo(() => {
    const modes = new Map<string, number>();
    const bands = new Set<string>();
    for (const spot of spots) {
      const mode = spot.mode?.toUpperCase() || "UNKNOWN";
      modes.set(mode, (modes.get(mode) || 0) + 1);
      if (spot.band) bands.add(spot.band);
    }
    return {
      modes: [...modes.entries()].sort((a, b) => b[1] - a[1]),
      bands: bands.size,
    };
  }, [spots]);

  const adjustedPosition = useMemo(() => {
    const viewport = {
      width: typeof window === "undefined" ? 1920 : window.innerWidth,
      height: typeof window === "undefined" ? 1080 : window.innerHeight,
    };
    return placeAnchoredOverlay(
      position,
      {
        width: Math.min(POPOVER_WIDTH, viewport.width - EDGE_PADDING * 2),
        height: Math.min(POPOVER_HEIGHT, viewport.height - EDGE_PADDING * 2),
      },
      viewport,
      { axis: "horizontal", gap: 12, padding: EDGE_PADDING },
    );
  }, [position]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!visible) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
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
  }, [handleKeyDown, onClose, visible]);

  if (!visible || sortedSpots.length === 0) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={`${title}: ${sortedSpots.length} spots`}
      className="fixed z-[65] flex max-h-[calc(100vh-20px)] w-[min(330px,calc(100vw-20px))] flex-col overflow-hidden rounded-xl border border-white/15 bg-deep-space/95 text-gray-100 shadow-2xl backdrop-blur-xl"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-3 py-2.5">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold uppercase tracking-wider text-signal-green">
            {title}
          </div>
          <div className="mt-0.5 text-[10px] text-gray-500">
            {subtitle || "Select a station to target and inspect"}
          </div>
        </div>
        <button
          type="button"
          className="rounded p-1 text-gray-500 hover:bg-white/10 hover:text-white"
          onClick={onClose}
          aria-label="Close spot collection"
        >
          ×
        </button>
      </div>

      <div className="overflow-y-auto p-1">
        {sortedSpots.map((rawSpot, index) => {
          const spot = normalizePresentableSpot(rawSpot);
          const time =
            spot.time instanceof Date ? spot.time : new Date(spot.time);
          const modeColor = getModeColor(spot.mode);
          const sourceColors = SPOT_SOURCE_COLORS[spot.source];
          const ageColors = getAgeBadgeColors(
            getSpotAgeInfo(time).ageCategory,
          );
          return (
            <button
              type="button"
              key={spot.id || `${spot.dx}-${spot.frequency}-${index}`}
              onClick={() => onSpotSelect(spot)}
              className="group w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal-green"
              aria-label={`Select ${spot.dx} and view details`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="min-w-0 flex-1 truncate font-mono text-xs font-semibold"
                  style={{ color: modeColor }}
                >
                  {spot.dx}
                </span>
                <span className="font-mono text-[10px] text-gray-300">
                  {formatFrequency(spot.frequency)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                {spot.band && (
                  <span className="rounded bg-white/10 px-1 py-0.5 text-[9px] font-bold text-gray-300">
                    {spot.band}
                  </span>
                )}
                {spot.mode && (
                  <span
                    className="rounded px-1 py-0.5 text-[9px] font-bold text-white"
                    style={{ backgroundColor: modeColor }}
                  >
                    {spot.mode}
                  </span>
                )}
                <span
                  className="rounded px-1 py-0.5 text-[9px]"
                  style={{
                    backgroundColor: sourceColors.bgColor,
                    color: sourceColors.color,
                  }}
                >
                  {spot.source}
                </span>
                <span
                  className={`rounded border px-1 py-0.5 text-[9px] ${ageColors.bg} ${ageColors.text} ${ageColors.border}`}
                >
                  {formatSpotAge(time)}
                </span>
                {spot.snr !== undefined && (
                  <span className="ml-auto font-mono text-[9px] text-cyan-300">
                    {spot.snr} dB
                  </span>
                )}
              </div>
              {(spot.dxGrid || spot.comment) && (
                <div className="mt-1 truncate text-[9px] text-gray-500">
                  {spot.dxGrid || "Grid unavailable"}
                  {spot.comment ? ` · ${spot.comment}` : ""}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-[9px] text-gray-500">
        <span className="truncate">
          {summary.modes
            .slice(0, 3)
            .map(([mode, count]) => `${mode} ${count}`)
            .join(" · ")}
        </span>
        <span className="shrink-0">
          {summary.bands} band{summary.bands === 1 ? "" : "s"}
        </span>
      </div>
    </div>,
    document.body,
  );
}

SpotCollectionPopover.displayName = "SpotCollectionPopover";

export default SpotCollectionPopover;
