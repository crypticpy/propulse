export interface SolarChartPoint {
  timestamp: string;
  value: number;
  kind?: "observed" | "estimated" | "predicted";
}

export interface SolarSeriesChartProps {
  points: SolarChartPoint[];
  label: string;
  unit: string;
  min?: number;
  max?: number;
  height?: number;
}

function path(points: Array<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

export function SolarSeriesChart({
  points,
  label,
  unit,
  min,
  max,
  height = 180,
}: SolarSeriesChartProps) {
  if (points.length === 0) return <p className="text-sm text-slate-500">No usable series.</p>;
  const width = 720;
  const padding = 24;
  const values = points.map((point) => point.value);
  const low = min ?? Math.min(...values);
  const high = max ?? Math.max(...values);
  const range = Math.max(0.000001, high - low);
  const timeValues = points.map((point) => Date.parse(point.timestamp));
  const start = Math.min(...timeValues);
  const end = Math.max(...timeValues);
  const timeRange = Math.max(1, end - start);
  const mapped = points.map((point, index) => ({
    ...point,
    x: padding + ((timeValues[index] - start) / timeRange) * (width - padding * 2),
    y: padding + (1 - (point.value - low) / range) * (height - padding * 2),
  }));
  const observed = mapped.filter((point) => point.kind !== "predicted");
  const predicted = mapped.filter((point) => point.kind === "predicted");
  const predictedWithJoin = predicted.length && observed.length
    ? [observed[observed.length - 1], ...predicted]
    : predicted;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={`${label}. ${points.length} chronological observations from ${new Date(start).toISOString()} to ${new Date(end).toISOString()}.`}
      >
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,.12)" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="rgba(255,255,255,.12)" />
        {observed.length > 1 && (
          <path d={path(observed)} fill="none" stroke="#44ddff" strokeWidth="3" strokeLinejoin="round" />
        )}
        {predictedWithJoin.length > 1 && (
          <path d={path(predictedWithJoin)} fill="none" stroke="#ffd23f" strokeWidth="3" strokeDasharray="8 7" strokeLinejoin="round" />
        )}
        {mapped.map((point) => (
          <circle
            key={`${point.timestamp}-${point.kind ?? "observed"}`}
            cx={point.x}
            cy={point.y}
            r="3"
            fill={point.kind === "predicted" ? "#ffd23f" : "#44ddff"}
          >
            <title>{`${new Date(point.timestamp).toISOString()}: ${point.value} ${unit}${point.kind ? ` (${point.kind})` : ""}`}</title>
          </circle>
        ))}
      </svg>
      {points.some((point) => point.kind === "predicted") && (
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
          <span><span className="text-cyan-300" aria-hidden="true">━━</span> Observed / estimated</span>
          <span><span className="text-amber-300" aria-hidden="true">┅┅</span> Official NOAA prediction</span>
        </div>
      )}
      <ul className="sr-only">
        {points.map((point) => (
          <li key={`accessible-${point.timestamp}-${point.kind ?? "observed"}`}>
            {new Date(point.timestamp).toISOString()}: {point.value} {unit}, {point.kind ?? "observed"}
          </li>
        ))}
      </ul>
    </div>
  );
}
