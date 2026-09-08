import type { BriefingInputs } from "./briefing";
import { usableEvidence } from "./briefing";
import type { SolarSourceId } from "./contracts";
import { parseUtcInstant } from "./normalization";

/** Meaning-derived, not sign-derived: e.g. a Kp rise is "danger" while a flux rise is "success". */
export type SolarTrendTone = "success" | "warning" | "danger" | "info" | "muted";

export interface SolarTrend {
  label: string;
  sourceId: SolarSourceId;
  summary: string;
  from?: string;
  to?: string;
  delayed: boolean;
  /** Trailing slice (≈ last 24h, capped ~48 points) of the same de-duplicated series used for the comparison, oldest first. */
  series: { timestamp: string; value: number }[];
  tone: SolarTrendTone;
}
type Sample = { timestamp: string; value: number };

const SERIES_WINDOW_MS = 24 * 3_600_000;
const SERIES_MAX_POINTS = 48;

function recentSeries(unique: Sample[]): Sample[] {
  if (unique.length === 0) return [];
  const latestMs = Date.parse(unique[unique.length - 1].timestamp);
  return unique.filter((p) => latestMs - Date.parse(p.timestamp) <= SERIES_WINDOW_MS).slice(-SERIES_MAX_POINTS);
}

function compare(label: string, sourceId: SolarSourceId, samples: Sample[], gapMs: number, delayed: boolean, unit: string, digits: number, risingTone: SolarTrendTone, fallingTone: SolarTrendTone): SolarTrend {
  const sorted = samples.filter((p) => parseUtcInstant(p.timestamp) !== null && Number.isFinite(p.value))
    .map((p) => ({ ...p, timestamp: new Date(parseUtcInstant(p.timestamp)!).toISOString() }))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const unique = sorted.filter((p, i) => !i || p.timestamp !== sorted[i - 1].timestamp);
  const series = recentSeries(unique);
  const latest = unique.at(-1);
  const previous = unique.at(-2);
  if (!latest || !previous || Date.parse(latest.timestamp) - Date.parse(previous.timestamp) > gapMs) {
    return { label, sourceId, summary: "Not enough comparable history", delayed, series, tone: "muted" };
  }
  const delta = latest.value - previous.value;
  const value = unit === "W/m²" ? Math.abs(delta).toExponential(1) : Math.abs(delta).toFixed(digits);
  const tone: SolarTrendTone = delta === 0 ? "muted" : delta > 0 ? risingTone : fallingTone;
  return { label, sourceId, summary: delta === 0 ? "Unchanged between samples" : `${delta > 0 ? "Up" : "Down"} ${value} ${unit}`, from: previous.timestamp, to: latest.timestamp, delayed, series, tone };
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
  // Tone is by meaning, not by the sign of the delta: a Kp or X-ray rise trends toward
  // disruption (danger/warning) while a flux rise trends toward more usable ionization
  // (success); Bz follows its own sign (southward/negative = danger).
  const kpTrend = compare("Kp", kp.sourceId, kpPoints.map((p) => ({ timestamp: p.time_tag, value: p.kp })), 3 * 3_600_000, kp.state === "stale", "Kp", 1, "danger", "success");
  if (kpTrend.from) kpTrend.summary += ` (${kpPoints.at(-2)!.kind} → ${kpPoints.at(-1)!.kind})`;
  return [
    kpTrend,
    compare("Solar flux", flux.sourceId, fluxPoints.filter((p) => p.schedule === schedule).map((p) => ({ timestamp: p.time_tag, value: p.flux })), 30 * 3_600_000, flux.state === "stale", "sfu", 0, "success", "warning"),
    compare("Bz", mag.sourceId, (mag.data ?? []).filter((p) => p.bz_gsm != null).map((p) => ({ timestamp: p.time_tag, value: p.bz_gsm! })), 5 * 60_000, mag.state === "stale", "nT", 1, "success", "danger"),
    compare("X-ray", xray.sourceId, (xray.data ?? []).map((p) => ({ timestamp: p.time_tag, value: p.flux })), 5 * 60_000, xray.state === "stale", "W/m²", 1, "warning", "info"),
  ];
}
