import { useId, useMemo, useState } from "react";
import { parseUtcInstant } from "@/lib/solar/normalization";

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
  scale?: "linear" | "log";
  intervalMs?: number;
  maxGapMs?: number;
  thresholds?: Array<{ value: number; label: string }>;
  now?: number;
}
const styles = {
  observed: {
    color: "var(--hcr-chart-observed, #44ddff)",
    label: "Observed",
    dash: undefined,
  },
  estimated: {
    color: "var(--hcr-chart-estimated, #c4b5fd)",
    label: "Estimated",
    dash: "3 4",
  },
  predicted: {
    color: "var(--hcr-chart-predicted, #ffd23f)",
    label: "Official NOAA prediction",
    dash: "8 5",
  },
};
const number = (value: number) =>
  value !== 0 && Math.abs(value) < 0.01
    ? value.toExponential(1)
    : Number(value.toFixed(2)).toString();

export function SolarSeriesChart({
  points,
  label,
  unit,
  min,
  max,
  height = 220,
  scale = "linear",
  intervalMs,
  maxGapMs = Infinity,
  thresholds = [],
  now = Date.now(),
}: SolarSeriesChartProps) {
  const id = useId();
  const [selection, setSelection] = useState<number | null>(null);
  const [valuesOpen, setValuesOpen] = useState(false);
  const sorted = useMemo(
    () =>
      points
        .filter(
          (p) =>
            parseUtcInstant(p.timestamp) !== null &&
            Number.isFinite(p.value) &&
            (scale !== "log" || p.value > 0),
        )
        .map((p) => ({
          ...p,
          timestamp: new Date(parseUtcInstant(p.timestamp)!).toISOString(),
        }))
        .slice()
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)),
    [points, scale],
  );
  if (!sorted.length)
    return <p className="text-sm text-slate-400">No usable series.</p>;
  const width = 720;
  const left = 66,
    right = 22,
    top = 25,
    bottom = 45;
  const start = Date.parse(sorted[0].timestamp);
  const last = Date.parse(sorted[sorted.length - 1].timestamp);
  const end = Math.max(start + 1, last + (intervalMs ?? 0));
  const transform = (n: number) => (scale === "log" ? Math.log10(n) : n);
  let low = min ?? Math.min(...sorted.map((p) => p.value));
  let high = max ?? Math.max(...sorted.map((p) => p.value));
  // Do not clip valid observations when a preferred display range is exceeded.
  low = Math.min(low, ...sorted.map((p) => p.value));
  high = Math.max(high, ...sorted.map((p) => p.value));
  if (high === low) {
    high = scale === "log" ? high * 10 : high + 1;
    low = scale === "log" ? low / 10 : low - 1;
  }
  const x = (time: number) =>
    left + ((time - start) / (end - start)) * (width - left - right);
  const y = (value: number) =>
    top +
    (1 -
      (transform(value) - transform(low)) /
        (transform(high) - transform(low))) *
      (height - top - bottom);
  const ticks =
    scale === "log"
      ? Array.from(
          {
            length:
              Math.ceil(Math.log10(high)) - Math.floor(Math.log10(low)) + 1,
          },
          (_, i) => 10 ** (Math.floor(Math.log10(low)) + i),
        ).filter((n) => n >= low && n <= high)
      : Array.from({ length: 5 }, (_, i) => low + ((high - low) * i) / 4);
  const selectedIndex = Math.min(
    selection ?? sorted.length - 1,
    sorted.length - 1,
  );
  const selected = sorted[selectedIndex];
  const gaps = sorted.filter(
    (p, i) =>
      i > 0 &&
      Date.parse(p.timestamp) - Date.parse(sorted[i - 1].timestamp) > maxGapMs,
  );
  const kinds = Object.keys(styles) as Array<keyof typeof styles>;
  return (
    <div>
      <div
        className="overflow-x-auto rounded-lg"
        role="region"
        aria-label={`${label} plot; scroll horizontally on a narrow screen`}
        tabIndex={0}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[32rem]"
          role="img"
          aria-label={`${label}. ${scale === "log" ? "Logarithmic scale. " : ""}${sorted.length} records from ${new Date(start).toISOString()} to ${new Date(last).toISOString()}.`}
          onPointerDown={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const time =
              start +
              ((((event.clientX - rect.left) / rect.width) * width - left) /
                (width - left - right)) *
                (end - start);
            setSelection(
              sorted.reduce(
                (best, p, i) =>
                  Math.abs(Date.parse(p.timestamp) - time) <
                  Math.abs(Date.parse(sorted[best].timestamp) - time)
                    ? i
                    : best,
                0,
              ),
            );
          }}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={width - right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--hcr-chart-grid, rgba(255,255,255,.10))"
              />
              <text
                x={left - 8}
                y={y(tick) + 4}
                textAnchor="end"
                fill="var(--hcr-chart-dim, #cbd5e1)"
                fontSize="12"
              >
                {number(tick)}
              </text>
            </g>
          ))}
          <text
            x={left}
            y={14}
            fill="var(--hcr-chart-dim, #cbd5e1)"
            fontSize="12"
          >
            {unit}
            {scale === "log" ? " · log scale" : ""}
          </text>
          {low <= 0 && high >= 0 && scale === "linear" && (
            <line
              data-zero-line="true"
              x1={left}
              x2={width - right}
              y1={y(0)}
              y2={y(0)}
              stroke="var(--hcr-chart-axis, #94a3b8)"
              strokeDasharray="4 4"
            />
          )}
          {thresholds
            .filter((t) => t.value >= low && t.value <= high)
            .map((t) => (
              <g key={t.label}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={y(t.value)}
                  y2={y(t.value)}
                  stroke="var(--hcr-chart-warn, #fbbf24)"
                  strokeDasharray="2 5"
                />
                <text
                  x={width - right - 4}
                  y={y(t.value) - 5}
                  textAnchor="end"
                  fill="var(--hcr-chart-warn, #fde68a)"
                  fontSize="12"
                >
                  {t.label}
                </text>
              </g>
            ))}
          {Array.from(
            { length: 4 },
            (_, i) => start + ((end - start) * i) / 3,
          ).map((time, i) => (
            <text
              key={i}
              x={x(time)}
              y={height - 20}
              textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"}
              fill="var(--hcr-chart-dim, #cbd5e1)"
              fontSize="12"
            >
              {new Date(time).toISOString().slice(5, 10)}{" "}
              {new Date(time).toISOString().slice(11, 16)}Z
            </text>
          ))}
          {sorted.map((p, i) => {
            const kind = p.kind ?? "observed";
            const style = styles[kind];
            const time = Date.parse(p.timestamp);
            const previous = sorted[i - 1];
            const connected =
              previous &&
              time - Date.parse(previous.timestamp) <= maxGapMs &&
              (previous.kind ?? "observed") === kind;
            return (
              <g key={`${p.timestamp}-${kind}`} data-kind={kind}>
                {intervalMs ? (
                  <rect
                    x={x(time) + 1}
                    y={y(p.value)}
                    width={Math.max(
                      1,
                      x(Math.min(time + intervalMs, end)) - x(time) - 2,
                    )}
                    height={Math.max(1, y(Math.max(0, low)) - y(p.value))}
                    fill={style.color}
                    fillOpacity={
                      kind === "predicted"
                        ? 0.12
                        : kind === "estimated"
                          ? 0.3
                          : 0.65
                    }
                    stroke={style.color}
                    strokeDasharray={style.dash}
                  />
                ) : (
                  <>
                    {connected && (
                      <line
                        data-series-segment="true"
                        x1={x(Date.parse(previous.timestamp))}
                        y1={y(previous.value)}
                        x2={x(time)}
                        y2={y(p.value)}
                        stroke={style.color}
                        strokeWidth="2"
                        strokeDasharray={style.dash}
                      />
                    )}
                    <circle
                      cx={x(time)}
                      cy={y(p.value)}
                      r="3"
                      fill={style.color}
                    />
                  </>
                )}
              </g>
            );
          })}
          {now >= start && now <= end && (
            <g>
              <line
                x1={x(now)}
                x2={x(now)}
                y1={top}
                y2={height - bottom}
                stroke="var(--hcr-chart-now, #f8fafc)"
                strokeDasharray="2 4"
              />
              <text
                x={Math.min(x(now) + 4, width - 48)}
                y={top + 12}
                fill="var(--hcr-chart-now, #f8fafc)"
                fontSize="12"
              >
                Now
              </text>
            </g>
          )}
          <circle
            cx={x(Date.parse(selected.timestamp))}
            cy={y(selected.value)}
            r="5"
            fill="var(--hcr-chart-now, #fff)"
            stroke="var(--hcr-chart-selected-ring, #0f172a)"
            strokeWidth="2"
          />
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
        {kinds
          .filter((kind) => sorted.some((p) => (p.kind ?? "observed") === kind))
          .map((kind) => (
            <span key={kind}>
              <span style={{ color: styles[kind].color }} aria-hidden="true">
                {kind === "observed"
                  ? "━"
                  : kind === "estimated"
                    ? "┄"
                    : "┅"}{" "}
              </span>
              {styles[kind].label}
            </span>
          ))}
      </div>
      {gaps.length > 0 && (
        <p className="mt-2 text-xs text-amber-200">
          {gaps.length} gap{gaps.length === 1 ? "" : "s"} in coverage;
          disconnected records are not interpolated.
        </p>
      )}
      <label
        htmlFor={`${id}-inspect`}
        className="mt-3 block text-xs text-slate-400"
      >
        Inspect {label} — drag or use arrow keys
      </label>
      <input
        id={`${id}-inspect`}
        type="range"
        min={0}
        max={Math.max(0, sorted.length - 1)}
        step={1}
        value={selectedIndex}
        onChange={(e) => setSelection(Number(e.target.value))}
        aria-valuetext={`${selected.timestamp}: ${number(selected.value)} ${unit}, ${selected.kind ?? "observed"}`}
        className="h-11 w-full accent-cyan-300"
      />
      <output
        htmlFor={`${id}-inspect`}
        className="block break-words font-mono text-xs leading-6 text-slate-200"
        aria-live="polite"
      >
        {selected.timestamp}: {number(selected.value)} {unit},{" "}
        {selected.kind ?? "observed"}
      </output>
      <button
        type="button"
        onClick={() => setValuesOpen(!valuesOpen)}
        aria-expanded={valuesOpen}
        aria-controls={`${id}-values`}
        className="mt-2 min-h-11 rounded-lg border border-white/10 px-3 text-xs text-cyan-200 hover:bg-white/5"
      >
        {valuesOpen ? "Hide" : "Show"} values
      </button>
      {valuesOpen && (
        <div
          id={`${id}-values`}
          className="mt-2 max-h-64 overflow-auto"
          tabIndex={0}
          role="region"
          aria-label={`${label} values`}
        >
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{label} records</caption>
            <thead>
              <tr>
                <th scope="col" className="p-2">
                  Time (UTC)
                </th>
                <th scope="col" className="p-2">
                  {unit}
                </th>
                <th scope="col" className="p-2">
                  Record
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr
                  key={`${p.timestamp}-${p.kind}`}
                  className="border-t border-white/10"
                >
                  <td className="p-2">{p.timestamp}</td>
                  <td className="p-2 font-mono">{number(p.value)}</td>
                  <td className="p-2">{p.kind ?? "observed"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
