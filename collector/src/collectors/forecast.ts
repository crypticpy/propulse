import type { SupabaseClient } from "@supabase/supabase-js";
import { reportHealth } from "../health.js";
import { log } from "../logger.js";

const PARSER_VERSION = "forecast-v1";
const FORECAST_45_URL =
  "https://services.swpc.noaa.gov/json/45-day-forecast.json";
const FORECAST_3DAY_URL =
  "https://services.swpc.noaa.gov/text/3-day-solar-geomag-predictions.txt";

interface ForecastValue {
  validAt: string;
  metric: string;
  value: number;
  unit: string | null;
}

interface ParsedForecast {
  source: string;
  product: string;
  issuedAt: string;
  sourceUrl: string;
  rawPayload: unknown;
  values: ForecastValue[];
}

interface Forecast45Payload {
  issued: string;
  source: string;
  product: string;
  units?: Record<string, string>;
  data: Array<{ time: string; metric: string; value: number }>;
}

function parseUtcIssue(value: string): string {
  const match = value.match(
    /^(\d{4})\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2})(\d{2})\s+UTC$/,
  );
  if (!match) throw new Error(`Unrecognized NOAA issue time: ${value}`);
  const parsed = new Date(
    `${match[1]} ${match[2]} ${match[3]} ${match[4]}:${match[5]}:00 UTC`,
  );
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid issue time: ${value}`);
  return parsed.toISOString();
}

function parsePredictionDates(text: string): string[] {
  const line = text.match(/^:Prediction_dates:\s+(.+)$/m)?.[1];
  if (!line) throw new Error("NOAA 3-day product has no prediction dates");
  const matches = [...line.matchAll(/(\d{4})\s+([A-Z][a-z]{2})\s+(\d{1,2})/g)];
  if (matches.length !== 3) throw new Error("NOAA 3-day product must contain 3 dates");
  return matches.map((match) =>
    new Date(`${match[1]} ${match[2]} ${match[3]} 00:00:00 UTC`).toISOString(),
  );
}

function valuesFromLine(text: string, label: string): number[] {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = text.match(new RegExp(`^${escaped}\\s+(.+)$`, "m"))?.[1];
  if (!line) return [];
  return (line.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

export function parse45DayForecast(payload: Forecast45Payload): ParsedForecast {
  if (!payload.issued || !Array.isArray(payload.data)) {
    throw new Error("Invalid NOAA 45-day forecast payload");
  }
  const values = payload.data
    .filter((row) => Number.isFinite(row.value) && Boolean(row.time) && Boolean(row.metric))
    .map((row) => ({
      validAt: new Date(row.time).toISOString(),
      metric: row.metric,
      value: row.value,
      unit: payload.units?.[row.metric] ?? null,
    }));
  return {
    source: payload.source || "NOAA SWPC",
    product: "noaa_45_day_ap_f107",
    issuedAt: new Date(payload.issued).toISOString(),
    sourceUrl: FORECAST_45_URL,
    rawPayload: payload,
    values,
  };
}

export function parse3DayForecast(text: string): ParsedForecast {
  const issueText = text.match(/^:Issued:\s+(.+)$/m)?.[1];
  if (!issueText) throw new Error("NOAA 3-day product has no issue time");
  const issuedAt = parseUtcIssue(issueText.trim());
  const dates = parsePredictionDates(text);
  const values: ForecastValue[] = [];

  const dailyMetrics = [
    ["A_Planetary", "planetary_ap", "index"],
    [":10cm_flux:", "f107", "sfu"],
  ] as const;
  for (const [label, metric, unit] of dailyMetrics) {
    const numbers = valuesFromLine(text, label);
    for (let index = 0; index < Math.min(numbers.length, dates.length); index++) {
      values.push({ validAt: dates[index], metric, value: numbers[index], unit });
    }
  }

  for (const latitude of ["Mid", "High"] as const) {
    for (const startHour of [0, 3, 6, 9, 12, 15, 18, 21]) {
      const endHour = (startHour + 3) % 24;
      const label = `${latitude}/${String(startHour).padStart(2, "0")}-${String(endHour).padStart(2, "0")}UT`;
      const numbers = valuesFromLine(text, label);
      for (let day = 0; day < Math.min(numbers.length, dates.length); day++) {
        const valid = new Date(dates[day]);
        valid.setUTCHours(startHour);
        values.push({
          validAt: valid.toISOString(),
          metric: `${latitude.toLowerCase()}_latitude_k`,
          value: numbers[day],
          unit: "K index",
        });
      }
    }
  }

  if (values.length < 50) {
    throw new Error(`NOAA 3-day parser produced only ${values.length} values`);
  }
  return {
    source: "NOAA Space Weather Prediction Center",
    product: "noaa_3_day_solar_geomagnetic",
    issuedAt,
    sourceUrl: FORECAST_3DAY_URL,
    rawPayload: { text },
    values,
  };
}

async function sha256(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Propulse-Collector/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.text();
}

async function persist(db: SupabaseClient, forecast: ParsedForecast): Promise<number> {
  const payloadSha256 = await sha256(forecast.rawPayload);
  const ingestedAt = new Date().toISOString();
  const { error: payloadError } = await db
    .from("space_weather_forecast_payloads")
    .upsert(
      {
        payload_sha256: payloadSha256,
        source: forecast.source,
        product: forecast.product,
        issued_at: forecast.issuedAt,
        ingested_at: ingestedAt,
        parser_version: PARSER_VERSION,
        source_url: forecast.sourceUrl,
        raw_payload: forecast.rawPayload,
      },
      { onConflict: "payload_sha256", ignoreDuplicates: true },
    );
  if (payloadError) throw new Error(`Forecast payload insert failed: ${payloadError.message}`);

  const issuedMs = new Date(forecast.issuedAt).getTime();
  const rows = forecast.values.map((value) => ({
    payload_sha256: payloadSha256,
    source: forecast.source,
    product: forecast.product,
    issued_at: forecast.issuedAt,
    valid_at: value.validAt,
    available_at: ingestedAt,
    lead_minutes: Math.max(
      0,
      Math.round((new Date(value.validAt).getTime() - issuedMs) / 60_000),
    ),
    metric: value.metric,
    value: value.value,
    unit: value.unit,
    quality: "forecast",
  }));
  const { error: valueError } = await db
    .from("space_weather_forecast_values")
    .upsert(rows, {
      onConflict: "payload_sha256,valid_at,metric",
      ignoreDuplicates: true,
    });
  if (valueError) throw new Error(`Forecast value insert failed: ${valueError.message}`);
  return rows.length;
}

export async function collectForecasts(db: SupabaseClient): Promise<void> {
  const start = Date.now();
  try {
    const [json45, text3day] = await Promise.all([
      fetchText(FORECAST_45_URL).then((text) =>
        parse45DayForecast(JSON.parse(text) as Forecast45Payload),
      ),
      fetchText(FORECAST_3DAY_URL).then(parse3DayForecast),
    ]);
    const counts = await Promise.all([
      persist(db, json45),
      persist(db, text3day),
    ]);
    const rows = counts.reduce((sum, count) => sum + count, 0);
    reportHealth("forecasts", "ok", rows);
    await db.from("collector_health").insert({
      source: "forecasts",
      status: "ok",
      spots_ingested: rows,
      duration_ms: Date.now() - start,
    });
    log("info", "Forecast issuances archived", {
      products: 2,
      values: rows,
      durationMs: Date.now() - start,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reportHealth("forecasts", "error", 0);
    await db.from("collector_health").insert({
      source: "forecasts",
      status: "error",
      duration_ms: Date.now() - start,
      error_message: message,
    });
    log("error", "Forecast collection failed", { error: message });
  }
}
