import { applyRateLimit } from "../rateLimit.js";
import { spotJsonResponse, spotOptionsResponse } from "../spotResponse.js";
import { configuredStorage, readBoundedJson } from "../spotStore.js";

const PAGE_SIZE = 1000;
const MAX_PAGES = 16;
const RESPONSE_BYTE_LIMIT = 256 * 1024;
const TIMEOUT_MS = 5_000;
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

async function baselineResponse(
  rows: HeatmapBaselineRow[],
  storage: { baseUrl: string; anonKey: string },
  signal: AbortSignal,
): Promise<Response> {
  if (rows.length > 0) {
    const oldest = rows.reduce((a, b) => Date.parse(a.computed_at) < Date.parse(b.computed_at) ? a : b);
    const response = await fetch(new URL(`${storage.baseUrl}/rest/v1/rpc/spot_aggregation_baseline_current`), {
      method: "POST",
      headers: {
        apikey: storage.anonKey,
        Authorization: `Bearer ${storage.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_aggregation: "region_hourly", p_computed_at: oldest.computed_at }),
      signal,
    });
    if (!response.ok) throw new Error("Baseline validity check failed");
    const current = await readBoundedJson(response, 1024);
    if (typeof current !== "boolean") throw new Error("Invalid baseline validity response");
    // A gap invalidates every older snapshot. Checking the oldest timestamp
    // protects all returned rows with one RPC, without exposing the gap ledger.
    // Mixed rebuild snapshots fail closed until the next successful refresh.
    if (!current) rows = [];
  }
  return spotJsonResponse({
    rows,
    meta: { schemaVersion: 1, fetchedAt: new Date().toISOString() },
  }, 200, { "Cache-Control": "public, max-age=3600, s-maxage=3600" });
}

export function parseHeatmapBaselineRow(value: unknown): HeatmapBaselineRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.band !== "string" || !row.band.trim() ||
    typeof row.continent !== "string" || !CONTINENTS.has(row.continent) ||
    typeof row.hour_of_day !== "number" || !Number.isInteger(row.hour_of_day) ||
    row.hour_of_day < 0 || row.hour_of_day > 23 ||
    typeof row.sample_count !== "number" || !Number.isInteger(row.sample_count) ||
    row.sample_count < 0 ||
    typeof row.computed_at !== "string" || !Number.isFinite(Date.parse(row.computed_at))
  ) return null;
  for (const key of ["p25", "p50", "p75", "p95"] as const) {
    if (typeof row[key] !== "number" || !Number.isFinite(row[key]) || row[key] < 0) {
      return null;
    }
  }
  return {
    band: row.band,
    continent: row.continent,
    hour_of_day: row.hour_of_day,
    p25: row.p25 as number,
    p50: row.p50 as number,
    p75: row.p75 as number,
    p95: row.p95 as number,
    sample_count: row.sample_count,
    computed_at: row.computed_at,
  };
}

export async function handleSpotsHeatmapBaseline(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return spotOptionsResponse();
  if (req.method !== "GET") {
    return spotJsonResponse({ error: "Method not allowed", rows: [] }, 405, {
      Allow: "GET, OPTIONS",
      "Cache-Control": "no-store",
    });
  }
  const limited = applyRateLimit(req, "spots/heatmap-baseline", 30, 60);
  if (limited) return limited;

  const storage = configuredStorage();
  if (!storage) {
    return spotJsonResponse({ error: "Spot store not configured", rows: [] }, 503, {
      "Cache-Control": "no-store",
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const rows: HeatmapBaselineRow[] = [];
    let offset = 0;
    // PostgREST caps pages at 1000 rows; this table spans every UTC hour.
    // Count/range metadata also lets us handle a server with a lower page cap.
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(`${storage.baseUrl}/rest/v1/region_activity_climatology`);
      url.searchParams.set("select", "band,continent,hour_of_day,p25,p50,p75,p95,sample_count,computed_at");
      url.searchParams.set("order", "band.asc,continent.asc,hour_of_day.asc");
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("offset", String(offset));
      const response = await fetch(url, {
        headers: {
          apikey: storage.anonKey,
          Authorization: `Bearer ${storage.anonKey}`,
          Prefer: "count=exact",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        return spotJsonResponse(
          { error: `Spot store returned ${response.status}`, rows: [] }, 502,
          { "Cache-Control": "no-store" },
        );
      }
      const payload = await readBoundedJson(response, RESPONSE_BYTE_LIMIT);
      if (!Array.isArray(payload)) throw new Error("Invalid baseline response");
      if (payload.length === 0) {
        return await baselineResponse(rows, storage, controller.signal);
      }
      for (const raw of payload) {
        const row = parseHeatmapBaselineRow(raw);
        if (row) rows.push(row);
      }
      offset += payload.length;
      const totalMatch = response.headers.get("content-range")?.match(/\/(\d+)$/);
      if (totalMatch ? offset >= Number(totalMatch[1]) : payload.length < PAGE_SIZE) {
        return await baselineResponse(rows, storage, controller.signal);
      }
    }
    throw new Error("Baseline pagination limit exceeded");
  } catch (error) {
    const message = controller.signal.aborted || (error instanceof Error && error.name === "AbortError")
      ? "Spot store timed out"
      : "Spot store unavailable";
    return spotJsonResponse({ error: message, rows: [] }, 502, {
      "Cache-Control": "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}
