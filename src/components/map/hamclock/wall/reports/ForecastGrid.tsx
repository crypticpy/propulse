import { Fragment } from "react";
import { WALL_FORECAST_BANDS, wallScoreTone } from "../tiles/useWallReliability";
import { FORECAST_HOUR_MS } from "./forecastEvidence";

/** Two UTC calendar days, preserving all 288 band/hour cells without paging. */
export function ForecastGrid({ matrix, start, selectedBand, selectedHour, onSelect }: {
  matrix: ReadonlyMap<string, number>; start: number; selectedBand: string;
  selectedHour: number; onSelect: (band: string, hour: number) => void;
}) {
  const hours = Array.from({ length: 48 }, (_, i) => start + i);
  const iso = (hour: number) => new Date(hour * FORECAST_HOUR_MS).toISOString();
  return <>
    <div className="hcr-forecast-grid" role="group" aria-label="Choose forecast band and UTC hour">
      <span />{[start, start + 24].map(day => <span key={day} className="hcr-forecast-day">{iso(day).slice(0, 10)} UTC</span>)}
      <span />{hours.map(hour => <span key={hour}>{iso(hour).slice(11, 13)}</span>)}
      {WALL_FORECAST_BANDS.map(band => <Fragment key={band}><span>{band.toUpperCase()}</span>{hours.map(hour => {
        const score = matrix.get(`${band}:${hour}`);
        return <button key={hour} type="button" className={wallScoreTone(score ?? null)} aria-pressed={band === selectedBand && hour === selectedHour}
          aria-label={`${band} ${iso(hour).slice(0, 16)} UTC: ${score?.toFixed(0) ?? "unavailable"}`} onClick={() => onSelect(band, hour)}>{score?.toFixed(0) ?? "—"}</button>;
      })}</Fragment>)}
    </div>
    <table className="sr-only"><caption>48-hour forecast matrix</caption><thead><tr><th>Band</th>{hours.map(hour => <th key={hour} scope="col">{iso(hour)}</th>)}</tr></thead><tbody>{WALL_FORECAST_BANDS.map(band => <tr key={band}><th scope="row">{band}</th>{hours.map(hour => <td key={hour}>{matrix.get(`${band}:${hour}`) ?? "Unavailable"}</td>)}</tr>)}</tbody></table>
  </>;
}
