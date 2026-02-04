/**
 * TrendSparkline Component
 *
 * A tiny inline SVG sparkline for showing trend direction of numerical data.
 * Designed for use alongside K-index and SFI solar index badges in the
 * DX Console header.
 *
 * @example
 * ```tsx
 * <TrendSparkline data={[3, 4, 2, 5, 6, 4, 7]} />
 * <TrendSparkline data={kIndexHistory} color="#22d3ee" />
 * ```
 */

import { useMemo } from "react";

export interface TrendSparklineProps {
  /** Array of numerical values to plot */
  data: number[];
  /** Stroke color; defaults to currentColor to inherit from parent text */
  color?: string;
  /** Additional CSS classes for the wrapper SVG */
  className?: string;
}

/** Maximum number of data points to display */
const MAX_POINTS = 12;

/** SVG viewBox dimensions */
const VIEW_WIDTH = 40;
const VIEW_HEIGHT = 16;

/** Vertical padding so the line doesn't clip at edges */
const PADDING_Y = 1.5;

/**
 * TrendSparkline
 *
 * Renders a minimal polyline sparkline with a subtle gradient fill beneath.
 * Displays the last 8-12 data points, normalized to fit the SVG viewBox.
 * Returns null when fewer than 2 data points are provided.
 */
export function TrendSparkline({
  data,
  color = "currentColor",
  className = "",
}: TrendSparklineProps) {
  const gradientId = useMemo(
    () => `sparkline-fill-${Math.random().toString(36).slice(2, 9)}`,
    [],
  );

  const points = useMemo(() => {
    if (data.length < 2) return null;

    // Take the last MAX_POINTS entries
    const slice = data.slice(-MAX_POINTS);
    const count = slice.length;

    const min = Math.min(...slice);
    const max = Math.max(...slice);
    const range = max - min || 1; // avoid division by zero when all values equal

    const usableHeight = VIEW_HEIGHT - PADDING_Y * 2;

    return slice.map((value, i) => {
      const x = (i / (count - 1)) * VIEW_WIDTH;
      // Invert Y since SVG Y=0 is top
      const y =
        PADDING_Y + usableHeight - ((value - min) / range) * usableHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
  }, [data]);

  if (!points) return null;

  const polylinePoints = points.join(" ");

  // Build the closed polygon path for the gradient fill area:
  // line points + bottom-right corner + bottom-left corner
  const fillPoints = `${polylinePoints} ${VIEW_WIDTH.toFixed(2)},${VIEW_HEIGHT.toFixed(2)} 0,${VIEW_HEIGHT.toFixed(2)}`;

  return (
    <svg
      className={`w-10 h-4 inline-block ${className}`}
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Gradient fill beneath the line */}
      <polygon points={fillPoints} fill={`url(#${gradientId})`} />

      {/* Sparkline stroke */}
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default TrendSparkline;
