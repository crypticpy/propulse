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
}
const number = (value: number) => Math.abs(value) > 0 && Math.abs(value) < 0.01 ? value.toExponential(0) : Number(value.toFixed(1)).toString();
const stamp = (time: number) => new Date(time).toLocaleString(undefined, { timeZone: "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/** Small companion to the detailed chart. Gaps remain gaps; the y range is labeled. */
export function SolarMiniChart({ points, label, unit, maxGapMs, intervalMs, domain, min, max, logarithmic }: SolarMiniChartProps) {
  const id = useId();
  const rows = points.map(point => ({ ...point, time: parseUtcInstant(point.timestamp) }))
    .filter((point): point is SolarChartPoint & { time: number } => point.time !== null && Number.isFinite(point.value) && (!logarithmic || point.value > 0))
    .sort((a, b) => a.time - b.time)
    .filter(point => !domain || (point.time < domain[1] && point.time + (intervalMs ?? 0) > domain[0]));
  if (rows.length < (intervalMs ? 1 : 2)) return <p className="mt-4 text-xs text-slate-400">{domain ? "No Kp forecast intervals available for this UTC day." : `${label}: waiting for more readings.`}</p>;
  const start = domain?.[0] ?? rows[0].time;
  const end = domain?.[1] ?? rows[rows.length - 1].time + (intervalMs ?? 0);
  if (end <= start) return null;
  const low = min ?? Math.min(...rows.map(point => point.value));
  const high = max ?? Math.max(...rows.map(point => point.value));
  const transform = (value: number) => logarithmic ? Math.log10(value) : value;
  const bottom = transform(low);
  const spread = transform(high) - bottom;
  const x = (time: number) => 32 + 252 * (time - start) / (end - start);
  const y = (value: number) => spread ? 66 - 54 * (transform(value) - bottom) / spread : 39;
  const path = rows.map((point, i) => `${i === 0 || point.time - rows[i - 1].time > maxGapMs ? "M" : "L"}${x(point.time).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ");
  const color = (kind?: SolarChartPoint["kind"]) => kind === "predicted" ? "#ffd23f" : kind === "estimated" ? "#c4b5fd" : "#44ddff";
  return <figure className="mt-4 min-w-0 border-t border-white/10 pt-3">
    <figcaption className="mb-1 text-xs text-slate-300">{label}</figcaption>
    <svg viewBox="0 0 300 88" className="block w-full" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>{label}</title>
      <desc id={`${id}-desc`}>{stamp(start)} to {stamp(end)} UTC. Range {number(low)} to {number(high)} {unit}{logarithmic ? ", logarithmic scale" : ""}. Gaps indicate missing intervals. Detailed values are available in the charts below.</desc>
      <line x1="32" x2="284" y1="66" y2="66" stroke="#64748b" strokeOpacity=".35" />
      <text x="0" y="16" fill="#94a3b8" fontSize="9">{number(high)}</text>
      <text x="0" y="67" fill="#94a3b8" fontSize="9">{number(low)}</text>
      {intervalMs ? rows.map((point, i) => <rect key={`${point.time}-${i}`} x={x(Math.max(start, point.time))} y={y(point.value)} width={Math.max(1, x(Math.min(end, point.time + intervalMs)) - x(Math.max(start, point.time)) - 2)} height={Math.max(1, 66 - y(point.value))} rx="1" fill={color(point.kind)}><title>{stamp(point.time)} UTC: {point.value} {unit} · {point.kind ?? "observed"}</title></rect>) : <path d={path} fill="none" stroke="#44ddff" strokeWidth="2" />}
      {intervalMs && min === 0 && max === 9 && <><line x1="32" x2="284" y1={y(5)} y2={y(5)} stroke="#fb7185" strokeDasharray="3 3" /><text x="283" y={y(5) - 3} textAnchor="end" fill="#fda4af" fontSize="9">Kp 5</text></>}
      <text x="32" y="82" fill="#94a3b8" fontSize="9">{domain ? "00 UTC" : new Date(start).toISOString().slice(5, 16).replace("T", " ")}</text>
      <text x="284" y="82" textAnchor="end" fill="#94a3b8" fontSize="9">{domain ? "24 UTC" : new Date(end).toISOString().slice(5, 16).replace("T", " ")}</text>
    </svg>
    {!domain && <p className="text-[10px] text-slate-400">{unit} · UTC{logarithmic ? " · log scale" : ""}{intervalMs ? " · observed / estimated" : ""}</p>}
  </figure>;
}
