import type {
  CmeAnalysisPoint,
  DrapGrid,
  DstPoint,
  FlareProbabilityForecast,
  KpPoint,
  LatestXrayFlare,
  MagnetometerPoint,
  NoaaScalesProduct,
  OfficialSolarAlert,
  ProtonPoint,
  SolarFluxForecastProduct,
  SolarFluxOutlookPoint,
  SolarFluxOutlookProduct,
  SolarFluxPoint,
  SolarWindMagPoint,
  SolarWindPlasmaPoint,
  SunspotPoint,
  XrayPoint,
} from "./dataTypes";
import {
  SolarValidationError,
  boundedPercentage,
  latestTimestamp,
  normalizeTimeSeries,
  parseUtcInstant,
  requireExactChannel,
  toFiniteNumber,
} from "./normalization";

export interface AdaptedProduct<T> {
  data: T;
  observedAt: string;
  sourceUrl?: string;
  warnings?: string[];
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new SolarValidationError(`${label} response must be an array`);
  }
  return value;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function iso(value: unknown, field: string): string {
  const parsed = parseUtcInstant(value);
  if (parsed === null) {
    throw new SolarValidationError(`${field} is not a valid UTC timestamp`, "timestamp");
  }
  return new Date(parsed).toISOString();
}

export function adaptKp(value: unknown, maxRows = 72): AdaptedProduct<KpPoint[]> {
  const rawRows = requireArray(value, "Kp");
  const points = rawRows.flatMap((value): KpPoint[] => {
    const row = record(value);
    if (!row) return [];
    const kp = toFiniteNumber(row.kp ?? row.Kp ?? row.kp_index);
    const timestamp = parseUtcInstant(row.time_tag);
    const interval = timestamp === null ? null : new Date(timestamp);
    const rawKind = typeof row.observed === "string"
      ? row.observed.toLowerCase()
      : "";
    if (
      kp === null ||
      kp < 0 ||
      kp > 9 ||
      interval === null ||
      interval.getUTCMinutes() !== 0 ||
      interval.getUTCSeconds() !== 0 ||
      interval.getUTCHours() % 3 !== 0 ||
      !["observed", "estimated", "predicted"].includes(rawKind)
    ) {
      return [];
    }
    return [
      {
        time_tag: String(row.time_tag ?? ""),
        kp,
        kind: rawKind as KpPoint["kind"],
        noaa_scale:
          typeof row.noaa_scale === "string" ? row.noaa_scale : null,
        a_running: toFiniteNumber(row.a_running),
      },
    ];
  });

  const data = normalizeTimeSeries(points, {
    timestamp: (point) => point.time_tag,
    maxRows,
    maxFutureMs: 4 * 24 * 60 * 60_000,
  });
  const currentRows = data.filter((point) => point.kind !== "predicted");
  if (currentRows.length === 0) {
    throw new SolarValidationError("Kp response contains forecasts but no current observation", "empty");
  }
  // NOAA's forecast feed marks the current UTC day's not-yet-final 3-hour bins as "estimated",
  // so the latest non-predicted bin sits hours ahead of now. observedAt reports data validity
  // and must never be in the future; clamp it to now (a real upstream stall still surfaces as
  // staleness once wall-clock passes the last issued bin).
  const latestNonPredicted = Date.parse(
    latestTimestamp(currentRows, (point) => point.time_tag),
  );
  return {
    data,
    observedAt: new Date(Math.min(latestNonPredicted, Date.now())).toISOString(),
  };
}

export function adaptSolarFlux(
  value: unknown,
  maxRows = 45,
): AdaptedProduct<SolarFluxPoint[]> {
  const points = requireArray(value, "Solar flux").flatMap(
    (value): SolarFluxPoint[] => {
      const row = record(value);
      if (!row) return [];
      const flux = toFiniteNumber(row.flux);
      const frequency = toFiniteNumber(row.frequency);
      if (flux === null || flux < 40 || flux > 600 || frequency !== 2800) {
        return [];
      }
      return [
        {
          time_tag: String(row.time_tag ?? ""),
          flux,
          frequency: 2800,
          schedule:
            typeof row.reporting_schedule === "string"
              ? row.reporting_schedule
              : null,
        },
      ];
    },
  );
  const data = normalizeTimeSeries(points, {
    timestamp: (point) => point.time_tag,
    maxRows,
  });
  return { data, observedAt: latestTimestamp(data, (point) => point.time_tag) };
}

export function adaptProbabilities(
  value: unknown,
): AdaptedProduct<FlareProbabilityForecast> {
  const candidates = requireArray(value, "Solar probabilities")
    .map(record)
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row) => ({ row, timestamp: parseUtcInstant(row.date) }))
    .filter(
      (item): item is { row: Record<string, unknown>; timestamp: number } =>
        item.timestamp !== null && item.timestamp <= Date.now() + 60 * 60_000,
    )
    .sort((left, right) => left.timestamp - right.timestamp);
  const latest = candidates[candidates.length - 1];
  if (!latest) {
    throw new SolarValidationError("No current solar-probability forecast", "empty");
  }
  const data: FlareProbabilityForecast = {
    issue_time: new Date(latest.timestamp).toISOString(),
    horizon: "1 day",
    c_class: boundedPercentage(latest.row.c_class_1_day, "C-class probability"),
    m_class: boundedPercentage(latest.row.m_class_1_day, "M-class probability"),
    x_class: boundedPercentage(latest.row.x_class_1_day, "X-class probability"),
    proton_10mev: boundedPercentage(
      latest.row["10mev_protons_1_day"],
      ">=10 MeV proton probability",
    ),
  };
  return { data, observedAt: data.issue_time };
}

function matrixToRecords(value: unknown): Record<string, unknown>[] {
  const matrix = requireArray(value, "Matrix product");
  if (matrix.length < 2 || !Array.isArray(matrix[0])) return [];
  const headers = (matrix[0] as unknown[]).map(String);
  return matrix.slice(1).flatMap((rowValue): Record<string, unknown>[] => {
    if (!Array.isArray(rowValue)) return [];
    return [Object.fromEntries(headers.map((header, index) => [header, rowValue[index]]))];
  });
}

export function adaptMagnetometer(
  value: unknown,
  maxRows = 90,
  windowMs = 65 * 60_000,
): AdaptedProduct<MagnetometerPoint[]> {
  const values = requireArray(value, "Magnetometer");
  const records = values.length > 0 && Array.isArray(values[0])
    ? matrixToRecords(values)
    : values.map(record).filter((row): row is Record<string, unknown> => row !== null);
  const points = records.map((row): MagnetometerPoint => ({
    time_tag: String(row.time_tag ?? ""),
    bz_gsm: toFiniteNumber(row.bz_gsm),
    by_gsm: toFiniteNumber(row.by_gsm),
    bt: toFiniteNumber(row.bt),
  }));
  const data = normalizeTimeSeries(points, {
    timestamp: (point) => point.time_tag,
    isValid: (point) => point.bz_gsm !== null,
    windowMs,
    maxRows,
  });
  return { data, observedAt: latestTimestamp(data, (point) => point.time_tag) };
}

export function adaptSunspots(
  value: unknown,
  maxRows = 36,
): AdaptedProduct<SunspotPoint[]> {
  const points = requireArray(value, "Sunspots").flatMap(
    (value): SunspotPoint[] => {
      const row = record(value);
      if (!row) return [];
      const ssn = toFiniteNumber(row.ssn);
      if (ssn === null || ssn < 0 || ssn > 1_000) return [];
      return [{ time_tag: String(row["time-tag"] ?? row.time_tag ?? ""), ssn }];
    },
  );
  const data = normalizeTimeSeries(points, {
    timestamp: (point) => point.time_tag,
    maxRows,
    maxFutureMs: 45 * 24 * 60 * 60_000,
  });
  return { data, observedAt: latestTimestamp(data, (point) => point.time_tag) };
}

export function adaptXray(
  value: unknown,
  maxRows = 120,
  windowMs = 2 * 60 * 60_000,
): AdaptedProduct<XrayPoint[]> {
  const selected = requireExactChannel(
    requireArray(value, "X-ray flux"),
    (value) => record(value)?.energy,
    ["0.1-0.8nm", "0.1 – 0.8 nm"],
  );
  const points = selected.flatMap((value): XrayPoint[] => {
    const row = record(value);
    const flux = toFiniteNumber(row?.flux);
    // GOES publishes electron-contaminated minutes as `flux: 0` with the
    // contamination flag set (NOAA currently spells it `electron_contaminaton`;
    // the correct spelling is accepted too in case the feed is fixed). A zero
    // is not a measurement, so the sample is dropped and the series keeps its
    // last valid reading.
    if (!row || flux === null || flux <= 0) return [];
    if (row.electron_contaminaton === true || row.electron_contamination === true) {
      return [];
    }
    return [{
      time_tag: String(row.time_tag ?? ""),
      flux,
      energy: "0.1-0.8nm",
      satellite: toFiniteNumber(row.satellite),
    }];
  });
  const data = normalizeTimeSeries(points, {
    timestamp: (point) => point.time_tag,
    maxRows,
    windowMs,
  });
  return { data, observedAt: latestTimestamp(data, (point) => point.time_tag) };
}

export function adaptProtons(
  value: unknown,
  maxRows = 120,
): AdaptedProduct<ProtonPoint[]> {
  const selected = requireExactChannel(
    requireArray(value, "Proton flux"),
    (value) => record(value)?.energy,
    [">=10 MeV", "≥10 MeV"],
  );
  const points = selected.flatMap((value): ProtonPoint[] => {
    const row = record(value);
    const flux = toFiniteNumber(row?.flux);
    if (!row || flux === null || flux < 0) return [];
    return [{
      time_tag: String(row.time_tag ?? ""),
      flux,
      energy: ">=10 MeV",
      satellite: toFiniteNumber(row.satellite),
    }];
  });
  const data = normalizeTimeSeries(points, {
    timestamp: (point) => point.time_tag,
    maxRows,
    windowMs: 4 * 60 * 60_000,
  });
  return { data, observedAt: latestTimestamp(data, (point) => point.time_tag) };
}

export function adaptDst(value: unknown, maxRows = 72): AdaptedProduct<DstPoint[]> {
  const values = requireArray(value, "Dst");
  const records = values.length > 0 && Array.isArray(values[0])
    ? matrixToRecords(values)
    : values.map(record).filter((row): row is Record<string, unknown> => row !== null);
  const points = records.flatMap((row): DstPoint[] => {
    const dst = toFiniteNumber(row.dst);
    if (dst === null || dst < -2_000 || dst > 500) return [];
    return [{ time_tag: String(row.time_tag ?? ""), dst }];
  });
  const data = normalizeTimeSeries(points, {
    timestamp: (point) => point.time_tag,
    maxRows,
  });
  return { data, observedAt: latestTimestamp(data, (point) => point.time_tag) };
}

export function adaptDrapText(text: string): AdaptedProduct<DrapGrid> {
  const validMatch = text.match(/Product Valid At\s*:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*UTC/i);
  if (!validMatch) {
    throw new SolarValidationError("D-RAP response is missing its product-valid timestamp");
  }
  const observationTime = iso(validMatch[1], "D-RAP product-valid time");
  const lines = text.split(/\r?\n/);
  let longitudes: number[] = [];
  const latitudes: number[] = [];
  const frequencies: number[][] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (longitudes.length === 0 && /^-?\d+(?:\s+-?\d+){20,}$/.test(trimmed)) {
      longitudes = trimmed.split(/\s+/).map(Number);
      continue;
    }
    const row = trimmed.match(/^(-?\d+)\s*\|\s*(.+)$/);
    if (!row || longitudes.length === 0) continue;
    const latitude = Number(row[1]);
    const cells = row[2].trim().split(/\s+/).map(Number);
    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      cells.some((cell) => !Number.isFinite(cell) || cell < 0 || cell > 100)
    ) continue;
    if (cells.length !== longitudes.length) {
      throw new SolarValidationError("D-RAP grid row width does not match longitude header");
    }
    latitudes.push(latitude);
    frequencies.push(cells);
  }
  if (longitudes.length === 0 || latitudes.length === 0 || frequencies.length === 0) {
    throw new SolarValidationError("D-RAP response contains no rectangular grid", "empty");
  }
  if (
    longitudes.some((longitude) => longitude < -180 || longitude > 180) ||
    new Set(longitudes).size !== longitudes.length ||
    new Set(latitudes).size !== latitudes.length
  ) {
    throw new SolarValidationError("D-RAP grid coordinates are invalid or duplicated");
  }
  return {
    data: {
      observation_time: observationTime,
      forecast_time: observationTime,
      frequencies,
      latitudes,
      longitudes,
    },
    observedAt: observationTime,
  };
}

export function adaptCme(value: unknown, maxRows = 24): AdaptedProduct<CmeAnalysisPoint[]> {
  const points = requireArray(value, "CME analysis").flatMap(
    (value): CmeAnalysisPoint[] => {
      const row = record(value);
      if (!row) return [];
      const latitude = toFiniteNumber(row.latitude);
      const longitude = toFiniteNumber(row.longitude);
      const halfAngle = toFiniteNumber(row.halfAngle);
      const speed = toFiniteNumber(row.speed);
      if (
        [latitude, longitude, halfAngle, speed].some((item) => item === null) ||
        latitude! < -90 ||
        latitude! > 90 ||
        longitude! < -180 ||
        longitude! > 180 ||
        halfAngle! < 0 ||
        halfAngle! > 180 ||
        speed! <= 0 ||
        speed! > 10_000
      ) return [];
      return [{
        time21_5: String(row.time21_5 ?? ""),
        latitude: latitude!,
        longitude: longitude!,
        halfAngle: halfAngle!,
        speed: speed!,
        type: String(row.type ?? ""),
        note: typeof row.note === "string" ? row.note.slice(0, 2_000) : "",
        catalog: String(row.catalog ?? ""),
        link: typeof row.link === "string" ? row.link : "",
      }];
    },
  );
  if (points.length === 0 && Array.isArray(value) && value.length === 0) {
    const observedAt = new Date().toISOString();
    return { data: [], observedAt };
  }
  const data = normalizeTimeSeries(points, {
    timestamp: (point) => point.time21_5,
    maxRows,
    maxFutureMs: 60 * 60_000,
  });
  return { data, observedAt: latestTimestamp(data, (point) => point.time21_5) };
}

function parseForecastNumbers(lines: string[], label: string): number[] {
  const index = lines.findIndex((line) => line.trim() === label);
  if (index < 0) return [];
  const next = lines[index + 1] ?? "";
  return next.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
}

export function adaptFluxForecastText(
  text: string,
): AdaptedProduct<SolarFluxForecastProduct> {
  const issued = text.match(/:Issued:\s*(\d{4})\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\s+UTC/i);
  if (!issued) {
    throw new SolarValidationError("Forecast response is missing an issue time");
  }
  const issuedAt = iso(
    `${issued[1]} ${issued[2]} ${issued[3]} ${issued[4].slice(0, 2)}:${issued[4].slice(2)}`,
    "forecast issue time",
  );
  const datesLine = text.match(/:Prediction_dates:\s*(.+)/i)?.[1] ?? "";
  const dates = [...datesLine.matchAll(/(\d{4})\s+([A-Za-z]{3})\s+(\d{1,2})/g)].map(
    (match) => iso(`${match[1]} ${match[2]} ${match[3]} 00:00`, "forecast date"),
  );
  const lines = text.split(/\r?\n/);
  const flux = parseForecastNumbers(lines, ":10cm_flux:");
  const planetaryAIndex = lines.findIndex((line) => line.trim() === ":Geomagnetic_A_indices:");
  const planetaryLine = planetaryAIndex < 0
    ? ""
    : lines.slice(planetaryAIndex + 1, planetaryAIndex + 5).find((line) => /A_Planetary/i.test(line)) ?? "";
  const planetaryA = planetaryLine.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (dates.length !== 3 || flux.length < 3 || planetaryA.length < 3) {
    throw new SolarValidationError("Forecast response does not contain three usable forecast days", "empty");
  }
  const forecast = dates.map((date, index) => ({
    date,
    predicted_flux: flux[index],
    predicted_planetary_a: planetaryA[index],
  }));
  if (forecast.some((day) => day.predicted_flux < 40 || day.predicted_flux > 600 || day.predicted_planetary_a < 0 || day.predicted_planetary_a > 400)) {
    throw new SolarValidationError("Forecast values fall outside plausible ranges");
  }
  return { data: { issued_at: issuedAt, forecast }, observedAt: issuedAt };
}

export function adaptFluxOutlookText(
  text: string,
  maxRows = 27,
): AdaptedProduct<SolarFluxOutlookProduct> {
  const issued = text.match(/:Issued:\s*(\d{4})\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\s+UTC/i);
  if (!issued) {
    throw new SolarValidationError("Outlook response is missing an issue time");
  }
  const issuedAt = iso(
    `${issued[1]} ${issued[2]} ${issued[3]} ${issued[4].slice(0, 2)}:${issued[4].slice(2)}`,
    "outlook issue time",
  );
  const rows = [...text.matchAll(/^(\d{4})\s+([A-Za-z]{3})\s+(\d{1,2})\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s*$/gm)];
  const points = rows.flatMap((match): SolarFluxOutlookPoint[] => {
    const [, year, mon, day, fluxText, aIndexText, kpText] = match;
    const predicted_flux = Number(fluxText);
    const predicted_planetary_a = Number(aIndexText);
    const predicted_kp = Number(kpText);
    if (
      predicted_flux < 40 || predicted_flux > 600 ||
      predicted_planetary_a < 0 || predicted_planetary_a > 400 ||
      predicted_kp < 0 || predicted_kp > 9
    ) {
      return [];
    }
    return [{ date: iso(`${year} ${mon} ${day} 00:00`, "outlook date"), predicted_flux, predicted_planetary_a, predicted_kp }];
  });
  const outlook = normalizeTimeSeries(points, {
    timestamp: (point) => point.date,
    maxRows,
    maxFutureMs: 30 * 24 * 60 * 60_000,
  });
  return { data: { issued_at: issuedAt, outlook }, observedAt: issuedAt };
}

export function adaptNoaaScales(value: unknown): AdaptedProduct<NoaaScalesProduct> {
  const root = record(value);
  const current = record(root?.["0"]);
  const radio = record(current?.R);
  const radiation = record(current?.S);
  const geomagnetic = record(current?.G);
  if (!current || !radio || !radiation || !geomagnetic) {
    throw new SolarValidationError("NOAA scales response is missing the current scale set");
  }
  const observedAt = iso(
    `${String(current.DateStamp ?? "")}T${String(current.TimeStamp ?? "")}`,
    "NOAA scales timestamp",
  );
  const scale = (part: Record<string, unknown>) => {
    const value = toFiniteNumber(part.Scale);
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > 5)) {
      throw new SolarValidationError("NOAA scale value falls outside 0–5");
    }
    return {
      scale: value,
      text: typeof part.Text === "string" ? part.Text : null,
    };
  };
  return {
    data: {
      observed_at: observedAt,
      radio_blackout: scale(radio),
      solar_radiation: scale(radiation),
      geomagnetic_storm: scale(geomagnetic),
    },
    observedAt,
  };
}

function alertSeverity(message: string): OfficialSolarAlert["severity"] {
  const upper = message.toUpperCase();
  if (upper.includes("ALERT:")) return "alert";
  if (upper.includes("WARNING:")) return "warning";
  if (upper.includes("WATCH:")) return "watch";
  if (upper.includes("SUMMARY:")) return "summary";
  return "information";
}

export function adaptAlerts(
  value: unknown,
  maxRows = 40,
): AdaptedProduct<OfficialSolarAlert[]> {
  const alerts = requireArray(value, "Official alerts").flatMap(
    (value): OfficialSolarAlert[] => {
      const row = record(value);
      if (!row || typeof row.message !== "string" || typeof row.product_id !== "string") return [];
      const parsed = parseUtcInstant(row.issue_datetime);
      if (parsed === null) return [];
      const message = row.message.trim().slice(0, 8_000);
      const title = message.split(/\r?\n/).find((line) => /(?:ALERT|WARNING|WATCH|SUMMARY):/i.test(line))?.trim()
        ?? `SWPC product ${row.product_id}`;
      return [{
        product_id: row.product_id,
        issued_at: new Date(parsed).toISOString(),
        title,
        message,
        severity: alertSeverity(message),
      }];
    },
  );
  if (alerts.length === 0 && Array.isArray(value) && value.length === 0) {
    const observedAt = new Date().toISOString();
    return { data: [], observedAt };
  }
  const data = normalizeTimeSeries(alerts, {
    timestamp: (alert) => alert.issued_at,
    maxRows,
  }).reverse();
  return { data, observedAt: latestTimestamp(data, (alert) => alert.issued_at) };
}

export function adaptLatestXray(value: unknown): AdaptedProduct<LatestXrayFlare> {
  const candidates = requireArray(value, "Latest X-ray flare")
    .map(record)
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row) => ({ row, timestamp: parseUtcInstant(row.time_tag) }))
    .filter((item): item is { row: Record<string, unknown>; timestamp: number } =>
      item.timestamp !== null && item.timestamp <= Date.now() + 5 * 60_000,
    )
    .sort((left, right) => left.timestamp - right.timestamp);
  const latest = candidates[candidates.length - 1];
  if (!latest) throw new SolarValidationError("No latest X-ray flare record", "empty");
  const data: LatestXrayFlare = {
    time_tag: new Date(latest.timestamp).toISOString(),
    current_class: String(latest.row.current_class ?? ""),
    max_class: String(latest.row.max_class ?? ""),
    begin_time: iso(latest.row.begin_time, "flare begin time"),
    max_time: iso(latest.row.max_time, "flare maximum time"),
    end_time: parseUtcInstant(latest.row.end_time) === null ? null : iso(latest.row.end_time, "flare end time"),
    satellite: toFiniteNumber(latest.row.satellite),
  };
  if (
    !/^[ABCMX]\d/i.test(data.current_class) ||
    !/^[ABCMX]\d/i.test(data.max_class)
  ) {
    throw new SolarValidationError("Latest X-ray flare is missing valid class labels");
  }
  return { data, observedAt: data.time_tag };
}

/** One classified GOES X-ray flare from the 7-day flare list. */
export interface XrayFlareEvent {
  beginTime: string | null;
  maxTime: string;
  endTime: string | null;
  maxClass: string;
  region: string | null;
}

/**
 * The rolling 7-day GOES flare list behind the X-ray report's "Flares · 24 h"
 * box. Unlike `adaptLatestXray` (a single current record), an all-quiet week
 * is a legitimate empty response, not a validation failure — mirrors
 * `adaptCme`'s empty-feed handling.
 */
export function adaptXrayFlares(
  value: unknown,
  maxRows = 60,
): AdaptedProduct<XrayFlareEvent[]> {
  const rawRows = requireArray(value, "X-ray flares");
  const events = rawRows.flatMap((value): XrayFlareEvent[] => {
    const row = record(value);
    if (!row) return [];
    const maxClass = String(row.max_class ?? "");
    const maxTimestamp = parseUtcInstant(row.max_time);
    if (!/^[ABCMX]\d(?:\.\d)?$/i.test(maxClass) || maxTimestamp === null) {
      return [];
    }
    // NOAA uses region 0 (and sometimes an empty value) for "unassigned".
    const region = toFiniteNumber(row.region);
    return [
      {
        beginTime:
          parseUtcInstant(row.begin_time) === null
            ? null
            : iso(row.begin_time, "flare begin time"),
        maxTime: new Date(maxTimestamp).toISOString(),
        endTime:
          parseUtcInstant(row.end_time) === null
            ? null
            : iso(row.end_time, "flare end time"),
        maxClass,
        region: region === null || region === 0 ? null : String(region),
      },
    ];
  });
  if (events.length === 0 && rawRows.length === 0) {
    return { data: [], observedAt: new Date().toISOString() };
  }
  // `normalizeTimeSeries` sorts oldest-first and keeps the most recent
  // `maxRows`; the report reads the list newest-first.
  const data = normalizeTimeSeries(events, {
    timestamp: (event) => event.maxTime,
    maxRows,
    maxFutureMs: 5 * 60_000,
  }).reverse();
  return { data, observedAt: latestTimestamp(data, (event) => event.maxTime) };
}

export function adaptWindMag(
  value: unknown,
  maxRows = 12,
): AdaptedProduct<SolarWindMagPoint[]> {
  const values = requireArray(value, "Solar-wind magnetic field");
  const records = values.length > 0 && Array.isArray(values[0])
    ? matrixToRecords(values)
    : values.map(record).filter((row): row is Record<string, unknown> => row !== null);
  const points = records.map((row): SolarWindMagPoint => ({
    time_tag: String(row.time_tag ?? ""),
    bx_gsm: toFiniteNumber(row.bx_gsm),
    by_gsm: toFiniteNumber(row.by_gsm),
    bz_gsm: toFiniteNumber(row.bz_gsm),
    bt: toFiniteNumber(row.bt),
  }));
  const data = normalizeTimeSeries(points, {
    timestamp: (point) => point.time_tag,
    isValid: (point) => point.bz_gsm !== null || point.bt !== null,
    maxRows,
  });
  return { data, observedAt: latestTimestamp(data, (point) => point.time_tag) };
}

export function adaptWindPlasma(
  value: unknown,
  maxRows = 12,
  windowMs?: number,
): AdaptedProduct<SolarWindPlasmaPoint[]> {
  const values = requireArray(value, "Solar-wind speed");
  const records = values.length > 0 && Array.isArray(values[0])
    ? matrixToRecords(values)
    : values.map(record).filter((row): row is Record<string, unknown> => row !== null);
  const points = records.map((row): SolarWindPlasmaPoint => ({
    time_tag: String(row.time_tag ?? ""),
    density: toFiniteNumber(row.density ?? row.proton_density),
    speed: toFiniteNumber(row.speed ?? row.proton_speed),
    temperature: toFiniteNumber(row.temperature ?? row.proton_temperature),
  }));
  const data = normalizeTimeSeries(points, {
    timestamp: (point) => point.time_tag,
    isValid: (point) => point.speed !== null || point.density !== null,
    windowMs,
    maxRows,
  });
  return { data, observedAt: latestTimestamp(data, (point) => point.time_tag) };
}
