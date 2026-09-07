/**
 * A tiny, fixed-height inline sparkline for the Solar Pulse "What changed"
 * row. Kept intentionally minimal (no gradient fill, no axis) so it always
 * fits inside the row's ≤32px slot regardless of container width; colour is
 * left to `currentColor` so the caller sets tone via a text-su-* class.
 */
const VIEW_WIDTH = 72;
const VIEW_HEIGHT = 24;
const PADDING_Y = 3;

export interface TrendSparklinePoint {
  timestamp: string;
  value: number;
}

export interface TrendSparklineProps {
  points: TrendSparklinePoint[];
  label: string;
  className?: string;
}

export function TrendSparkline({ points, label, className = "" }: TrendSparklineProps) {
  if (points.length < 2) return null;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const usableHeight = VIEW_HEIGHT - PADDING_Y * 2;
  const coords = points
    .map((point, i) => {
      const x = (i / (points.length - 1)) * VIEW_WIDTH;
      const y = PADDING_Y + usableHeight - ((point.value - min) / range) * usableHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      className={`h-6 w-[4.5rem] shrink-0 ${className}`}
      role="img"
      aria-label={label}
    >
      <polyline
        points={coords}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
