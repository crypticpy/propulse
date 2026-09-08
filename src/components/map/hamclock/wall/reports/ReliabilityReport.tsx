import { useState } from "react";
import type { EngineReading } from "@/lib/hamclock/engineComparison";
import { probabilityStepClassifier } from "@/lib/hamclock/engineComparison";
import { HamClockSegmented, HamClockTabs } from "../controls";
import { WALL_FORECAST_BANDS } from "../tiles/useWallReliability";
import { reportFooter } from "../tokens";
import { EngineComparisonStrip } from "./EngineComparisonStrip";
import { WallReport } from "./WallReport";
import { ForecastComparisonChart } from "./ForecastComparisonChart";
import { ReliabilityGrid } from "./ReliabilityGrid";
import { FORECAST_HOUR_MS, modelWords } from "./forecastEvidence";
import { useReliabilityReportData } from "./useReliabilityReportData";

const signed = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)} dB`;

interface ReliabilityReportProps {
  open: boolean;
  onClose: () => void;
  initialBand?: string;
  initialHour?: number;
  initialTab?: string;
}

export function ReliabilityReport({ open, onClose, initialBand = "20m", initialHour, initialTab = "now" }: ReliabilityReportProps) {
  const [band, setBand] = useState(initialBand);
  const [selectedHour, setSelectedHour] = useState<number | undefined>(initialHour);
  const [tab, setTab] = useState(initialTab);
  const data = useReliabilityReportData(band, selectedHour);
  const { wall, cell, model, physics } = data;
  const score = physics.find(point => point.hourIndex === data.hourIndex)?.score ?? null;
  const prediction = model.prediction;
  const physicsReading: EngineReading = {
    value: score === null ? "—" : `${score.toFixed(0)} / 100`,
    state: score === null ? "unavailable" : "ok",
    comparable: score === null ? { kind: "none" } : { kind: "verdict", verdict: score >= 75 ? "open" : score >= 25 ? "marginal" : "closed" },
    detail: "RELATIVE PHYSICS SCORE",
    ...(wall.updatedAt === null ? {} : { updatedAt: new Date(wall.updatedAt) }),
  };
  const nowcastReading: EngineReading = prediction ? {
    value: `${Math.round((data.nowcast.personalized ? prediction.personalized_probability : prediction.core_probability) * 100)}%`,
    comparable: { kind: "number", value: (data.nowcast.personalized ? prediction.personalized_probability : prediction.core_probability) * 100, unit: "pct" },
    confidence: prediction.confidence * 100, updatedAt: new Date(prediction.issue_time), state: "ok",
    detail: data.nowcast.personalized ? "PERSONALIZED" : "CORE DECODE PROBABILITY",
  } : { value: "—", comparable: { kind: "none" }, state: "unavailable", unavailableReason: model.reason === "MODEL OFF" ? "MODEL OFF" : `MODEL OFF · ${model.reason ?? "UNAVAILABLE"}` };
  const observedReading: EngineReading = data.observed ? {
    value: `${data.observed.count60m} spots`, comparable: { kind: "number", value: data.observed.count60m, unit: "spots" },
    state: data.activityError ? "stale" : "ok", updatedAt: new Date(data.activityAt!), detail: "SCOPED 60 MIN SAMPLE — NOT PATH CONFIRMATION",
  } : { value: "—", comparable: { kind: "none" }, state: "unavailable", unavailableReason: "NO CURRENT SCOPED SAMPLE" };
  const footer = reportFooter("PHYSICS · Kp/SFI OBSERVATIONS; MODEL/OBSERVED TIMES SHOWN SEPARATELY", wall.updatedAt);
  const facts = [
    { label: "PATH", value: data.sourceLabel },
    { label: "SNR ESTIMATE", value: signed(cell?.snrEstimate) },
    { label: "MODE THRESHOLD", value: `${wall.mode} ${signed(wall.inputs.modeThresholdDb)}` },
    { label: "CONFIDENCE", value: cell ? `${Math.round(cell.confidence)}%` : "NO PATH ESTIMATE" },
    { label: "POWER", value: `${wall.inputs.powerWatts} W` },
    { label: "ANTENNA", value: `${wall.inputs.antennaType} · ${wall.inputs.antennaGainDbi?.toFixed(1) ?? "—"} dBi` },
    { label: "NOISE", value: wall.inputs.noiseEnvironment?.replace(/_/g, " ") ?? "ENGINE DEFAULT" },
    { label: "DISTANCE / HOPS", value: !data.location ? "NO STATION" : wall.inputs.distanceKm === null ? "NO TARGET" : `${Math.round(wall.inputs.distanceKm)} km / NOT SUPPLIED` },
  ];
  const chartModel = data.liveModel?.prediction;
  const chartPoints = physics.slice(0, 24).map(point => ({
    hourIndex: point.hourIndex, physics: point.score,
    ...(chartModel && Math.floor(Date.parse(chartModel.valid_time) / FORECAST_HOUR_MS) === point.hourIndex ? { model: (data.nowcast.personalized ? chartModel.personalized_probability : chartModel.core_probability) * 100 } : {}),
    ...(data.liveObserved && Math.floor((data.activityAt ?? 0) / FORECAST_HOUR_MS) === point.hourIndex ? { observed: data.liveObserved.count60m } : {}),
  }));
  return <WallReport open={open} onClose={onClose} title="Reliability report" hero={band.toUpperCase()}
    verdict={score === null ? "NO DATA" : `${cell?.status?.toUpperCase() ?? "QTH"} · ${score.toFixed(0)} / 100`} facts={facts} {...footer}
    pinId="reliability" pinElement={<ReliabilityReport open onClose={onClose} initialBand={band} initialHour={selectedHour} initialTab={tab} />}>
    <EngineComparisonStrip subject={`${band.toUpperCase()} · ${data.sourceLabel}`} physics={physicsReading} nowcast={nowcastReading} observed={observedReading}
      classify={(value, unit) => unit === "spots" ? null : probabilityStepClassifier()(value, unit)} />
    <HamClockTabs label="Reliability views" active={tab} onChange={setTab} tabs={[
      { id: "now", label: "NOW", content: <><div className="hcr-reliability-toolbar"><HamClockSegmented hideLabel label="Band" value={band} options={WALL_FORECAST_BANDS.map(value => ({ value, label: value.toUpperCase() }))} onChange={setBand} /><button type="button" className="hcc-btn" onClick={() => setSelectedHour(undefined)}>LIVE HOUR</button><p className="hcr-note">{prediction ? `MODEL ${prediction.model_version} · ${modelWords(prediction.ood_flags)}` : model.reason}</p></div><div className="hcr-chart"><p className="hcr-chart-title">24 H · PHYSICS SCORE / MODEL PROBABILITY · SPOTS ON RIGHT AXIS</p><ForecastComparisonChart points={chartPoints} selectedHour={data.hourIndex} nowHour={Math.floor(Date.now() / FORECAST_HOUR_MS)} onSelect={setSelectedHour} /></div><p className="hcr-note">Model and observed values are current samples. Historical model/observation series are not supplied by these feeds.</p></> },
      { id: "hours", label: "BY HOUR", content: <ReliabilityGrid matrix={data.matrix} start={data.dayStart} selectedBand={band} selectedHour={data.hourIndex} onSelect={(nextBand, hour) => { setBand(nextBand); setSelectedHour(hour); }} /> },
    ]} />
  </WallReport>;
}
