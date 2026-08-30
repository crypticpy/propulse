/**
 * Band Activity Index feed (BH1) + scoped counts (BH2) — per-band live
 * counts + climatology percentiles from the count RPCs over spot_history.
 *
 * Scopes (DEV-PLAN-BAND-HEALTH §4), selected by query params:
 *   (none)                → band_activity_counts        (global)
 *   ?continent=NA         → region_activity_counts      (Regional)
 *   ?tx_field=EM&rx_field=JO → band_pair_counts         (DX pair, both
 *                             directions; no climatology — the DX baseline
 *                             is path_hourly_stats, used by scoring later)
 *
 * Same-population rule (§5): these counts come from the collector's own
 * ingest window, the population the climatology was built from — clients
 * must not substitute their grid-scoped spot feeds. The per-source counts
 * here are also the only honest provenance for activity badges.
 */

import { applyRateLimit } from "../rateLimit.js";
import { spotJsonResponse, spotOptionsResponse } from "../spotResponse.js";
import { configuredStorage, readBoundedJson } from "../spotStore.js";

const RPC_TIMEOUT_MS = 5_000;
const RESPONSE_BYTE_LIMIT = 64 * 1024;

const CONTINENTS = new Set(["NA", "SA", "EU", "AF", "AS", "OC", "AN"]);
const FIELD_REGEX = /^[A-R]{2}$/;

export interface BandActivityRow {
  band: string;
  continent?: string;
  count_60m: number;
  obs_20m: number;
  reporters_20m: number;
  count_10m_recent: number;
  count_10m_prior: number;
  source_counts_60m: Record<string, number>;
  mode_obs_20m: Record<string, number>;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  sample_count: number | null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function countMap(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, n] of Object.entries(value as Record<string, unknown>)) {
      const parsed = finiteNumber(n);
      if (parsed !== null && parsed >= 0) out[key] = parsed;
    }
  }
  return out;
}

export function parseBandActivityRow(value: unknown): BandActivityRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.band !== "string" || row.band.length === 0) return null;

  const counts = {
    count_60m: finiteNumber(row.count_60m),
    obs_20m: finiteNumber(row.obs_20m),
    reporters_20m: finiteNumber(row.reporters_20m),
    count_10m_recent: finiteNumber(row.count_10m_recent),
    count_10m_prior: finiteNumber(row.count_10m_prior),
  };
  if (Object.values(counts).some((n) => n === null || n < 0)) return null;

  return {
    band: row.band,
    ...(typeof row.continent === "string" && row.continent.length > 0
      ? { continent: row.continent }
      : {}),
    count_60m: counts.count_60m as number,
    obs_20m: counts.obs_20m as number,
    reporters_20m: counts.reporters_20m as number,
    count_10m_recent: counts.count_10m_recent as number,
    count_10m_prior: counts.count_10m_prior as number,
    source_counts_60m: countMap(row.source_counts_60m),
    mode_obs_20m: countMap(row.mode_obs_20m),
    p25: finiteNumber(row.p25),
    p50: finiteNumber(row.p50),
    p75: finiteNumber(row.p75),
    p95: finiteNumber(row.p95),
    sample_count: finiteNumber(row.sample_count),
  };
}

interface ScopeSelection {
  rpc: string;
  args: Record<string, string>;
  scope: Record<string, string>;
}

/** Map validated query params onto the RPC serving that scope. */
export function selectScope(url: URL): ScopeSelection | { error: string } {
  const continent = url.searchParams.get("continent");
  const txField = url.searchParams.get("tx_field");
  const rxField = url.searchParams.get("rx_field");

  if (txField !== null || rxField !== null) {
    if (continent !== null) {
      return { error: "continent and tx_field/rx_field are exclusive" };
    }
    const tx = (txField ?? "").toUpperCase();
    const rx = (rxField ?? "").toUpperCase();
    if (!FIELD_REGEX.test(tx) || !FIELD_REGEX.test(rx)) {
      return { error: "tx_field and rx_field must be Maidenhead fields (A-R)" };
    }
    return {
      rpc: "band_pair_counts",
      args: { p_tx_field: tx, p_rx_field: rx },
      scope: { type: "pair", tx_field: tx, rx_field: rx },
    };
  }

  if (continent !== null) {
    const code = continent.toUpperCase();
    if (!CONTINENTS.has(code)) {
      return { error: "continent must be one of NA, SA, EU, AF, AS, OC, AN" };
    }
    return {
      rpc: "region_activity_counts",
      args: { target_continent: code },
      scope: { type: "regional", continent: code },
    };
  }

  return { rpc: "band_activity_counts", args: {}, scope: { type: "global" } };
}

export async function handleSpotsBandActivity(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return spotOptionsResponse();
  }
  if (req.method !== "GET") {
    return spotJsonResponse({ error: "Method not allowed", bands: [] }, 405, {
      Allow: "GET, OPTIONS",
      "Cache-Control": "no-store",
    });
  }

  const limited = applyRateLimit(req, "spots/band-activity", 30, 60);
  if (limited) return limited;

  const selection = selectScope(new URL(req.url));
  if ("error" in selection) {
    return spotJsonResponse({ error: selection.error, bands: [] }, 400, {
      "Cache-Control": "no-store",
    });
  }

  const storage = configuredStorage();
  if (!storage) {
    return spotJsonResponse(
      { error: "Spot store not configured", bands: [] },
      503,
      { "Cache-Control": "s-maxage=15, stale-while-revalidate=60" },
    );
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(
        `${storage.baseUrl}/rest/v1/rpc/${selection.rpc}`,
        {
          method: "POST",
          headers: {
            apikey: storage.anonKey,
            Authorization: `Bearer ${storage.anonKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(selection.args),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return spotJsonResponse(
        { error: `Spot store returned ${response.status}`, bands: [] },
        502,
        { "Cache-Control": "s-maxage=15, stale-while-revalidate=60" },
      );
    }

    const payload = await readBoundedJson(response, RESPONSE_BYTE_LIMIT);
    const bands = Array.isArray(payload)
      ? payload
          .map(parseBandActivityRow)
          .filter((row): row is BandActivityRow => row !== null)
      : [];

    return spotJsonResponse(
      {
        bands,
        meta: {
          schemaVersion: 1,
          scope: selection.scope,
          fetchedAt: new Date().toISOString(),
        },
      },
      200,
      { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" },
    );
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Spot store timed out"
        : "Spot store unavailable";
    return spotJsonResponse({ error: message, bands: [] }, 502, {
      "Cache-Control": "s-maxage=15, stale-while-revalidate=60",
    });
  }
}
