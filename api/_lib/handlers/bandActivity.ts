/**
 * Band Activity Index feed (BH1) — per-band live counts + climatology
 * percentiles from the band_activity_counts RPC over spot_history.
 *
 * Same-population rule (DEV-PLAN-BAND-HEALTH §5): these counts come from the
 * collector's own ingest window, the population the climatology was built
 * from — clients must not substitute their grid-scoped spot feeds. The
 * per-source counts here are also the only honest provenance for activity
 * badges.
 */

import { applyRateLimit } from "../rateLimit.js";
import { spotJsonResponse, spotOptionsResponse } from "../spotResponse.js";
import { configuredStorage, readBoundedJson } from "../spotStore.js";

const RPC_TIMEOUT_MS = 5_000;
const RESPONSE_BYTE_LIMIT = 64 * 1024;

export interface BandActivityRow {
  band: string;
  count_60m: number;
  obs_20m: number;
  reporters_20m: number;
  count_10m_recent: number;
  count_10m_prior: number;
  source_counts_60m: Record<string, number>;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  sample_count: number | null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

  const sourceCounts: Record<string, number> = {};
  if (
    row.source_counts_60m &&
    typeof row.source_counts_60m === "object" &&
    !Array.isArray(row.source_counts_60m)
  ) {
    for (const [source, n] of Object.entries(
      row.source_counts_60m as Record<string, unknown>,
    )) {
      const parsed = finiteNumber(n);
      if (parsed !== null && parsed >= 0) sourceCounts[source] = parsed;
    }
  }

  return {
    band: row.band,
    count_60m: counts.count_60m as number,
    obs_20m: counts.obs_20m as number,
    reporters_20m: counts.reporters_20m as number,
    count_10m_recent: counts.count_10m_recent as number,
    count_10m_prior: counts.count_10m_prior as number,
    source_counts_60m: sourceCounts,
    p25: finiteNumber(row.p25),
    p50: finiteNumber(row.p50),
    p75: finiteNumber(row.p75),
    p95: finiteNumber(row.p95),
    sample_count: finiteNumber(row.sample_count),
  };
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
        `${storage.baseUrl}/rest/v1/rpc/band_activity_counts`,
        {
          method: "POST",
          headers: {
            apikey: storage.anonKey,
            Authorization: `Bearer ${storage.anonKey}`,
            "Content-Type": "application/json",
          },
          body: "{}",
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
