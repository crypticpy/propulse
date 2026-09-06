import { useId, useMemo, useRef } from "react";
import { parseUtcInstant } from "@/lib/solar/normalization";
import type {
  SolarChartMarker,
  SolarChartPoint,
} from "@/components/solar/SolarSeriesChart";
import { useElementSize } from "../useElementSize";

export interface WallSeriesChartProps {
  points: SolarChartPoint[];
  /** Accessible name; the visible caption is the report's `.hcr-chart-title`. */
  label: string;
  unit: string;
  /** Preferred display range; observations outside it still widen the axis. */
  min?: number;
  max?: number;
  scale?: "linear" | "log";
  /** Bar width for interval data (Kp, hourly counts); omit for a line. */
  intervalMs?: number;
  /** Gaps wider than this are drawn as breaks, never interpolated. */
  maxGapMs?: number;
  /** Fixed time window; defaults to the span of the data. */
  domain?: [number, number];
  thresholds?: Array<{ value: number; label: string }>;
  markers?: SolarChartMarker[];
  now?: number;
}

/** Nominal size used before layout (and in jsdom, which never lays out). */
const FALLBACK = { width: 720, height: 220 };
const HOUR = 3_600_000;

const styles = {
  observed: { color: "var(--hcr-chart-observed, #44ddff)", dash: undefined },
  estimated: { color: "var(--hcr-chart-estimated, #c4b5fd)", dash: "6 5" },
  predicted: { color: "var(--hcr-chart-predicted, #ffd23f)", dash: "2 6" },
} as const;

const number = (value: number) =>
  Math.abs(value) > 0 && Math.abs(value) < 0.01
    ? value.toExponential(0)
    : Math.abs(value) >= 1000
      ? Math.round(value).toString()
      : Number(value.toFixed(1)).toString();

function timeLabel(time: number, spanMs: number) {
  const iso = new Date(time).toISOString();
  if (spanMs <= 48 * HOUR) return `${iso.slice(11, 16)}Z`;
  // Beyond half a year the day is noise and the year is the story (the
  // cycle chart runs from 2019), so ticks read YYYY-MM.
  return spanMs > 180 * 24 * HOUR ? iso.slice(0, 7) : iso.slice(5, 10);
}

/**
 * The wall's trend chart (HW-29 / #250 S1). Unlike the /solar page charts
 * it draws in CSS pixels measured from its own box, so the plot always fills
 * the slot the report's flex column gives it instead of letterboxing a fixed
 * `viewBox` into a short strip. Text is sized from the viewport height like
 * every other wall token, so axis labels stay readable from across a room
 * at 1080p and 4K alike. Colours come through the `--hcr-chart-*` layer the
 * report theme defines; the hex fallbacks only matter in isolation.
 *
 * Accessibility: the `<svg>` is an image named by `label` and a records
 * summary, and a screen-reader-only table twin lists every plotted value.
 */
export function WallSeriesChart({
  points,
  label,
  unit,
  min,
  max,
  scale = "linear",
  intervalMs,
  maxGapMs = Number.POSITIVE_INFINITY,
  domain,
  thresholds = [],
  markers = [],
  now = Date.now(),
}: WallSeriesChartProps) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const measured = useElementSize(ref);
  const width = measured.width || FALLBACK.width;
  const height = measured.height || FALLBACK.height;

  const rows = useMemo(
    () =>
      points
        .map((p) => ({ ...p, time: parseUtcInstant(p.timestamp) }))
        .filter(
          (p): p is SolarChartPoint & { time: number } =>
            p.time !== null &&
            Number.isFinite(p.value) &&
            (scale !== "log" || p.value > 0),
        )
        .sort((a, b) => a.time - b.time)
        // Interval bars stay when they overlap the domain; point samples are
        // kept inclusively at the domain start so a reading stamped exactly
        // at 00:00Z is not dropped.
        .filter(
          (p) =>
            !domain ||
            (p.time < domain[1] &&
              (intervalMs ? p.time + intervalMs > domain[0] : p.time >= domain[0])),
        ),
    [points, scale, domain, intervalMs],
  );

  if (rows.length === 0) {
    return (
      <figure className="hcr-plot hcr-plot--empty" ref={ref}>
        <figcaption>{label}: no readings yet</figcaption>
      </figure>
    );
  }

  const start = domain?.[0] ?? rows[0].time;
  const end = Math.max(
    start + 1,
    domain?.[1] ?? rows[rows.length - 1].time + (intervalMs ?? 0),
  );
  const span = end - start;

  const transform = (n: number) => (scale === "log" ? Math.log10(n) : n);
  let low = min ?? Math.min(...rows.map((p) => p.value));
  let high = max ?? Math.max(...rows.map((p) => p.value));
  low = Math.min(low, ...rows.map((p) => p.value));
  high = Math.max(high, ...rows.map((p) => p.value));
  if (high === low) {
    high = scale === "log" ? high * 10 : high + 1;
    low = scale === "log" ? low / 10 : low - 1;
  }

  // Text in viewport-height units like the rest of the wall; the SVG is
  // drawn 1:1 in CSS pixels so this is the on-screen size.
  const vh =
    typeof window === "undefined" ? FALLBACK.height / 72 : window.innerHeight / 100;
  const fs = Math.max(11, Math.round(vh * 1.45));
  const left = Math.round(fs * (scale === "log" ? 4.2 : 3.6));
  const right = Math.round(fs * 1.2);
  // A short strip (three stacked solar-wind plots) gives up the unit header
  // and tightens its gutters so the data area never collapses to a sliver.
  const compact = height < fs * 7;
  const top = Math.round(fs * (compact ? 0.6 : 1.7));
  const bottom = Math.round(fs * (compact ? 1.4 : 2.1));
  const plotW = Math.max(1, width - left - right);
  const plotH = Math.max(1, height - top - bottom);

  const x = (time: number) => left + ((time - start) / span) * plotW;
  const y = (value: number) =>
    top +
    (1 - (transform(value) - transform(low)) / (transform(high) - transform(low))) *
      plotH;

  const yTicks =
    scale === "log"
      ? Array.from(
          {
            length:
              Math.ceil(Math.log10(high)) - Math.floor(Math.log10(low)) + 1,
          },
          (_, i) => 10 ** (Math.floor(Math.log10(low)) + i),
        ).filter((n) => n >= low && n <= high)
      : (() => {
          const count = plotH > fs * 6 ? 5 : 3;
          return Array.from(
            { length: count },
            (_, i) => low + ((high - low) * i) / (count - 1),
          );
        })();
  const timeTickCount = Math.max(2, Math.min(7, Math.floor(plotW / (fs * 6))));
  const timeTicks = Array.from(
    { length: timeTickCount },
    (_, i) => start + (span * i) / (timeTickCount - 1),
  );

  const validMarkers = markers
    .map((m) => ({ ...m, time: parseUtcInstant(m.timestamp) }))
    .filter(
      (m): m is SolarChartMarker & { time: number } =>
        m.time !== null && m.time >= start && m.time <= end,
    );

  const kinds = Object.keys(styles) as Array<keyof typeof styles>;
  const segments = kinds
    .map((kind) => {
      const own = rows.filter((p) => (p.kind ?? "observed") === kind);
      if (!own.length) return null;
      const d = own
        .map(
          (p, i) =>
            `${i === 0 || p.time - own[i - 1].time > maxGapMs ? "M" : "L"}${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`,
        )
        .join(" ");
      return { kind, d, count: own.length, last: own[own.length - 1] };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
  const last = rows[rows.length - 1];
  const dotRadius = Math.max(2, fs * 0.16);
  const showDots = !intervalMs && rows.length <= plotW / (dotRadius * 6);

  const stamp = (time: number) => new Date(time).toISOString();
  const description = `${label}. ${scale === "log" ? "Logarithmic scale. " : ""}${rows.length} records from ${stamp(rows[0].time)} to ${stamp(last.time)}.${validMarkers.map((m) => ` Marker: ${m.label} at ${stamp(m.time)}.`).join("")}`;

  return (
    <figure className="hcr-plot" ref={ref}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={description}
        fontFamily="var(--hc-font-mono, monospace)"
        fontSize={fs}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={width - right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--hcr-chart-grid, rgba(255,255,255,.10))"
            />
            <text
              x={left - fs * 0.5}
              y={y(tick) + fs * 0.35}
              textAnchor="end"
              fill="var(--hcr-chart-dim, #cbd5e1)"
            >
              {number(tick)}
            </text>
          </g>
        ))}
        {!compact && (
          <text
            x={left}
            y={fs}
            fill="var(--hcr-chart-dim, #cbd5e1)"
            letterSpacing="0.08em"
          >
            {unit}
            {scale === "log" ? " · LOG" : ""} · UTC
          </text>
        )}
        {low < 0 && high > 0 && scale === "linear" && (
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
                x={width - right - fs * 0.3}
                y={y(t.value) - fs * 0.4}
                textAnchor="end"
                fill="var(--hcr-chart-warn, #fde68a)"
              >
                {t.label}
              </text>
            </g>
          ))}
        {timeTicks.map((time, i) => (
          <text
            key={i}
            x={x(time)}
            y={height - fs * 0.5}
            textAnchor={
              i === 0 ? "start" : i === timeTicks.length - 1 ? "end" : "middle"
            }
            fill="var(--hcr-chart-dim, #cbd5e1)"
          >
            {timeLabel(time, span)}
          </text>
        ))}
        {intervalMs
          ? rows.map((p, i) => {
              const kind = p.kind ?? "observed";
              const x0 = x(Math.max(start, p.time));
              const x1 = x(Math.min(end, p.time + intervalMs));
              return (
                <rect
                  key={`${p.time}-${i}`}
                  data-kind={kind}
                  x={x0 + 1}
                  y={y(p.value)}
                  width={Math.max(1, x1 - x0 - 2)}
                  height={Math.max(1, y(Math.max(0, low)) - y(p.value))}
                  rx={Math.min(3, fs * 0.2)}
                  fill={styles[kind].color}
                  fillOpacity={
                    kind === "predicted" ? 0.25 : kind === "estimated" ? 0.45 : 0.8
                  }
                />
              );
            })
          : segments.map((s) => (
              <path
                key={s.kind}
                data-series={s.kind}
                d={s.d}
                fill="none"
                stroke={styles[s.kind].color}
                strokeWidth={Math.max(2, fs * 0.18)}
                strokeDasharray={styles[s.kind].dash}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
        {showDots &&
          rows.map((p) => (
            <circle
              key={`${p.time}-dot`}
              data-kind={p.kind ?? "observed"}
              cx={x(p.time)}
              cy={y(p.value)}
              r={dotRadius}
              fill={styles[p.kind ?? "observed"].color}
            />
          ))}
        {!intervalMs && (
          <circle
            data-last-point="true"
            cx={x(last.time)}
            cy={y(last.value)}
            r={Math.max(3, fs * 0.3)}
            fill="var(--hcr-chart-now, #f8fafc)"
            stroke="var(--hcr-chart-selected-ring, #0f172a)"
            strokeWidth={Math.max(1.5, fs * 0.12)}
          />
        )}
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
              x={Math.min(x(now) + fs * 0.3, width - right - fs * 2.2)}
              y={top + fs}
              fill="var(--hcr-chart-now, #f8fafc)"
              letterSpacing="0.1em"
            >
              NOW
            </text>
          </g>
        )}
        {validMarkers.map((m) => (
          <g key={`${m.timestamp}-${m.label}`}>
            <line
              x1={x(m.time)}
              x2={x(m.time)}
              y1={top}
              y2={height - bottom}
              stroke="var(--hcr-chart-marker, #fb7185)"
              strokeWidth={Math.max(2, fs * 0.15)}
            />
            <text
              x={Math.min(x(m.time) + fs * 0.3, width - right - fs * 3)}
              y={top + fs * 2.2}
              fill="var(--hcr-chart-marker, #fb7185)"
              fontWeight="700"
            >
              {m.label}
            </text>
          </g>
        ))}
      </svg>
      <table className="sr-only" id={`${id}-values`}>
        <caption>{label} values</caption>
        <thead>
          <tr>
            <th scope="col">Time (UTC)</th>
            <th scope="col">{unit}</th>
            <th scope="col">Kind</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={`${p.time}-${p.kind ?? "observed"}`}>
              <td>{stamp(p.time)}</td>
              <td>{number(p.value)}</td>
              <td>{p.kind ?? "observed"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
