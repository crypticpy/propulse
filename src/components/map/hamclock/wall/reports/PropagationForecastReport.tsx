import { useMemo, useState } from "react";
import { useStationCastContext } from "@/hooks/useStationCastContext";
import { getMUFAtLocation } from "@/lib/api/muf";
import type { EngineReading } from "@/lib/hamclock/engineComparison";
import { FUTURECAST_HORIZONS_HOURS } from "@/lib/propagation/runtimeActivation";
import { HamClockSegmented, HamClockTabs } from "../controls";
import { WALL_FORECAST_BANDS } from "../tiles/useWallReliability";
import { reportFooter } from "../tokens";
import { WallReport } from "./WallReport";
import { EngineComparisonStrip } from "./EngineComparisonStrip";
import { useReliabilityReportData } from "./useReliabilityReportData";
import { useFutureCastReport } from "./useFutureCastReport";
import { FORECAST_HOUR_MS, modelWords } from "./forecastEvidence";
import { ForecastBandChart } from "./ForecastBandChart";
import { ForecastGrid } from "./ForecastGrid";

export function PropagationForecastReport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [band, setBand] = useState("20m");
  const [selected, setSelected] = useState<number>();
  const data = useReliabilityReportData(band, selected);
  const station = useStationCastContext();
  const input = useMemo(() => ({
    origin: data.location && station.location && Math.abs(data.location.lat - station.location.lat) < 0.001 && Math.abs(data.location.lon - station.location.lon) < 0.001 ? station.location : null,
    target: data.target, mode: data.wall.mode,
    weather: { ...(data.wall.inputs.kp === null ? {} : { kp: data.wall.inputs.kp }), ...(data.wall.inputs.sfi === null ? {} : { f107: data.wall.inputs.sfi }) },
    weatherUpdatedAt: data.wall.updatedAt ?? undefined, deriveEnvelope: station.deriveEnvelope,
  }), [data.location, data.target, data.wall.mode, data.wall.inputs.kp, data.wall.inputs.sfi, data.wall.updatedAt, station.location, station.deriveEnvelope]);
  const future = useFutureCastReport(input);
  const hour = Math.max(data.dayStart, Math.min(data.dayStart + 47, selected ?? data.wall.hourIndex));
  const score = data.matrix.get(`${band}:${hour}`);
  const best = (at: number) => WALL_FORECAST_BANDS.map(value => ({ band: value, score: data.matrix.get(`${value}:${at}`) })).filter(value => value.score !== undefined).sort((a, b) => b.score! - a.score!)[0]?.band.toUpperCase() ?? "—";
  const muf = (at: number) => data.location && data.wall.inputs.sfi !== null ? `${getMUFAtLocation(data.location.lat, data.location.lon, data.wall.inputs.sfi, new Date(at * FORECAST_HOUR_MS)).toFixed(1)} MHz` : "—";
  const model = new Map<string, number>();
  for (const candidate of WALL_FORECAST_BANDS) for (const hours of FUTURECAST_HORIZONS_HOURS) {
    const row = future.evidence.get(`${candidate}:${hours}`);
    if (row?.prediction) model.set(`${candidate}:${Math.floor(Date.parse(row.prediction.valid_time) / FORECAST_HOUR_MS)}`, (row.personalized ? row.prediction.personalized_probability : row.prediction.core_probability) * 100);
  }
  const horizon = FUTURECAST_HORIZONS_HOURS.find(value => Math.floor((future.issueTime + value * FORECAST_HOUR_MS) / FORECAST_HOUR_MS) === hour);
  const forecast = horizon === undefined ? undefined : future.evidence.get(`${band}:${horizon}`);
  const prediction = forecast?.prediction ?? (hour === data.wall.hourIndex ? data.model.prediction : null);
  const unavailable = (reason: string): EngineReading => ({ value: "—", comparable: { kind: "none" }, state: "unavailable", unavailableReason: reason });
  const physicsReading: EngineReading = score === undefined ? unavailable("NO PHYSICS INPUT") : { value: `${Math.round(score)} / 100`, comparable: { kind: "verdict", verdict: score >= 75 ? "open" : score >= 25 ? "marginal" : "closed" }, state: "ok", detail: "RELATIVE PHYSICS SCORE", ...(data.wall.updatedAt === null ? {} : { updatedAt: new Date(data.wall.updatedAt) }) };
  const modelReading: EngineReading = prediction ? { value: `${Math.round(prediction.core_probability * 100)}%`, comparable: { kind: "number", value: prediction.core_probability * 100, unit: "pct" }, confidence: prediction.confidence * 100, state: forecast?.stale || data.nowcast.staleInputBands?.includes(band) ? "stale" : "ok", updatedAt: new Date(prediction.issue_time), detail: `${band.toUpperCase()} CORE DECODE PROBABILITY${forecast?.stale ? " · STALE INPUT OR REFRESH" : ""}` } : unavailable(`MODEL OFF · ${forecast?.reason ?? (horizon === undefined ? "SELECTED HOUR NOT COVERED" : future.offReason)}`);
  const observedReading: EngineReading = data.observed && hour === data.hourIndex ? { value: `${data.observed.count60m} spots`, comparable: { kind: "number", value: data.observed.count60m, unit: "spots" }, state: data.activityError ? "stale" : "ok", updatedAt: new Date(data.activityAt!), detail: "SCOPED 60 MIN SAMPLE" } : unavailable("NO OBSERVATIONS FOR SELECTED HOUR");
  return <WallReport open={open} onClose={onClose} title="Propagation forecast report" hero={band.toUpperCase()} verdict={score === undefined ? "NO DATA" : `${Math.round(score)} / 100`}
    facts={[
      { label: "SELECTED UTC", value: new Date(hour * FORECAST_HOUR_MS).toISOString().slice(5, 16).replace("T", " ") },
      { label: "BEST NOW / +6 H", value: `${best(data.wall.hourIndex)} / ${best(data.wall.hourIndex + 6)}` },
      { label: "MUF NOW / +6 H", value: `${muf(data.wall.hourIndex)} / ${muf(data.wall.hourIndex + 6)}` },
      { label: "Kp INPUT", value: data.wall.inputs.kp?.toFixed(1) ?? "—" },
      { label: "PATH", value: data.sourceLabel },
      { label: "PROFILE", value: prediction?.profile ?? "PHYSICS" },
      { label: "MODEL VERSION", value: prediction?.model_version ?? "MODEL OFF" },
      { label: "ACTIVE HORIZONS", value: future.active.length ? future.active.map(value => `+${value} H`).join(" · ") : "NONE" },
    ]} {...reportFooter("PHYSICS · Kp/SFI OBSERVATIONS; MODEL TIMES IN STRIP", data.wall.updatedAt)} pinId="forecast" pinElement={<PropagationForecastReport open onClose={onClose} />}>
    <EngineComparisonStrip subject={`${band.toUpperCase()} · ${data.sourceLabel}`} physics={physicsReading} nowcast={modelReading} observed={observedReading} classify={() => null} />
    <HamClockSegmented label="Forecast band" value={band} options={WALL_FORECAST_BANDS.map(value => ({ value, label: value.toUpperCase() }))} onChange={setBand} />
    <div className="hcr-forecast-plot"><ForecastBandChart matrix={data.matrix} model={model} start={data.dayStart} selectedHour={hour} nowHour={Math.floor(Date.now() / FORECAST_HOUR_MS)} onSelect={setSelected} /></div>
    <HamClockTabs label="Forecast views" tabs={[
      { id: "matrix", label: "MATRIX", content: <ForecastGrid matrix={data.matrix} start={data.dayStart} selectedBand={band} selectedHour={hour} onSelect={(value, at) => { setBand(value); setSelected(at); }} /> },
      { id: "horizons", label: "HORIZONS", content: <div className="hcr-forecast-horizons">{FUTURECAST_HORIZONS_HOURS.map(hours => {
        const row = future.evidence.get(`${band}:${hours}`);
        const value = row?.prediction;
        const reason = !input.target ? "NO TARGET — PATH MODEL UNAVAILABLE" : !input.origin ? "STATION LOCATION DOES NOT MATCH" : !future.active.includes(hours) ? future.offReason : row?.reason ?? "NO MODEL RESPONSE";
        return <section key={hours} className={row?.stale ? "hc-warn-text" : undefined} aria-label={`Plus ${hours} hour forecast`}><b>+{hours} H</b>{value ? <><p>CORE {Math.round(value.core_probability * 100)}% · PERSONALIZED {row?.personalized ? `${Math.round(value.personalized_probability * 100)}%` : "UNAVAILABLE"} · CONFIDENCE {Math.round(value.confidence * 100)}%</p><p>FACTORS {modelWords(value.top_factors)} · OOD {modelWords(value.ood_flags)} · INPUT AGE {Object.entries(value.data_freshness).map(([name, age]) => `${name.replace(/_/g, " ")} ${Math.round(age)} s`).join(" · ") || "NOT SUPPLIED"}</p></> : <p>MODEL OFF · {reason}</p>}</section>;
      })}</div> },
    ]} />
  </WallReport>;
}
