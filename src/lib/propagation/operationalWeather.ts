import type { OperationalSpaceWeather } from "./coreFeatureBuilder";

export interface OperationalSolarSnapshot {
  captured_at: string;
  kp_index?: number | null;
  sfi?: number | null;
  bx_gsm?: number | null;
  by_gsm?: number | null;
  bz_gsm?: number | null;
  bt?: number | null;
  solar_wind_speed?: number | null;
  solar_wind_temperature?: number | null;
  solar_wind_density?: number | null;
  sunspot_number?: number | null;
  proton_flux_10mev?: number | null;
  dst_index?: number | null;
  source_observed_at?: Record<string, string | null> | null;
}

export interface OperationalWeatherResult {
  values: OperationalSpaceWeather;
  sourceObservedAgesSeconds: Record<string, number>;
  sourceReceiptAgesSeconds: Record<string, number>;
  sourceAvailableAt: Record<string, number>;
  watermarkAt?: number;
}

const SOURCE_MAX_AGE_SECONDS: Record<string, number> = {
  kp: 15 * 60,
  magnetic_field: 15 * 60,
  solar_wind: 15 * 60,
  proton_flux_10mev: 15 * 60,
  dst: 2 * 60 * 60,
  f107: 2 * 24 * 60 * 60,
  sunspot_number: 45 * 24 * 60 * 60,
};

const FAST_SOURCES = new Set([
  "kp",
  "magnetic_field",
  "solar_wind",
  "proton_flux_10mev",
  "dst",
]);

type SnapshotField = keyof OperationalSolarSnapshot;

interface FieldDefinition {
  output: keyof OperationalSpaceWeather;
  input: SnapshotField;
  source: string;
}

const FIELDS: FieldDefinition[] = [
  { output: "kp", input: "kp_index", source: "kp" },
  { output: "f107", input: "sfi", source: "f107" },
  { output: "bx_gsm", input: "bx_gsm", source: "magnetic_field" },
  { output: "by_gsm", input: "by_gsm", source: "magnetic_field" },
  { output: "bz_gsm", input: "bz_gsm", source: "magnetic_field" },
  { output: "bt", input: "bt", source: "magnetic_field" },
  { output: "wind_speed", input: "solar_wind_speed", source: "solar_wind" },
  {
    output: "temperature_k",
    input: "solar_wind_temperature",
    source: "solar_wind",
  },
  { output: "density_cm3", input: "solar_wind_density", source: "solar_wind" },
  {
    output: "sunspot_number",
    input: "sunspot_number",
    source: "sunspot_number",
  },
  {
    output: "proton_flux_10mev",
    input: "proton_flux_10mev",
    source: "proton_flux_10mev",
  },
  { output: "dst", input: "dst_index", source: "dst" },
];

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function observedAt(snapshot: OperationalSolarSnapshot, source: string): number | null {
  const value = snapshot.source_observed_at?.[source];
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function receivedAt(snapshot: OperationalSolarSnapshot): number | null {
  const timestamp = Date.parse(snapshot.captured_at);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function latestField(
  snapshots: OperationalSolarSnapshot[],
  field: SnapshotField,
  source: string,
  issueAt: number,
): { value: number; observedAt: number; receivedAt: number } | null {
  const maximumAge = SOURCE_MAX_AGE_SECONDS[source] * 1000;
  let selected: {
    value: number;
    observedAt: number;
    receivedAt: number;
  } | null = null;
  for (const snapshot of snapshots) {
    const observed = observedAt(snapshot, source);
    const received = receivedAt(snapshot);
    const value = snapshot[field];
    if (
      observed == null ||
      received == null ||
      observed > issueAt ||
      received > issueAt ||
      issueAt - observed > maximumAge ||
      !finite(value)
    ) {
      continue;
    }
    if (
      selected == null ||
      observed > selected.observedAt ||
      (observed === selected.observedAt && received > selected.receivedAt)
    ) {
      selected = { value, observedAt: observed, receivedAt: received };
    }
  }
  return selected;
}

function series(
  snapshots: OperationalSolarSnapshot[],
  field: SnapshotField,
  source: string,
  issueAt: number,
  horizonMs: number,
): Array<{ time: number; value: number }> {
  const byTime = new Map<number, number>();
  for (const snapshot of snapshots) {
    const time = observedAt(snapshot, source);
    const received = receivedAt(snapshot);
    const value = snapshot[field];
    if (
      time != null &&
      received != null &&
      time <= issueAt &&
      received <= issueAt &&
      time >= issueAt - horizonMs &&
      finite(value)
    ) {
      byTime.set(time, value);
    }
  }
  return [...byTime].map(([time, value]) => ({ time, value })).sort(
    (left, right) => left.time - right.time,
  );
}

export function buildOperationalWeather(
  snapshots: OperationalSolarSnapshot[],
  issueTime: Date,
): OperationalWeatherResult {
  const issueAt = issueTime.getTime();
  if (!Number.isFinite(issueAt)) throw new Error("Issue time must be valid");
  const values: OperationalSpaceWeather = {};
  const sourceObservedTimes = new Map<string, number>();
  const sourceReceiptTimes = new Map<string, number>();
  for (const definition of FIELDS) {
    const selected = latestField(
      snapshots,
      definition.input,
      definition.source,
      issueAt,
    );
    if (!selected) continue;
    values[definition.output] = selected.value;
    sourceObservedTimes.set(
      definition.source,
      Math.min(
        sourceObservedTimes.get(definition.source) ?? selected.observedAt,
        selected.observedAt,
      ),
    );
    sourceReceiptTimes.set(
      definition.source,
      Math.min(
        sourceReceiptTimes.get(definition.source) ?? selected.receivedAt,
        selected.receivedAt,
      ),
    );
  }

  const kp = series(snapshots, "kp_index", "kp", issueAt, 24 * 60 * 60 * 1000);
  if (values.kp != null && kp.length > 0) {
    values.kp_max_24h = Math.max(...kp.map((item) => item.value));
    const current = kp[kp.length - 1];
    const cutoff = issueAt - 3 * 60 * 60 * 1000;
    const prior = [...kp].reverse().find((item) => item.time <= cutoff);
    if (prior && cutoff - prior.time <= 60 * 60 * 1000) {
      values.kp_delta_3h = current.value - prior.value;
    }
  }
  const bz = series(
    snapshots,
    "bz_gsm",
    "magnetic_field",
    issueAt,
    3 * 60 * 60 * 1000,
  );
  if (values.bz_gsm != null && bz.length > 0) {
    values.bz_min_3h = Math.min(...bz.map((item) => item.value));
  }
  const dst = series(
    snapshots,
    "dst_index",
    "dst",
    issueAt,
    6 * 60 * 60 * 1000,
  );
  if (values.dst != null && dst.length > 0) {
    values.dst_min_6h = Math.min(...dst.map((item) => item.value));
  }

  const sourceObservedAgesSeconds = Object.fromEntries(
    [...sourceObservedTimes].map(([source, time]) => [
      source,
      Math.max(0, Math.floor((issueAt - time) / 1000)),
    ]),
  );
  const sourceReceiptAgesSeconds = Object.fromEntries(
    [...sourceReceiptTimes].map(([source, time]) => [
      source,
      Math.max(0, Math.floor((issueAt - time) / 1000)),
    ]),
  );
  const sourceAvailableAt = Object.fromEntries(
    [...sourceReceiptTimes].map(([source, time]) => [source, time]),
  );
  const fastTimes = [...sourceObservedTimes]
    .filter(([source]) => FAST_SOURCES.has(source))
    .map(([, time]) => time);
  return {
    values,
    sourceObservedAgesSeconds,
    sourceReceiptAgesSeconds,
    sourceAvailableAt,
    ...(fastTimes.length > 0 ? { watermarkAt: Math.min(...fastTimes) } : {}),
  };
}
