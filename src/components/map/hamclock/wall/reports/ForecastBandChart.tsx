import { useRef } from "react";
import { useElementSize } from "../useElementSize";
import { WALL_FORECAST_BANDS } from "../tiles/useWallReliability";
import { getBandColor } from "@/lib/utils/spotColors";
import { FORECAST_HOUR_MS } from "./forecastEvidence";

export function ForecastBandChart({ matrix, model, start, selectedHour, nowHour, onSelect }: {
  matrix: ReadonlyMap<string, number>; model: ReadonlyMap<string, number>;
  start: number; selectedHour: number; nowHour: number; onSelect: (hour: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const measured = useElementSize(ref);
  const width = measured.width || 1600, height = measured.height || 180;
  const font = Math.max(12, height * 0.09);
  const left = font * 2.5, right = width - font * 2.5, top = font, bottom = height - font * 2;
  const x = (hour: number) => left + (hour - start) / 47 * (right - left);
  const y = (value: number) => bottom - value / 100 * (bottom - top);
  const hours = Array.from({ length: 48 }, (_, i) => start + i);
  const line = (values: ReadonlyMap<string, number>, band: string, connectSparse: boolean) => {
    let drawing = false;
    return hours.map(hour => {
      const value = values.get(`${band}:${hour}`);
      if (value === undefined) { if (!connectSparse) drawing = false; return ""; }
      const command = drawing ? "L" : "M"; drawing = true;
      return `${command}${x(hour)},${y(value)}`;
    }).join(" ");
  };
  return <>
    <div className="hcr-forecast-legend">{WALL_FORECAST_BANDS.map(band => <span key={band} style={{ color: getBandColor(band) }}>{band.toUpperCase()}</span>)}<span>SOLID PHYSICS · DASHED MODEL</span></div>
    <div ref={ref} className="hcr-forecast-band-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="48-hour physics band scores and permitted FutureCast probabilities" onPointerMove={event => {
        const box = event.currentTarget.getBoundingClientRect();
        const local = (event.clientX - box.left) * width / box.width;
        onSelect(start + Math.max(0, Math.min(47, Math.round((local - left) / (right - left) * 47))));
      }}>
        {[0, 50, 100].map(value => <g key={value}><line x1={left} x2={right} y1={y(value)} y2={y(value)} className="hcr-comparison-axis" /><text x={left - font / 2} y={y(value)} textAnchor="end" fontSize={font}>{value}</text></g>)}
        {hours.filter((_, i) => i % 6 === 0 || i === 47).map(hour => <text key={hour} x={x(hour)} y={height - 2} textAnchor="middle" fontSize={font}>{new Date(hour * FORECAST_HOUR_MS).toISOString().slice(8, 13).replace("T", " / ")}Z</text>)}
        {WALL_FORECAST_BANDS.map(band => <g key={band} style={{ color: getBandColor(band) }}>
          <path d={line(matrix, band, false)} fill="none" stroke="currentColor" strokeWidth={2} />
          <path d={line(model, band, true)} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="5 4" />
          {hours.filter(hour => model.has(`${band}:${hour}`)).map(hour => <circle key={hour} cx={x(hour)} cy={y(model.get(`${band}:${hour}`)!)} r={3} fill="currentColor" />)}
        </g>)}
        {nowHour >= start && nowHour < start + 48 && <line x1={x(nowHour)} x2={x(nowHour)} y1={top} y2={bottom} className="hcr-comparison-now"><title>Now</title></line>}
        <line x1={x(selectedHour)} x2={x(selectedHour)} y1={top} y2={bottom} className="hcr-comparison-axis" />
      </svg>
    </div>
    <label className="hcr-forecast-hour">UTC hour <input aria-label="Forecast chart UTC hour" type="range" min={start} max={start + 47} value={selectedHour} onChange={event => onSelect(Number(event.target.value))} /></label>
    <table className="sr-only"><caption>Forecast physics scores and model probabilities by UTC hour</caption><thead><tr><th>Band</th><th>UTC</th><th>Physics score</th><th>Model percent</th></tr></thead><tbody>{WALL_FORECAST_BANDS.flatMap(band => hours.map(hour => <tr key={`${band}:${hour}`}><th>{band}</th><td>{new Date(hour * FORECAST_HOUR_MS).toISOString()}</td><td>{matrix.get(`${band}:${hour}`) ?? "Unavailable"}</td><td>{model.get(`${band}:${hour}`) ?? "Unavailable"}</td></tr>))}</tbody></table>
  </>;
}
