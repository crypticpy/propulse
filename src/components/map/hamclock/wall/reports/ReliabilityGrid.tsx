import { Fragment } from "react";
import { WALL_FORECAST_BANDS, wallScoreTone } from "../tiles/useWallReliability";
import { FORECAST_HOUR_MS } from "./forecastEvidence";

export function ReliabilityGrid({ matrix, start, selectedBand, selectedHour, onSelect }: {
  matrix: ReadonlyMap<string, number>;
  start: number;
  selectedBand: string;
  selectedHour: number;
  onSelect: (band: string, hour: number) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => start + i);
  const label = (hour: number) => new Date(hour * FORECAST_HOUR_MS).toISOString().slice(11, 13) + "Z";
  return <>
    <div className="hcr-reliability-grid" role="group" aria-label="Choose band and UTC hour">
      <span />{hours.map(hour => <span key={hour}>{label(hour)}</span>)}
      {WALL_FORECAST_BANDS.map(band => <Fragment key={band}><span>{band.toUpperCase()}</span>{hours.map(hour => {
        const value = matrix.get(`${band}:${hour}`);
        return <button type="button" key={hour} className={wallScoreTone(value ?? null)}
          aria-label={`${band} ${label(hour)}: ${value === undefined ? "unavailable" : `${value.toFixed(0)} of 100`}`}
          aria-pressed={band === selectedBand && hour === selectedHour} onClick={() => onSelect(band, hour)}>
          {value === undefined ? "—" : value.toFixed(0)}
        </button>;
      })}</Fragment>)}
    </div>
    <table className="sr-only"><caption>Reliability score by band and UTC hour</caption><thead><tr><th>Band</th>{hours.map(hour => <th key={hour} scope="col">{label(hour)}</th>)}</tr></thead>
      <tbody>{WALL_FORECAST_BANDS.map(band => <tr key={band}><th scope="row">{band}</th>{hours.map(hour => <td key={hour}>{matrix.get(`${band}:${hour}`) ?? "Unavailable"}</td>)}</tr>)}</tbody>
    </table>
  </>;
}
