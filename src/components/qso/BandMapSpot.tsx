/**
 * BandMapSpot — Individual spot pip for the Band Map widget.
 *
 * Renders a small colored circle in SVG, colored by DXCC working status.
 * Hover shows a tooltip with callsign, frequency, mode, SNR, time, and status.
 * Click emits onSpotClick for form auto-fill.
 */

import { useState, useCallback } from "react";
import type { BandMapSpot as BandMapSpotType } from "@/hooks/useBandMapSpots";
import type { DXCCStatus } from "@/hooks/useDxccStatus";

// ── Status → Color mapping ──────────────────────────────────────────────────

const STATUS_COLORS: Record<DXCCStatus, string> = {
  new_entity: "var(--color-alert-red, #ef4444)", // alert-red
  new_band: "var(--color-signal-green, #22c55e)", // signal-green
  new_mode: "var(--color-nebula-blue, #3b82f6)", // nebula-blue
  worked: "var(--color-plasma-orange, #f97316)", // plasma-orange
  dupe: "#6b7280", // gray-500
};

const UNKNOWN_COLOR = "#ffffff";

// ── Props ───────────────────────────────────────────────────────────────────

export interface BandMapSpotProps {
  /** The spot data */
  spot: BandMapSpotType;
  /** X position in SVG coordinates */
  x: number;
  /** Y position in SVG coordinates */
  y: number;
  /** DXCC working status for coloring */
  dxccStatus?: DXCCStatus | null;
  /** Click handler for form auto-fill */
  onSpotClick?: (spot: {
    callsign: string;
    frequency: number;
    mode: string;
  }) => void;
  /** Whether this spot is classified as contest-related */
  isContest?: boolean;
  /** Confidence of contest classification (0-1) */
  contestConfidence?: number;
  /** Whether contest spots should be dimmed (hide_contest mode) */
  dimContest?: boolean;
}

// ── Component ───────────────────────────────────────────────────────────────

export function BandMapSpotPip({
  spot,
  x,
  y,
  dxccStatus,
  onSpotClick,
  isContest,
  contestConfidence,
  dimContest,
}: BandMapSpotProps) {
  const [hovered, setHovered] = useState(false);

  const color = dxccStatus ? STATUS_COLORS[dxccStatus] : UNKNOWN_COLOR;

  const handleClick = useCallback(() => {
    onSpotClick?.({
      callsign: spot.callsign,
      frequency: spot.frequency,
      mode: spot.mode,
    });
  }, [onSpotClick, spot.callsign, spot.frequency, spot.mode]);

  const timeStr =
    spot.time instanceof Date
      ? spot.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : new Date(spot.time).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

  const statusLabel = dxccStatus
    ? dxccStatus.replace("_", " ").toUpperCase()
    : "UNKNOWN";

  const contestLabel =
    isContest && contestConfidence != null
      ? `Contest (${Math.round(contestConfidence * 100)}%)`
      : null;

  const tooltipLines = [
    spot.callsign,
    `${spot.frequency.toFixed(1)} kHz`,
    spot.mode,
    spot.snr != null ? `SNR: ${spot.snr} dB` : null,
    timeStr,
    statusLabel,
    contestLabel,
  ].filter(Boolean);

  // Contest spots are dimmed when filter is "hide_contest"
  const basePipOpacity = dimContest && isContest ? 0.15 : hovered ? 1 : 0.85;

  return (
    <g
      className="cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
    >
      {/* Spot shape: diamond for contest, circle for normal */}
      {isContest ? (
        <rect
          x={x - (hovered ? 4.5 : 3)}
          y={y - (hovered ? 4.5 : 3)}
          width={hovered ? 9 : 6}
          height={hovered ? 9 : 6}
          fill={color}
          opacity={basePipOpacity}
          stroke={hovered ? "#ffffff" : "none"}
          strokeWidth={hovered ? 1 : 0}
          transform={`rotate(45 ${x} ${y})`}
          style={{ transition: "opacity 0.1s" }}
        />
      ) : (
        <circle
          cx={x}
          cy={y}
          r={hovered ? 5 : 3.5}
          fill={color}
          opacity={basePipOpacity}
          stroke={hovered ? "#ffffff" : "none"}
          strokeWidth={hovered ? 1 : 0}
          style={{ transition: "r 0.1s, opacity 0.1s" }}
        />
      )}

      {/* Tooltip on hover */}
      {hovered && (
        <g>
          {/* Tooltip background */}
          <rect
            x={x + 8}
            y={y - 10 - (tooltipLines.length - 1) * 13}
            width={140}
            height={tooltipLines.length * 14 + 8}
            rx={4}
            fill="rgba(0, 0, 0, 0.9)"
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth={0.5}
          />
          {/* Tooltip text lines */}
          {tooltipLines.map((line, i) => (
            <text
              key={i}
              x={x + 14}
              y={y - (tooltipLines.length - 1 - i) * 13 + 2}
              fill={i === 0 ? "#ffffff" : "#9ca3af"}
              fontSize={i === 0 ? 11 : 10}
              fontFamily="monospace"
              fontWeight={i === 0 ? 600 : 400}
            >
              {line}
            </text>
          ))}
        </g>
      )}
    </g>
  );
}
