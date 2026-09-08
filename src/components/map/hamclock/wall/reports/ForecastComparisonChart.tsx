import { useId } from "react";
import { FORECAST_HOUR_MS } from "./forecastEvidence";

export interface ForecastChartPoint { hourIndex: number; physics: number | null; model?: number; observed?: number }
/** Separate score/probability and count scales; missing samples stay missing. */
export function ForecastComparisonChart({ points, selectedHour, nowHour, onSelect }: {
  points: ForecastChartPoint[]; selectedHour: number; nowHour: number; onSelect: (hour: number) => void;
}) {
  const title = useId();
  const left = 70, right = 1715, top = 20, bottom = 180;
  const countMax = Math.max(1, ...points.map(point => point.observed ?? 0));
  const x = (index: number) => left + index * (right - left) / Math.max(1, points.length - 1);
  const y = (value: number) => bottom - value / 100 * (bottom - top);
  const selected = points.find(point => point.hourIndex === selectedHour);
  const paths = (field: "physics" | "model") => {
    let drawing = false;
    return points.map((point, index) => {
      const value = point[field];
      if (value == null) { drawing = false; return ""; }
      const command = drawing ? "L" : "M"; drawing = true;
      return `${command}${x(index)},${y(value)}`;
    }).join(" ");
  };
  return <div className="hcr-comparison-chart">
    <svg viewBox="0 0 1800 220" role="img" aria-labelledby={title} onPointerMove={event => {
      const box = event.currentTarget.getBoundingClientRect();
      // SVG defaults to xMidYMid meet: account for its horizontal gutters.
      const scale = Math.min(box.width / 1800, box.height / 220);
      const inset = (box.width - 1800 * scale) / 2;
      const local = (event.clientX - box.left - inset) / scale;
      const index = Math.max(0, Math.min(points.length - 1, Math.round((local - left) / (right - left) * (points.length - 1))));
      if (points[index]) onSelect(points[index].hourIndex);
    }}>
      <title id={title}>Physics score, model probability and observed spot counts by UTC hour</title>
      {[0, 50, 100].map(value => <g key={value}><line x1={left} x2={right} y1={y(value)} y2={y(value)} className="hcr-comparison-axis" /><text x={left - 8} y={y(value) + 4} textAnchor="end">{value}</text></g>)}
      {points.map((point, index) => <g key={point.hourIndex}>
        {point.observed !== undefined && <rect className="hcr-comparison-observed" x={x(index) - 7} width={14} y={bottom - point.observed / countMax * (bottom - top)} height={point.observed / countMax * (bottom - top)} />}
        {point.model !== undefined && <circle className="hcr-comparison-model" cx={x(index)} cy={y(point.model)} r={4} />}
        {(index % 6 === 0 || index === points.length - 1) && <text x={x(index)} y={205} textAnchor="middle">{new Date(point.hourIndex * FORECAST_HOUR_MS).toISOString().slice(11, 13)}Z</text>}
        {point.hourIndex === nowHour && <line className="hcr-comparison-now" x1={x(index)} x2={x(index)} y1={top} y2={bottom}><title>Now</title></line>}
      </g>)}
      <path d={paths("physics")} className="hcr-comparison-physics" /><path d={paths("model")} className="hcr-comparison-model-line" />
      <text x={right + 8} y={top + 4}>{countMax}</text><text x={right + 8} y={bottom}>0 spots</text>
    </svg>
    <label>Hour <input type="range" min={0} max={Math.max(0, points.length - 1)} value={Math.max(0, points.findIndex(point => point.hourIndex === selectedHour))}
      onChange={event => onSelect(points[Number(event.target.value)].hourIndex)} aria-label="Evidence chart UTC hour" /></label>
    <p className="hcr-note">{selected ? `${new Date(selected.hourIndex * FORECAST_HOUR_MS).toISOString().slice(11, 16)} UTC · PHYSICS ${selected.physics?.toFixed(0) ?? "—"}/100 · MODEL ${selected.model?.toFixed(0) ?? "—"}% · SPOTS ${selected.observed ?? "—"}` : "Select an hour"}</p>
    <table className="sr-only"><caption>Chart evidence; spots are trailing 60-minute scoped samples</caption><thead><tr><th>UTC hour</th><th>Physics score</th><th>Model probability percent</th><th>Spot count</th></tr></thead><tbody>{points.map(point => <tr key={point.hourIndex}><th>{new Date(point.hourIndex * FORECAST_HOUR_MS).toISOString()}</th><td>{point.physics ?? "Unavailable"}</td><td>{point.model ?? "Unavailable"}</td><td>{point.observed ?? "Unavailable"}</td></tr>)}</tbody></table>
  </div>;
}
