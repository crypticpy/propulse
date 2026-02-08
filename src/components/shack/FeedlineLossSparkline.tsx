/**
 * FeedlineLossSparkline — Tiny inline SVG sparkline showing feedline loss
 * across HF bands (1.8 MHz to 50 MHz).
 *
 * Renders a polyline from low-frequency (left, low loss) to high-frequency
 * (right, high loss) with a green-to-red gradient stroke. Min and max loss
 * labels appear at the start and end of the line.
 */

import { useMemo } from "react";
import { useUserFeedlines } from "@/stores/shackStore";
import {
  calculateTotalFeedlineLoss,
  BAND_CENTER_FREQUENCIES,
} from "@/lib/data/feedlines";

// ─── HF bands ordered by frequency (1.8 MHz → 50 MHz) ──────────────────────

const HF_BANDS = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
] as const;

// ─── Types ──────────────────────────────────────────────────────────────────

interface FeedlineLossSparklineProps {
  feedlineId: string;
  height?: number;
  width?: number;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FeedlineLossSparkline({
  feedlineId,
  height = 32,
  width = 120,
}: FeedlineLossSparklineProps) {
  const feedlines = useUserFeedlines();
  const feedline = feedlines.find((f) => f.id === feedlineId);

  const data = useMemo(() => {
    if (!feedline) return null;

    const points: Array<{ band: string; freqMHz: number; lossDb: number }> = [];
    for (const band of HF_BANDS) {
      const freqMHz = BAND_CENTER_FREQUENCIES[band];
      if (freqMHz == null) continue;
      const lossDb = calculateTotalFeedlineLoss(feedline, freqMHz);
      points.push({ band, freqMHz, lossDb });
    }
    return points;
  }, [feedline]);

  // No feedline found — show gray dashed placeholder
  if (!data) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="inline-block align-middle"
        role="img"
        aria-label="No feedline data"
      >
        <line
          x1={4}
          y1={height / 2}
          x2={width - 4}
          y2={height / 2}
          stroke="#6b7280"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      </svg>
    );
  }

  if (data.length === 0) {
    return null;
  }

  // Compute SVG geometry
  const padX = 4;
  const padY = 8; // room for labels
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const losses = data.map((d) => d.lossDb);
  const minLoss = Math.min(...losses);
  const maxLoss = Math.max(...losses);
  const lossRange = maxLoss - minLoss || 1; // avoid division by zero

  // Map data points to SVG coordinates
  // X: evenly spaced across chart width
  // Y: low loss at top, high loss at bottom
  const svgPoints = data.map((d, i) => {
    const x =
      padX + (data.length > 1 ? (i / (data.length - 1)) * chartW : chartW / 2);
    const y = padY + ((d.lossDb - minLoss) / lossRange) * chartH;
    return { x, y, lossDb: d.lossDb };
  });

  const polylinePoints = svgPoints.map((p) => `${p.x},${p.y}`).join(" ");

  const gradientId = `sparkline-grad-${feedlineId}`;

  const firstPoint = svgPoints[0];
  const lastPoint = svgPoints[svgPoints.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block align-middle"
      role="img"
      aria-label={`Feedline loss: ${minLoss.toFixed(1)} dB to ${maxLoss.toFixed(1)} dB`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22c55e" /> {/* signal-green */}
          <stop offset="100%" stopColor="#ef4444" /> {/* alert-red */}
        </linearGradient>
      </defs>

      {/* Sparkline polyline */}
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Min loss label (start) */}
      <text
        x={firstPoint.x}
        y={firstPoint.y - 3}
        fontSize={8}
        fill="#9ca3af"
        textAnchor="start"
        dominantBaseline="auto"
      >
        {minLoss.toFixed(1)}
      </text>

      {/* Max loss label (end) */}
      <text
        x={lastPoint.x}
        y={lastPoint.y + 9}
        fontSize={8}
        fill="#9ca3af"
        textAnchor="end"
        dominantBaseline="auto"
      >
        {maxLoss.toFixed(1)}
      </text>
    </svg>
  );
}
