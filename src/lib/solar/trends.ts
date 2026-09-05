import type { BriefingInputs } from "./briefing";
import { usableEvidence } from "./briefing";
import type { SolarSourceId } from "./contracts";
import { parseUtcInstant } from "./normalization";

export interface SolarTrend {
  label: string;
  sourceId: SolarSourceId;
  summary: string;
  from?: string;
  to?: string;
  delayed: boolean;
}
type Sample = { timestamp: string; value: number };

function compare(label: string, sourceId: SolarSourceId, samples: Sample[], gapMs: number, delayed: boolean, unit: string, digits = 1): SolarTrend {
  const sorted = samples.filter((p) => parseUtcInstant(p.timestamp) !== null && Number.isFinite(p.value))
    .map((p) => ({ ...p, timestamp: new Date(parseUtcInstant(p.timestamp)!).toISOString() }))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const unique = sorted.filter((p, i) => !i || p.timestamp !== sorted[i - 1].timestamp);
  const latest = unique.at(-1);
  const previous = unique.at(-2);
  if (!latest || !previous || Date.parse(latest.timestamp) - Date.parse(previous.timestamp) > gapMs) {
    return { label, sourceId, summary: "Not enough comparable history", delayed };
  }
  const delta = latest.value - previous.value;
  const value = unit === "W/m²" ? Math.abs(delta).toExponential(1) : Math.abs(delta).toFixed(digits);
  return { label, sourceId, summary: delta === 0 ? "Unchanged between samples" : `${delta > 0 ? "Up" : "Down"} ${value} ${unit}`, from: previous.timestamp, to: latest.timestamp, delayed };
}

/** Compare adjacent comparable samples, never predicted values or gaps. */
export function buildSolarTrends(raw: BriefingInputs, now: number): SolarTrend[] {
  const kp = usableEvidence(raw.kp, now);
  const flux = usableEvidence(raw.flux, now);
  const mag = usableEvidence(raw.magnetometer, now);
  const xray = usableEvidence(raw.xray, now);
  const kpPoints = (kp.data ?? []).filter((p) => p.kind !== "predicted").sort((a, b) => (parseUtcInstant(a.time_tag) ?? 0) - (parseUtcInstant(b.time_tag) ?? 0));
  const fluxPoints = [...(flux.data ?? [])].sort((a, b) => (parseUtcInstant(a.time_tag) ?? 0) - (parseUtcInstant(b.time_tag) ?? 0));
  const schedule = fluxPoints.at(-1)?.schedule;
  const kpTrend = compare("Kp", kp.sourceId, kpPoints.map((p) => ({ timestamp: p.time_tag, value: p.kp })), 3 * 3_600_000, kp.state === "stale", "Kp");
  if (kpTrend.from) kpTrend.summary += ` (${kpPoints.at(-2)!.kind} → ${kpPoints.at(-1)!.kind})`;
  return [
    kpTrend,
    compare("Solar flux", flux.sourceId, fluxPoints.filter((p) => p.schedule === schedule).map((p) => ({ timestamp: p.time_tag, value: p.flux })), 30 * 3_600_000, flux.state === "stale", "sfu", 0),
    compare("Bz", mag.sourceId, (mag.data ?? []).filter((p) => p.bz_gsm != null).map((p) => ({ timestamp: p.time_tag, value: p.bz_gsm! })), 5 * 60_000, mag.state === "stale", "nT"),
    compare("X-ray", xray.sourceId, (xray.data ?? []).map((p) => ({ timestamp: p.time_tag, value: p.flux })), 5 * 60_000, xray.state === "stale", "W/m²"),
  ];
}
