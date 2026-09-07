import { useId } from "react";
import { parseUtcInstant } from "@/lib/solar/normalization";
import type { SolarChartPoint } from "./SolarSeriesChart";

export interface SolarMiniChartProps {
  points: SolarChartPoint[];
  label: string;
  unit: string;
  maxGapMs: number;
  intervalMs?: number;
  domain?: [number, number];
  min?: number;
  max?: number;
  logarithmic?: boolean;
  /**
   * Floor, in pixels, for the plot area: the SVG box and the "waiting for
   * readings" placeholder that stands in for it when a feed is short.
   * DS-04: the Solar Pulse key-readings cards pass 96 so all four charts
   * occupy the same slot in either state. The plot keeps its 300x88 viewBox
   * aspect ratio — a hard height would make `preserveAspectRatio` letterbox
   * the drawing and leave gutters inside the card — so this only raises the
   * box on narrow cards. Omitted by every other caller, which leaves the
   * original width-driven height unchanged.
   */
  minPlotHeight?: number;
}
const number = (value: number) =>
  Math.abs(value) > 0 && Math.abs(value) < 0.01
    ? value.toExponential(0)
    : Number(value.toFixed(1)).toString();
const stamp = (time: number) =>
  new Date(time).toLocaleString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/**
 * Small companion to the detailed chart. Gaps remain gaps; the y range is
 * labeled. Every colour is a CSS custom property (`--hcr-chart-*`) whose
 * fallback is a station token, so a HamClock report (which sets every
 * `--hcr-chart-*` from its own theme under `[data-hamclock-theme]`, see
 * `hamclock-wall-report.css`) still recolours the chart (HW-29), while
 * /solar — which never sets them — follows the app theme and stays legible
 * on the light canvas (DS-03).
 */
export function SolarMiniChart({
  points,
  label,
  unit,
  maxGapMs,
  intervalMs,
  domain,
  min,
  max,
  logarithmic,
  minPlotHeight,
}: SolarMiniChartProps) {
  const id = useId();
  const plotStyle = minPlotHeight ? { minHeight: minPlotHeight } : undefined;
  const axisCaption = domain ? null : (
    <p className="text-[10px] text-su-muted">
      {unit} · UTC{logarithmic ? " · log scale" : ""}
      {intervalMs ? " · observed / estimated" : ""}
    </p>
  );
  const rows = points
    .map((point) => ({ ...point, time: parseUtcInstant(point.timestamp) }))
    .filter(
      (point): point is SolarChartPoint & { time: number } =>
        point.time !== null &&
        Number.isFinite(point.value) &&
        (!logarithmic || point.value > 0),
    )
    .sort((a, b) => a.time - b.time)
    .filter(
      (point) =>
        !domain ||
        (point.time < domain[1] && point.time + (intervalMs ?? 0) > domain[0]),
    );
  if (rows.length < (intervalMs ? 1 : 2)) {
    if (!minPlotHeight)
      return (
        <p className="mt-4 text-xs text-su-muted">
          {domain
            ? "No Kp forecast intervals available for this UTC day."
            : `${label}: waiting for more readings.`}
        </p>
      );
    // A short feed keeps the same figure anatomy — caption, a plot box of
    // the same size, axis caption — so a key-readings card does not shrink
    // out of line with its neighbours while it waits for data.
    return (
      <figure className="mt-4 min-w-0 border-t border-su-line/40 pt-3">
        <figcaption className="mb-1 text-xs text-su-muted">{label}</figcaption>
        <p
          className="flex w-full items-center text-xs text-su-muted"
          style={{ ...plotStyle, aspectRatio: "300 / 88" }}
        >
          {domain
            ? "No Kp forecast intervals available for this UTC day."
            : "Waiting for more readings."}
        </p>
        {axisCaption}
      </figure>
    );
  }
  const start = domain?.[0] ?? rows[0].time;
  const end = domain?.[1] ?? rows[rows.length - 1].time + (intervalMs ?? 0);
  if (end <= start) return null;
  const low = min ?? Math.min(...rows.map((point) => point.value));
  const high = max ?? Math.max(...rows.map((point) => point.value));
  const transform = (value: number) =>
    logarithmic ? Math.log10(value) : value;
  const bottom = transform(low);
  const spread = transform(high) - bottom;
  const x = (time: number) => 32 + (252 * (time - start)) / (end - start);
  const y = (value: number) =>
    spread ? 66 - (54 * (transform(value) - bottom)) / spread : 39;
  const path = rows
    .map(
      (point, i) =>
        `${i === 0 || point.time - rows[i - 1].time > maxGapMs ? "M" : "L"}${x(point.time).toFixed(2)},${y(point.value).toFixed(2)}`,
    )
    .join(" ");
  const color = (kind?: SolarChartPoint["kind"]) =>
    kind === "predicted"
      ? "var(--hcr-chart-predicted, var(--su-warning))"
      : kind === "estimated"
        ? "var(--hcr-chart-estimated, var(--su-success))"
        : "var(--hcr-chart-observed, var(--su-info))";
  return (
    <figure className="mt-4 min-w-0 border-t border-su-line/40 pt-3">
      <figcaption className="mb-1 text-xs text-su-muted">{label}</figcaption>
      <svg
        viewBox="0 0 300 88"
        className="block w-full"
        style={plotStyle}
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>{label}</title>
        <desc id={`${id}-desc`}>
          {stamp(start)} to {stamp(end)} UTC. Range {number(low)} to{" "}
          {number(high)} {unit}
          {logarithmic ? ", logarithmic scale" : ""}. Gaps indicate missing
          intervals. Detailed values are available in the charts below.
        </desc>
        <line
          x1="32"
          x2="284"
          y1="66"
          y2="66"
          stroke="var(--hcr-chart-axis, var(--su-line))"
          strokeOpacity=".35"
        />
        <text
          x="0"
          y="16"
          fill="var(--hcr-chart-dim, var(--su-muted))"
          fontSize="9"
        >
          {number(high)}
        </text>
        <text
          x="0"
          y="67"
          fill="var(--hcr-chart-dim, var(--su-muted))"
          fontSize="9"
        >
          {number(low)}
        </text>
        {intervalMs ? (
          rows.map((point, i) => (
            <rect
              key={`${point.time}-${i}`}
              x={x(Math.max(start, point.time))}
              y={y(point.value)}
              width={Math.max(
                1,
                x(Math.min(end, point.time + intervalMs)) -
                  x(Math.max(start, point.time)) -
                  2,
              )}
              height={Math.max(1, 66 - y(point.value))}
              rx="1"
              fill={color(point.kind)}
            >
              <title>
                {stamp(point.time)} UTC: {point.value} {unit} ·{" "}
                {point.kind ?? "observed"}
              </title>
            </rect>
          ))
        ) : (
          <path
            d={path}
            fill="none"
            stroke="var(--hcr-chart-observed, var(--su-info))"
            strokeWidth="2"
          />
        )}
        {intervalMs && min === 0 && max === 9 && (
          <>
            <line
              x1="32"
              x2="284"
              y1={y(5)}
              y2={y(5)}
              stroke="var(--hcr-chart-warn, var(--su-danger))"
              strokeDasharray="3 3"
            />
            <text
              x="283"
              y={y(5) - 3}
              textAnchor="end"
              fill="var(--hcr-chart-warn, var(--su-danger))"
              fontSize="9"
            >
              Kp 5
            </text>
          </>
        )}
        <text
          x="32"
          y="82"
          fill="var(--hcr-chart-dim, var(--su-muted))"
          fontSize="9"
        >
          {domain
            ? "00 UTC"
            : new Date(start).toISOString().slice(5, 16).replace("T", " ")}
        </text>
        <text
          x="284"
          y="82"
          textAnchor="end"
          fill="var(--hcr-chart-dim, var(--su-muted))"
          fontSize="9"
        >
          {domain
            ? "24 UTC"
            : new Date(end).toISOString().slice(5, 16).replace("T", " ")}
        </text>
      </svg>
      {axisCaption}
    </figure>
  );
}
