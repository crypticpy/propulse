/**
 * BandMap — Real-time SVG band map widget showing spots as colored pips.
 *
 * Horizontal axis: frequency (kHz) with gridlines at segment boundaries.
 * Vertical axis: time (most recent at top), 5px spacing per minute.
 * Zoom via mouse wheel (frequency zoom), pan via click-drag.
 * Dark theme: void-black background, gridlines in space-900.
 *
 * UX: NO horizontal scroll — zoom + pan only (per project rules).
 */

import {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  type WheelEvent as ReactWheelEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { BAND_RANGES } from "@/lib/data/bandRanges";
import { useBandMapSpots } from "@/hooks/useBandMapSpots";
import { BandMapSpotPip } from "./BandMapSpot";
import { BandMapContestMarker } from "./BandMapContestMarker";
import type { DXCCStatus } from "@/hooks/useDxccStatus";
import type { ContestFilterMode } from "./BandMapControls";

// ── Props ───────────────────────────────────────────────────────────────────

export interface BandMapProps {
  /** Selected band */
  band: string;
  /** Time range in minutes (default 15) */
  timeRange?: number;
  /** Click handler for spot auto-fill */
  onSpotClick?: (spot: {
    callsign: string;
    frequency: number;
    mode: string;
  }) => void;
  /** Optional extra class names */
  className?: string;
  /** Contest filter mode (default "all") */
  contestFilter?: ContestFilterMode;
  /** Whether to show contest sub-band markers (default false) */
  showSubBands?: boolean;
}

// ── Constants ───────────────────────────────────────────────────────────────

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.15;
const PX_PER_MINUTE = 5;
const AXIS_LEFT = 45; // left gutter for time labels
const AXIS_TOP = 16; // top gutter for freq labels
const AXIS_RIGHT = 8;
const AXIS_BOTTOM = 4;

// ── Helper: format frequency ────────────────────────────────────────────────

function formatFreq(kHz: number): string {
  if (kHz >= 1000) {
    return `${(kHz / 1000).toFixed(kHz % 1000 === 0 ? 0 : 1)}`;
  }
  return kHz.toFixed(0);
}

// ── Component ───────────────────────────────────────────────────────────────

export function BandMap({
  band,
  timeRange = 15,
  onSpotClick,
  className = "",
  contestFilter = "all",
  showSubBands = false,
}: BandMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(400);
  const [height, setHeight] = useState(200);

  // Zoom and pan state (frequency axis)
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState(0); // offset in kHz
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; offset: number } | null>(null);

  // Resize handle
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null);

  // Band range
  const range = BAND_RANGES[band];
  const bandSpan = range ? range.endKHz - range.startKHz : 100;

  // Spots
  const { spots, source } = useBandMapSpots(band, timeRange);

  // ── Measure container width ─────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ── Frequency axis viewport ─────────────────────────────────────────────

  const viewport = useMemo(() => {
    if (!range) return { startKHz: 0, endKHz: 100, spanKHz: 100 };

    const visibleSpan = bandSpan / zoom;
    const center = range.startKHz + bandSpan / 2 + panOffset;
    let startKHz = center - visibleSpan / 2;
    let endKHz = center + visibleSpan / 2;

    // Clamp to band edges
    if (startKHz < range.startKHz) {
      startKHz = range.startKHz;
      endKHz = startKHz + visibleSpan;
    }
    if (endKHz > range.endKHz) {
      endKHz = range.endKHz;
      startKHz = endKHz - visibleSpan;
    }

    return { startKHz, endKHz, spanKHz: endKHz - startKHz };
  }, [range, zoom, panOffset, bandSpan]);

  // ── Coordinate helpers ──────────────────────────────────────────────────

  const plotWidth = containerWidth - AXIS_LEFT - AXIS_RIGHT;
  const plotHeight = height - AXIS_TOP - AXIS_BOTTOM;

  const freqToX = useCallback(
    (freqKHz: number): number => {
      const t = (freqKHz - viewport.startKHz) / viewport.spanKHz;
      return AXIS_LEFT + t * plotWidth;
    },
    [viewport, plotWidth],
  );

  const timeToY = useCallback((date: Date): number => {
    const now = Date.now();
    const ageMs = now - date.getTime();
    const ageMinutes = ageMs / 60000;
    // Most recent at top
    return AXIS_TOP + ageMinutes * PX_PER_MINUTE;
  }, []);

  // ── Zoom via mouse wheel ────────────────────────────────────────────────

  const handleWheel = useCallback((e: ReactWheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((prev) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)));
  }, []);

  // ── Pan via click-drag ──────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return; // left click only
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, offset: panOffset };
    },
    [panOffset],
  );

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      if (!isPanning || !panStartRef.current) return;
      const dx = e.clientX - panStartRef.current.x;
      // Convert pixels to kHz
      const kHzPerPx = viewport.spanKHz / plotWidth;
      const newOffset = panStartRef.current.offset - dx * kHzPerPx;
      // Clamp so viewport stays within band
      const maxOffset = bandSpan / 2;
      setPanOffset(Math.max(-maxOffset, Math.min(maxOffset, newOffset)));
    },
    [isPanning, viewport.spanKHz, plotWidth, bandSpan],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  // ── Resize via bottom handle ────────────────────────────────────────────

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      resizeStartRef.current = { y: e.clientY, height };
    },
    [height],
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: globalThis.MouseEvent) => {
      if (!resizeStartRef.current) return;
      const dy = e.clientY - resizeStartRef.current.y;
      const newHeight = Math.max(
        120,
        Math.min(500, resizeStartRef.current.height + dy),
      );
      setHeight(newHeight);
    };

    const handleUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isResizing]);

  // ── Reset zoom/pan on band change ──────────────────────────────────────

  useEffect(() => {
    setZoom(1);
    setPanOffset(0);
  }, [band]);

  // ── Gridlines ─────────────────────────────────────────────────────────

  const gridlines = useMemo(() => {
    if (!range) return [];

    const lines: { kHz: number; label: string }[] = [];
    const spanKHz = viewport.spanKHz;

    // Choose gridline spacing based on visible span
    let step: number;
    if (spanKHz > 1000) step = 200;
    else if (spanKHz > 500) step = 100;
    else if (spanKHz > 200) step = 50;
    else if (spanKHz > 100) step = 25;
    else if (spanKHz > 50) step = 10;
    else step = 5;

    const startRounded = Math.ceil(viewport.startKHz / step) * step;
    for (let f = startRounded; f <= viewport.endKHz; f += step) {
      lines.push({ kHz: f, label: formatFreq(f) });
    }

    return lines;
  }, [range, viewport]);

  // ── Time gridlines ────────────────────────────────────────────────────

  const timeGridlines = useMemo(() => {
    const lines: { minutes: number; label: string }[] = [];
    const step = timeRange <= 5 ? 1 : timeRange <= 15 ? 5 : 10;
    for (let m = 0; m <= timeRange; m += step) {
      lines.push({
        minutes: m,
        label: m === 0 ? "Now" : `-${m}m`,
      });
    }
    return lines;
  }, [timeRange]);

  // ── Visible spots (filter by viewport bounds + contest filter) ──────

  const visibleSpots = useMemo(() => {
    return spots.filter((s) => {
      if (s.frequency < viewport.startKHz || s.frequency > viewport.endKHz)
        return false;
      const ageMinutes = (Date.now() - s.time.getTime()) / 60000;
      if (ageMinutes > timeRange) return false;

      // Contest filter: "contest_only" hides non-contest spots entirely
      if (contestFilter === "contest_only" && !s.isContest) return false;

      return true;
    });
  }, [spots, viewport, timeRange, contestFilter]);

  // ── Empty state ───────────────────────────────────────────────────────

  if (!range) {
    return (
      <div
        className={`bg-void-black border border-white/10 rounded-lg p-4 text-center text-gray-500 text-sm ${className}`}
      >
        Select a band to view the band map
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative bg-void-black border border-white/10 rounded-lg overflow-hidden ${className}`}
    >
      <svg
        width={containerWidth}
        height={height}
        className={isPanning ? "cursor-grabbing" : "cursor-grab"}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Plot area background */}
        <rect
          x={AXIS_LEFT}
          y={AXIS_TOP}
          width={plotWidth}
          height={plotHeight}
          fill="rgba(0, 0, 0, 0.3)"
          rx={2}
        />

        {/* Contest sub-band markers (render behind gridlines and spots) */}
        <BandMapContestMarker
          band={band}
          xScale={freqToX}
          height={plotHeight}
          yOffset={AXIS_TOP}
          visible={showSubBands}
        />

        {/* Frequency gridlines */}
        {gridlines.map((gl) => {
          const x = freqToX(gl.kHz);
          if (x < AXIS_LEFT || x > AXIS_LEFT + plotWidth) return null;
          return (
            <g key={`freq-${gl.kHz}`}>
              <line
                x1={x}
                y1={AXIS_TOP}
                x2={x}
                y2={AXIS_TOP + plotHeight}
                stroke="rgba(255, 255, 255, 0.06)"
                strokeWidth={0.5}
              />
              <text
                x={x}
                y={AXIS_TOP - 4}
                fill="#6b7280"
                fontSize={8}
                fontFamily="monospace"
                textAnchor="middle"
              >
                {gl.label}
              </text>
            </g>
          );
        })}

        {/* Time gridlines */}
        {timeGridlines.map((tl) => {
          const y = AXIS_TOP + tl.minutes * PX_PER_MINUTE;
          if (y > AXIS_TOP + plotHeight) return null;
          return (
            <g key={`time-${tl.minutes}`}>
              <line
                x1={AXIS_LEFT}
                y1={y}
                x2={AXIS_LEFT + plotWidth}
                y2={y}
                stroke="rgba(255, 255, 255, 0.06)"
                strokeWidth={0.5}
              />
              <text
                x={AXIS_LEFT - 4}
                y={y + 3}
                fill="#6b7280"
                fontSize={8}
                fontFamily="monospace"
                textAnchor="end"
              >
                {tl.label}
              </text>
            </g>
          );
        })}

        {/* Spots */}
        {visibleSpots.map((spot, i) => {
          const x = freqToX(spot.frequency);
          const y = timeToY(spot.time);

          // Only render spots within the plot area
          if (
            x < AXIS_LEFT ||
            x > AXIS_LEFT + plotWidth ||
            y < AXIS_TOP ||
            y > AXIS_TOP + plotHeight
          ) {
            return null;
          }

          // We don't have per-spot DXCC status from the hook (would require
          // individual lookups). Derive a simple heuristic status if dxcc is present.
          const dxccStatus: DXCCStatus | null = null;

          return (
            <BandMapSpotPip
              key={`${spot.callsign}-${spot.frequency}-${i}`}
              spot={spot}
              x={x}
              y={y}
              dxccStatus={dxccStatus}
              onSpotClick={onSpotClick}
              isContest={spot.isContest}
              contestConfidence={spot.contestConfidence}
              dimContest={contestFilter === "hide_contest"}
            />
          );
        })}

        {/* No spots message */}
        {visibleSpots.length === 0 && (
          <text
            x={AXIS_LEFT + plotWidth / 2}
            y={AXIS_TOP + plotHeight / 2}
            fill="#4b5563"
            fontSize={11}
            fontFamily="sans-serif"
            textAnchor="middle"
          >
            {source === "none"
              ? "No spot source connected"
              : "No spots in this time window"}
          </text>
        )}

        {/* Band label */}
        <text
          x={AXIS_LEFT + plotWidth - 4}
          y={AXIS_TOP + 12}
          fill="rgba(255, 255, 255, 0.15)"
          fontSize={14}
          fontFamily="monospace"
          fontWeight={700}
          textAnchor="end"
        >
          {band}
        </text>

        {/* Frequency unit label */}
        <text
          x={AXIS_LEFT + plotWidth / 2}
          y={AXIS_TOP - 4}
          fill="rgba(255, 255, 255, 0.08)"
          fontSize={7}
          fontFamily="monospace"
          textAnchor="middle"
        >
          MHz
        </text>
      </svg>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize flex items-center justify-center hover:bg-white/5 transition-colors"
        onMouseDown={handleResizeMouseDown}
      >
        <div className="w-8 h-0.5 rounded-full bg-white/20" />
      </div>
    </div>
  );
}
