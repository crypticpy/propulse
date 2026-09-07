import { useMemo, useState } from "react";
import { useStationCastContext } from "@/hooks/useStationCastContext";
import { useSolarResource } from "@/hooks/useSolarResource";
import type { KpPoint } from "@/lib/solar/dataTypes";
import { getMUFAtLocation } from "@/lib/api/muf";
import { compareEngines, probabilityStepClassifier, type EngineReading } from "@/lib/hamclock/engineComparison";
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

interface PropagationForecastReportProps {
  open: boolean;
  onClose: () => void;
  initialBand?: string;
  initialHour?: number;
  initialTab?: string;
}

export function PropagationForecastReport({ open, onClose, initialBand = "20m", initialHour, initialTab = "matrix" }: PropagationForecastReportProps) {
  const [band, setBand] = useState(initialBand);
  const [selected, setSelected] = useState<number | undefined>(initialHour);
  const [tab, setTab] = useState(initialTab);
  const data = useReliabilityReportData(band, selected);
  const station = useStationCastContext();
  const kpResource = useSolarResource<KpPoint[]>("noaa-k-index", open);
  const input = useMemo(() => ({
    origin: data.location && station.location && Math.abs(data.location.lat - station.location.lat) < 0.001 && Math.abs(data.location.lon - station.location.lon) < 0.001 ? station.location : null,
    target: data.target, mode: data.wall.mode,
    weather: { ...(data.wall.inputs.kp === null ? {} : { kp: data.wall.inputs.kp }), ...(data.wall.inputs.sfi === null ? {} : { f107: data.wall.inputs.sfi }) },
    weatherUpdatedAt: data.wall.updatedAt ?? undefined, deriveEnvelope: station.deriveEnvelope,
  }), [data.location, data.target, data.wall.mode, data.wall.inputs.kp, data.wall.inputs.sfi, data.wall.updatedAt, station.location, station.deriveEnvelope]);
  const future = useFutureCastReport();
  const hour = Math.max(data.dayStart, Math.min(data.dayStart + 47, selected ?? data.wall.hourIndex));
  const score = data.matrix.get(`${band}:${hour}`);
  const ranked = (at: number) => WALL_FORECAST_BANDS.map(value => ({ band: value, score: data.matrix.get(`${value}:${at}`) })).filter(value => value.score !== undefined).sort((a, b) => b.score! - a.score!)[0];
  const best = (at: number) => ranked(at)?.band.toUpperCase() ?? "—";
  const bestSix = ranked(data.wall.hourIndex + 6);
  const kpPoint = kpResource.data?.envelope.data.find(point => {
    const start = Date.parse(point.time_tag);
    return point.kind === "predicted" && Number.isFinite(point.kp) && point.kp >= 0 && point.kp <= 9 &&
      hour * FORECAST_HOUR_MS >= start && hour * FORECAST_HOUR_MS < start + 3 * FORECAST_HOUR_MS;
  });
  const kpStale = kpResource.isError || kpResource.data?.state === "stale";
  const muf = (at: number) => data.location && data.wall.inputs.sfi !== null ? `${getMUFAtLocation(data.location.lat, data.location.lon, data.wall.inputs.sfi, new Date(at * FORECAST_HOUR_MS)).toFixed(1)} MHz` : "—";
  const model = new Map<string, number>();
  for (const candidate of WALL_FORECAST_BANDS) for (const hours of FUTURECAST_HORIZONS_HOURS) {
    const row = future.evidence.get(`${candidate}:${hours}`);
    if (row?.prediction) model.set(`${candidate}:${Math.floor(Date.parse(row.prediction.valid_time) / FORECAST_HOUR_MS)}`, (row.personalized ? row.prediction.personalized_probability : row.prediction.core_probability) * 100);
  }
  const horizon = FUTURECAST_HORIZONS_HOURS.find(value => Math.floor((future.issueTime + value * FORECAST_HOUR_MS) / FORECAST_HOUR_MS) === hour);
  const forecast = horizon === undefined ? undefined : future.evidence.get(`${band}:${horizon}`);
  const prediction = forecast?.prediction ?? (hour === data.wall.hourIndex ? data.model.prediction : null);
  const personalized = forecast ? forecast.personalized : data.nowcast.personalized;
  const probability = prediction ? (personalized ? prediction.personalized_probability : prediction.core_probability) : 0;
  const unavailable = (reason: string): EngineReading => ({ value: "—", comparable: { kind: "none" }, state: "unavailable", unavailableReason: reason });
  const physicsReading: EngineReading = score === undefined ? unavailable("NO PHYSICS INPUT") : { value: `${Math.round(score)} / 100`, comparable: { kind: "verdict", verdict: score >= 75 ? "open" : score >= 25 ? "marginal" : "closed" }, state: "ok", detail: "RELATIVE PHYSICS SCORE", ...(data.wall.updatedAt === null ? {} : { updatedAt: new Date(data.wall.updatedAt) }) };
  const modelReading: EngineReading = prediction ? { value: `${Math.round(probability * 100)}%`, comparable: { kind: "number", value: probability * 100, unit: "pct" }, confidence: prediction.confidence * 100, state: forecast?.stale || data.nowcast.staleInputBands?.includes(band) ? "stale" : "ok", updatedAt: new Date(prediction.issue_time), detail: `${band.toUpperCase()} ${personalized ? "PERSONALIZED" : "CORE DECODE PROBABILITY"}${forecast?.stale ? " · STALE INPUT OR REFRESH" : ""}` } : unavailable(`MODEL OFF · ${forecast?.reason ?? (hour === data.wall.hourIndex ? data.model.reason : horizon === undefined ? "SELECTED HOUR NOT COVERED" : future.offReason)}`);
  const observedReading: EngineReading = data.observed && hour === data.hourIndex ? { value: `${data.observed.count60m} spots`, comparable: { kind: "number", value: data.observed.count60m, unit: "spots" }, state: data.activityError ? "stale" : "ok", updatedAt: new Date(data.activityAt!), detail: "SCOPED 60 MIN SAMPLE" } : unavailable("NO OBSERVATIONS FOR SELECTED HOUR");
  const bestModel = bestSix ? future.evidence.get(`${bestSix.band}:6`) : undefined;
  const bestProbability = bestModel?.prediction ? (bestModel.personalized ? bestModel.prediction.personalized_probability : bestModel.prediction.core_probability) * 100 : null;
  const bestComparison = compareEngines(
    bestSix ? { value: "", state: "ok", comparable: { kind: "verdict", verdict: bestSix.score! >= 75 ? "open" : bestSix.score! >= 25 ? "marginal" : "closed" } } : unavailable("NO PHYSICS INPUT"),
    bestProbability === null ? unavailable("MODEL OFF") : { value: "", state: bestModel?.stale ? "stale" : "ok", comparable: { kind: "number", value: bestProbability, unit: "pct" } },
    unavailable("NO FUTURE OBSERVATIONS"), probabilityStepClassifier(),
  );
  return <WallReport open={open} onClose={onClose} title="Propagation forecast report" hero={<><small className="hcr-forecast-hero-note">BEST IN 6 H</small>{bestSix?.band.toUpperCase() ?? "—"}<span className="hcr-forecast-hero-score">{bestSix ? `${Math.round(bestSix.score!)} / 100` : "NO DATA"}</span><small className="hcr-forecast-hero-note">{!bestSix ? "NO PHYSICS DATA" : bestComparison.word === "NO COMPARISON" ? "PHYSICS ONLY" : `MODEL / PHYSICS ${bestComparison.word}`}{bestModel?.stale ? " · STALE MODEL" : ""}</small></>}
    facts={[
      { label: `SELECTED UTC · ${band.toUpperCase()}`, value: new Date(hour * FORECAST_HOUR_MS).toISOString().slice(5, 16).replace("T", " ") },
      { label: "BEST NOW / +6 H", value: `${best(data.wall.hourIndex)} / ${best(data.wall.hourIndex + 6)}` },
      { label: "MUF NOW / +6 H", value: `${muf(data.wall.hourIndex)} / ${muf(data.wall.hourIndex + 6)}` },
      { label: "Kp FORECAST · NOAA", value: kpPoint ? <span className={kpStale ? "hc-warn-text" : undefined}>{kpPoint.kp.toFixed(1)}{kpStale ? " · STALE" : ""}</span> : "NO FORECAST FOR HOUR" },
      { label: "PATH", value: data.sourceLabel },
      { label: "PROFILE", value: prediction?.profile ?? "PHYSICS" },
      { label: "MODEL VERSION", value: prediction?.model_version ?? "MODEL OFF" },
      { label: "ACTIVE HORIZONS", value: future.active.length ? `${future.active.map(value => `+${value}`).join(" / ")} H` : "NONE" },
    ]} {...reportFooter("PHYSICS · Kp/SFI OBSERVATIONS; MODEL TIMES IN STRIP", data.wall.updatedAt)} pinId="forecast" pinElement={<PropagationForecastReport open onClose={onClose} initialBand={band} initialHour={selected} initialTab={tab} />}>
    <EngineComparisonStrip subject={`${band.toUpperCase()} · ${data.sourceLabel}`} physics={physicsReading} nowcast={modelReading} observed={observedReading} classify={(value, unit) => unit === "spots" ? null : probabilityStepClassifier()(value, unit)} />
    <div className="hcr-forecast-plot"><ForecastBandChart matrix={data.matrix} model={model} start={data.dayStart} selectedHour={hour} nowHour={Math.floor(Date.now() / FORECAST_HOUR_MS)} onSelect={setSelected} /></div>
    <HamClockTabs label="Forecast views" active={tab} onChange={setTab} tabs={[
      { id: "matrix", label: "MATRIX", content: <ForecastGrid matrix={data.matrix} start={data.dayStart} selectedBand={band} selectedHour={hour} onSelect={(value, at) => { setBand(value); setSelected(at); }} /> },
      { id: "horizons", label: "HORIZONS", content: <><HamClockSegmented hideLabel label="Forecast band" value={band} options={WALL_FORECAST_BANDS.map(value => ({ value, label: value.toUpperCase() }))} onChange={setBand} /><div className="hcr-forecast-horizons">{FUTURECAST_HORIZONS_HOURS.map(hours => {
        const row = future.evidence.get(`${band}:${hours}`);
        const value = row?.prediction;
        const reason = !input.target ? "NO TARGET — PATH MODEL UNAVAILABLE" : !input.origin ? "STATION LOCATION DOES NOT MATCH" : !future.active.includes(hours) ? future.offReason : row?.reason ?? "NO MODEL RESPONSE";
        return <section key={hours} className={row?.stale ? "hc-warn-text" : undefined} aria-label={`Plus ${hours} hour forecast`}><b>+{hours} H</b>{value ? <><p>CORE {Math.round(value.core_probability * 100)}% · PERSONALIZED {row?.personalized ? `${Math.round(value.personalized_probability * 100)}%` : "UNAVAILABLE"} · CONFIDENCE {Math.round(value.confidence * 100)}%</p><p>FACTORS {modelWords(value.top_factors)} · OOD {modelWords(value.ood_flags)} · INPUT AGE {Object.entries(value.data_freshness).map(([name, age]) => `${name.replace(/_/g, " ")} ${Math.round(age)} s`).join(" · ") || "NOT SUPPLIED"}</p></> : <p>MODEL OFF · {reason}</p>}</section>;
      })}</div></> },
    ]} />
  </WallReport>;
}
