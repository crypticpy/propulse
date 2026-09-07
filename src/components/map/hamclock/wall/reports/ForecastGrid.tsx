import { Fragment } from "react";
import { WALL_FORECAST_BANDS, wallScoreTone } from "../tiles/useWallReliability";
import { HamClockSegmented } from "../controls";
import { FORECAST_HOUR_MS } from "./forecastEvidence";

/** Both UTC days remain available, with a day selector preserving 44px cells. */
export function ForecastGrid({ matrix, start, selectedBand, selectedHour, onSelect }: {
  matrix: ReadonlyMap<string, number>; start: number; selectedBand: string;
  selectedHour: number; onSelect: (band: string, hour: number) => void;
}) {
  const hours = Array.from({ length: 48 }, (_, i) => start + i);
  const day = selectedHour >= start + 24 ? "1" : "0";
  const visibleHours = hours.slice(Number(day) * 24, Number(day) * 24 + 24);
  const iso = (hour: number) => new Date(hour * FORECAST_HOUR_MS).toISOString();
  return <>
    <HamClockSegmented hideLabel label="Forecast UTC day" value={day} options={["0", "1"].map(value => ({ value, label: iso(start + Number(value) * 24).slice(0, 10) + " UTC" }))}
      onChange={value => onSelect(selectedBand, start + Number(value) * 24 + ((selectedHour - start) % 24 + 24) % 24)} />
    <div className="hcr-forecast-grid" role="group" aria-label="Choose forecast band and UTC hour">
      <span />{visibleHours.map(hour => <span key={hour}>{iso(hour).slice(11, 13)}</span>)}
      {WALL_FORECAST_BANDS.map(band => <Fragment key={band}><span>{band.toUpperCase()}</span>{visibleHours.map(hour => {
        const score = matrix.get(`${band}:${hour}`);
        return <button key={hour} type="button" className={wallScoreTone(score ?? null)} aria-pressed={band === selectedBand && hour === selectedHour}
          aria-label={`${band} ${iso(hour).slice(0, 16)} UTC: ${score?.toFixed(0) ?? "unavailable"}`} onClick={() => onSelect(band, hour)}>{score?.toFixed(0) ?? "—"}</button>;
      })}</Fragment>)}
    </div>
    <table className="sr-only"><caption>48-hour forecast matrix</caption><thead><tr><th>Band</th>{hours.map(hour => <th key={hour} scope="col">{iso(hour)}</th>)}</tr></thead><tbody>{WALL_FORECAST_BANDS.map(band => <tr key={band}><th scope="row">{band}</th>{hours.map(hour => <td key={hour}>{matrix.get(`${band}:${hour}`) ?? "Unavailable"}</td>)}</tr>)}</tbody></table>
  </>;
}
