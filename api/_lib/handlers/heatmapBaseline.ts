import { applyRateLimit } from "../rateLimit.js";
import { spotJsonResponse, spotOptionsResponse } from "../spotResponse.js";
import { configuredStorage, readBoundedJson } from "../spotStore.js";

const PAGE_SIZE = 1000;
const MAX_PAGES = 16;
const RESPONSE_BYTE_LIMIT = 256 * 1024;
const HOUR_MS = 3_600_000;
const CONTINENTS = new Set(["NA", "SA", "EU", "AF", "AS", "OC", "AN"]);

export interface HeatmapBaselineRow {
  band: string;
  continent: string;
  hour_of_day: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  sample_count: number;
  computed_at: string;
}

export interface RegionalHourRow {
  band: string;
  continent: string;
  hour_utc: string;
  spot_count: number;
}

function regionalIdentity(row: Record<string, unknown>): boolean {
  return typeof row.band === "string" && row.band.trim().length > 0 &&
    typeof row.continent === "string" && CONTINENTS.has(row.continent);
}

export function parseHeatmapBaselineRow(value: unknown): HeatmapBaselineRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!regionalIdentity(row) ||
    typeof row.hour_of_day !== "number" || !Number.isInteger(row.hour_of_day) ||
    row.hour_of_day < 0 || row.hour_of_day > 23 ||
    typeof row.sample_count !== "number" || !Number.isInteger(row.sample_count) ||
    row.sample_count < 0 || typeof row.computed_at !== "string" ||
    !Number.isFinite(Date.parse(row.computed_at))) return null;
  for (const key of ["p25", "p50", "p75", "p95"] as const) {
    if (typeof row[key] !== "number" || !Number.isFinite(row[key]) || row[key] < 0) return null;
  }
  return {
    band: row.band as string, continent: row.continent as string,
    hour_of_day: row.hour_of_day, p25: row.p25 as number, p50: row.p50 as number,
    p75: row.p75 as number, p95: row.p95 as number,
    sample_count: row.sample_count, computed_at: row.computed_at,
  };
}

export function parseRegionalHourRow(value: unknown, hourUtc: string): RegionalHourRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!regionalIdentity(row) || typeof row.hour_utc !== "string" ||
    Date.parse(row.hour_utc) !== Date.parse(hourUtc) ||
    typeof row.spot_count !== "number" || !Number.isSafeInteger(row.spot_count) ||
    row.spot_count < 0) return null;
  return {
    band: row.band as string, continent: row.continent as string,
    hour_utc: hourUtc, spot_count: row.spot_count,
  };
}

type Storage = { baseUrl: string; anonKey: string };

async function readTable(storage: Storage, signal: AbortSignal, table: string, params: Record<string, string>): Promise<unknown[]> {
  const rows: unknown[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`${storage.baseUrl}/rest/v1/${table}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, {
      headers: { apikey: storage.anonKey, Authorization: `Bearer ${storage.anonKey}`, Prefer: "count=exact" },
      signal,
    });
    if (!response.ok) throw new Error("Spot store read failed");
    const payload = await readBoundedJson(response, RESPONSE_BYTE_LIMIT);
    if (!Array.isArray(payload)) throw new Error("Invalid regional response");
    if (payload.length === 0) return rows;
    rows.push(...payload);
    offset += payload.length;
    const total = response.headers.get("content-range")?.match(/\/(\d+)$/);
    if (total ? offset >= Number(total[1]) : payload.length < PAGE_SIZE) return rows;
  }
  throw new Error("Regional pagination limit exceeded");
}

async function guard(storage: Storage, signal: AbortSignal, rpc: string, args: Record<string, string>): Promise<boolean> {
  const response = await fetch(new URL(`${storage.baseUrl}/rest/v1/rpc/${rpc}`), {
    method: "POST",
    headers: { apikey: storage.anonKey, Authorization: `Bearer ${storage.anonKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(args), signal,
  });
  if (!response.ok) throw new Error("Regional validity check failed");
  const valid = await readBoundedJson(response, 1024);
  if (typeof valid !== "boolean") throw new Error("Invalid regional validity response");
  return valid;
}

export async function handleSpotsHeatmapBaseline(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return spotOptionsResponse();
  if (req.method !== "GET") return spotJsonResponse({ error: "Method not allowed", baseline: [], current: [] }, 405, {
    Allow: "GET, OPTIONS", "Cache-Control": "no-store",
  });
  const limited = applyRateLimit(req, "spots/heatmap-baseline", 30, 60);
  if (limited) return limited;
  const storage = configuredStorage();
  if (!storage) return spotJsonResponse({ error: "Spot store not configured", baseline: [], current: [] }, 503, {
    "Cache-Control": "no-store",
  });

  const requestedAt = Date.now();
  const hourUtc = new Date(Math.floor(requestedAt / HOUR_MS) * HOUR_MS - HOUR_MS).toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const rawBaseline = await readTable(storage, controller.signal, "region_activity_climatology", {
      select: "band,continent,hour_of_day,p25,p50,p75,p95,sample_count,computed_at",
      hour_of_day: `eq.${new Date(hourUtc).getUTCHours()}`,
      order: "band.asc,continent.asc,hour_of_day.asc",
    });
    let baseline = rawBaseline.map(parseHeatmapBaselineRow).filter((row): row is HeatmapBaselineRow => row !== null);
    const rawCurrent = await readTable(storage, controller.signal, "region_hourly_stats", {
      select: "band,continent,hour_utc,spot_count",
      hour_utc: `eq.${hourUtc}`, order: "band.asc,continent.asc",
    });
    let current = rawCurrent.map((row) => parseRegionalHourRow(row, hourUtc)).filter((row): row is RegionalHourRow => row !== null);
    let computedAt = baseline.length ? baseline.reduce((a, b) => Date.parse(a.computed_at) < Date.parse(b.computed_at) ? a : b).computed_at : null;
    // Check the oldest snapshot once: every newer row must also pass. Known
    // gaps and mixed rebuild snapshots fail closed, without exposing the ledger.
    if (computedAt && !await guard(storage, controller.signal, "spot_aggregation_baseline_current", {
      p_aggregation: "region_hourly", p_computed_at: computedAt,
    })) {
      baseline = [];
      computedAt = null;
    }
    if (current.length && !await guard(storage, controller.signal, "spot_aggregation_hour_readable", {
      p_aggregation: "region_hourly", p_hour: hourUtc,
    })) current = [];

    // Never carry an hourly response across the next UTC boundary. A missing
    // current hour is retried soon so the collector's settling delay is visible.
    const cacheSeconds = Math.max(0, Math.min(3600, Math.floor(((Math.floor(requestedAt / HOUR_MS) + 1) * HOUR_MS - Date.now()) / 1000)));
    return spotJsonResponse({ baseline, current, meta: {
      schemaVersion: 2, fetchedAt: new Date().toISOString(), hour_utc: hourUtc, computedAt,
    } }, 200, { "Cache-Control": current.length && baseline.length
      ? `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}` : "no-store" });
  } catch (error) {
    const message = controller.signal.aborted || (error instanceof Error && error.name === "AbortError")
      ? "Spot store timed out" : "Spot store unavailable";
    return spotJsonResponse({ error: message, baseline: [], current: [] }, 502, { "Cache-Control": "no-store" });
  } finally {
    clearTimeout(timer);
  }
}
