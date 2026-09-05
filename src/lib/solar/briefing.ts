import type { SolarResource, SolarSourceId, SolarWidgetState } from "./contracts";
import type { KpPoint, SolarFluxPoint, MagnetometerPoint, XrayPoint, NoaaScalesProduct, OfficialSolarAlert } from "./dataTypes";
import { currentKp, latestByTime, xrayClass } from "./selectors";
import { getSolarSourcePolicy } from "./sourcePolicies";

export interface SolarEvidence<T> {
  sourceId: SolarSourceId;
  data?: T;
  state: SolarWidgetState;
  resource?: SolarResource<T>;
}

/** Re-check retained query data against the same policy as the bounded cache. */
export function usableEvidence<T>(input: SolarEvidence<T>, now: number): SolarEvidence<T> {
  const policy = getSolarSourcePolicy(input.sourceId);
  const envelope = input.resource?.envelope;
  const basis = envelope?.[policy.freshnessBasis ?? "observedAt"];
  const age = basis ? now - Date.parse(basis) : Infinity;
  if (["unavailable", "error", "loading"].includes(input.state) || !Number.isFinite(age) || age >= policy.hardTtlMs) {
    return { ...input, data: undefined, state: input.state === "loading" ? "loading" : "unavailable" };
  }
  return { ...input, state: age >= policy.softTtlMs ? "stale" : input.state };
}

export interface BriefingInputs {
  kp: SolarEvidence<KpPoint[]>;
  flux: SolarEvidence<SolarFluxPoint[]>;
  magnetometer: SolarEvidence<MagnetometerPoint[]>;
  xray: SolarEvidence<XrayPoint[]>;
  scales: SolarEvidence<NoaaScalesProduct>;
  alerts: SolarEvidence<OfficialSolarAlert[]>;
}

export interface BriefingStatement {
  id: string;
  text: string;
  kind: "impact" | "background" | "upstream" | "notice";
  sources: SolarSourceId[];
}

export interface SolarBriefing {
  title: string;
  tone: "impact" | "watch" | "supportive" | "unknown";
  statements: BriefingStatement[];
  state: SolarWidgetState;
  missing: string[];
  delayed: string[];
  evidence: Array<{ sourceId: SolarSourceId; label: string; observedAt?: string; state: SolarWidgetState; sourceUrl: string }>;
}

/** Product interpretation, not a path forecast or a probability of a contact. */
export function buildSolarBriefing(raw: BriefingInputs, now: number): SolarBriefing {
  const inputs = {
    kp: usableEvidence(raw.kp, now),
    flux: usableEvidence(raw.flux, now),
    magnetometer: usableEvidence(raw.magnetometer, now),
    xray: usableEvidence(raw.xray, now),
    scales: usableEvidence(raw.scales, now),
    alerts: usableEvidence(raw.alerts, now),
  };
  const values = Object.values(inputs);
  const evidence = values.map((input) => ({
    sourceId: input.sourceId,
    label: getSolarSourcePolicy(input.sourceId).label,
    observedAt: input.resource?.envelope.observedAt,
    state: input.state,
    sourceUrl: getSolarSourcePolicy(input.sourceId).sourceUrl,
  }));
  const missing = values.filter((input) => input.data == null || (Array.isArray(input.data) && input.data.length === 0 && input.sourceId !== "swpc-alerts"))
    .map((input) => getSolarSourcePolicy(input.sourceId).label);
  const scales = inputs.scales.data;
  for (const [label, value] of [
    ["Radio-blackout scale", scales?.radio_blackout?.scale],
    ["Radiation-storm scale", scales?.solar_radiation?.scale],
    ["Geomagnetic scale", scales?.geomagnetic_storm?.scale],
  ] as const) {
    if (scales && value == null) missing.push(label);
  }
  const delayed = values.filter((input) => ["stale", "partial"].includes(input.state)).map((input) => getSolarSourcePolicy(input.sourceId).label);
  const kp = currentKp(inputs.kp.data);
  const flux = latestByTime(inputs.flux.data, (point) => point.time_tag);
  const bz = latestByTime(inputs.magnetometer.data, (point) => point.time_tag, (point) => point.bz_gsm !== null);
  const xray = latestByTime(inputs.xray.data, (point) => point.time_tag);
  for (const [input, value] of [[inputs.kp, kp], [inputs.flux, flux], [inputs.magnetometer, bz], [inputs.xray, xray]] as const) {
    const label = getSolarSourcePolicy(input.sourceId).label;
    if (!value && !missing.includes(label)) missing.push(label);
  }
  const r = scales?.radio_blackout?.scale;
  const s = scales?.solar_radiation?.scale;
  const g = scales?.geomagnetic_storm?.scale;
  const statements: BriefingStatement[] = [];
  const add = (id: string, kind: BriefingStatement["kind"], text: string, sources: SolarSourceId[]) => statements.push({ id, kind, text, sources });
  const rEvent = r != null && r > 0;
  const xrayEvent = xray != null && xray.flux >= 1e-5;
  if (rEvent) add("radio", "impact", `NOAA reports R${r} radio-blackout conditions. Sunlit HF paths may be affected.`, ["swpc-scales"]);
  if (xrayEvent && !rEvent) add("xray", "impact", `X-ray flux is at ${xrayClass(xray.flux)}. Sunlit HF absorption may be elevated.`, ["noaa-xray"]);
  // Keep differing snapshots visible, including the reverse case after a flare.
  if (xray && r != null && rEvent !== xrayEvent) add("different-times", "notice",
    `X-ray flux (${xrayClass(xray.flux)}) and the official R${r} snapshot differ. Compare their observation times in the evidence; they can update at different times.`,
    ["noaa-xray", "swpc-scales"]);
  if (s != null && s > 0) add("radiation", "impact", `NOAA reports S${s} radiation-storm conditions. HF paths through polar regions may be affected.`, ["swpc-scales"]);
  if (g != null && g > 0) add("geomagnetic", "impact", `NOAA reports G${g} geomagnetic-storm conditions. HF propagation may be disrupted, with effects depending on latitude and path.`, ["swpc-scales"]);
  else if (kp && kp.kp >= 5) add("kp-storm", "impact", `${kp.kind === "estimated" ? "Estimated" : "Observed"} Kp ${kp.kp.toFixed(1)} is in the storm range. High-latitude HF paths may be degraded.`, ["noaa-k-index"]);
  else if (kp) add("kp-background", "background", `${kp.kind === "estimated" ? "Estimated" : "Observed"} Kp ${kp.kp.toFixed(1)} indicates ${kp.kp < 4 ? "relatively quiet" : "unsettled"} geomagnetic conditions.`, ["noaa-k-index"]);
  if (flux) add("ionization", "background", `SFI ${flux.flux.toFixed(0)} ${flux.flux >= 100 ? "supports background ionization" : "suggests limited higher-band support"}. Band choice still depends on the path and time.`, ["noaa-solar-flux"]);
  if (bz?.bz_gsm != null && bz.bz_gsm < 0) add("bz", "upstream", `Bz is southward (${bz.bz_gsm.toFixed(1)} nT) at L1. Watch its evolution; this sample alone does not establish a storm at Earth.`, ["noaa-magnetometer"]);
  const watch = inputs.alerts.data?.find((alert) => alert.severity === "watch" || alert.severity === "warning");
  if (watch) add("bulletin", "notice", `A recent NOAA ${watch.severity} is available below. Its issue time alone does not establish whether it is still in effect.`, ["swpc-alerts"]);
  const impact = statements.some((statement) => statement.kind === "impact");
  const incomplete = missing.length > 0 || delayed.length > 0;
  const supportive = kp != null && kp.kp < 3 && flux != null && flux.flux >= 100;
  const title = impact
    ? rEvent || xrayEvent ? "Radio-blackout conditions need attention" : s != null && s > 0 ? "Polar HF paths need attention" : "Geomagnetic disturbance needs attention"
    : incomplete ? "The HF picture is incomplete"
    : watch ? "Check the latest NOAA outlook"
    : supportive ? "Supportive HF background conditions" : "Mixed HF background conditions";
  return {
    title,
    tone: impact ? "impact" : incomplete ? "unknown" : watch || !supportive ? "watch" : "supportive",
    statements: statements.sort((a, b) => ({ impact: 0, background: 1, upstream: 2, notice: 3 }[a.kind] - { impact: 0, background: 1, upstream: 2, notice: 3 }[b.kind])),
    state: values.every((input) => input.data == null) ? values.some((input) => input.state === "loading") ? "loading" : "unavailable" : incomplete ? "partial" : values.some((input) => input.state === "refreshing") ? "refreshing" : "fresh",
    missing, delayed, evidence,
  };
}
