/**
 * Model forecast snapshot writer (#296 — collector half).
 *
 * The Railway inference service (ml/service/, model
 * propagation_v4_2_phase2_scale-a6-retrospective-internal-50000000) has
 * never had its predictions logged, so it cannot be scored. This job does
 * for the model what forecastSnapshot.ts does for the client physics
 * engine: once per tick, log a per-band p_open into `forecast_snapshots`
 * (source "model_physics"/"model_nowcast") so the eval harness can compare
 * engines honestly. Same log-don't-reconstruct rule: first write per
 * (hour, band, source, horizon, mode_class) wins.
 *
 * Unlike the physics writer this job calls a new, parallel-built service
 * endpoint (POST {INFERENCE_BASE_URL}/v1/propagation/reference) — see
 * referenceSurface.ts for the frozen 11-hub / 110-path surface it asks
 * about on every tick, one band at a time (the service pins one XGBoost
 * thread, so requests are sequential, never parallel).
 *
 * Whole-tick atomicity: a failure on any one band (non-200, timeout,
 * malformed JSON, or a predictions array whose length/pairs don't match
 * the request) fails the ENTIRE run — nothing is written. Rows are built
 * in memory across all REFERENCE_BANDS and upserted together in one call,
 * so a partial surface can never land in the table.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../logger.js";
import { reportHealth } from "../health.js";
import { reportToDb } from "../lib/db-helpers.js";
import {
  REFERENCE_BANDS,
  REFERENCE_SURFACE_ID,
  continentOf,
  referencePaths,
  type ReferenceBand,
  type ReferencePath,
} from "../lib/referenceSurface.js";
import { hourBucketUtc } from "./forecastSnapshot.js";

// Read lazily so tests can stub the env per-case.
const inferenceBaseUrl = (): string =>
  process.env.INFERENCE_BASE_URL ||
  "https://propulse-inference-production.up.railway.app";
const inferenceServiceToken = (): string =>
  process.env.INFERENCE_SERVICE_TOKEN || "";

const FETCH_TIMEOUT_MS = 30_000;
const DECLARED_POWER_WATTS = 5;
/** Mid-hour: the row is keyed by hour_utc, not by how "current" this is. */
const VALID_TIME_OFFSET_MS = 30 * 60_000;

interface ReferencePrediction {
  origin_grid4: string;
  target_grid4: string;
  core_probability: number;
  confidence: number;
  profile: string;
  missing_feature_count: number;
}

interface ReferenceResponse {
  model_version: string;
  feature_contract: string;
  data_freshness: Record<string, unknown>;
  profile_counts: Record<string, unknown>;
  predictions: ReferencePrediction[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validate the response against the fixed contract: a JSON object whose
 * predictions array is exactly as long as the request's paths and whose
 * pairs line up position-for-position. Anything else is a failed run.
 */
function validateReferenceResponse(
  body: unknown,
  band: string,
  requestPaths: ReferencePath[],
): ReferenceResponse {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`reference response for ${band} is not a JSON object`);
  }
  const b = body as Record<string, unknown>;

  if (typeof b.model_version !== "string" || !b.model_version) {
    throw new Error(`reference response for ${band} is missing model_version`);
  }
  if (typeof b.feature_contract !== "string" || !b.feature_contract) {
    throw new Error(`reference response for ${band} is missing feature_contract`);
  }

  const predictions = b.predictions;
  if (!Array.isArray(predictions) || predictions.length !== requestPaths.length) {
    const got = Array.isArray(predictions) ? predictions.length : "no";
    throw new Error(
      `reference response for ${band} has ${got} predictions, expected ${requestPaths.length}`,
    );
  }

  for (let i = 0; i < requestPaths.length; i++) {
    const p = predictions[i] as Record<string, unknown> | null;
    const want = requestPaths[i];
    if (
      !p ||
      typeof p !== "object" ||
      p.origin_grid4 !== want.origin_grid4 ||
      p.target_grid4 !== want.target_grid4 ||
      !isFiniteNumber(p.core_probability) ||
      !isFiniteNumber(p.confidence) ||
      typeof p.profile !== "string" ||
      !isFiniteNumber(p.missing_feature_count)
    ) {
      throw new Error(
        `reference response for ${band} has a malformed or mismatched prediction at index ${i}`,
      );
    }
  }

  return {
    model_version: b.model_version,
    feature_contract: b.feature_contract,
    data_freshness:
      b.data_freshness && typeof b.data_freshness === "object"
        ? (b.data_freshness as Record<string, unknown>)
        : {},
    profile_counts:
      b.profile_counts && typeof b.profile_counts === "object"
        ? (b.profile_counts as Record<string, unknown>)
        : {},
    predictions: predictions as ReferencePrediction[],
  };
}

async function fetchReferenceSurface(
  band: string,
  issueTimeIso: string,
  validTimeIso: string,
  paths: ReferencePath[],
  token: string,
): Promise<ReferenceResponse> {
  let res: Response;
  try {
    res = await fetch(`${inferenceBaseUrl()}/v1/propagation/reference`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        issue_time: issueTimeIso,
        valid_time: validTimeIso,
        band,
        declared_power_watts: DECLARED_POWER_WATTS,
        paths,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`reference endpoint unreachable for band ${band}: ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`reference endpoint HTTP ${res.status} for band ${band}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(`reference endpoint returned malformed JSON for band ${band}`);
  }

  return validateReferenceResponse(body, band, paths);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export interface ModelSnapshotRow {
  hour_utc: string;
  band: ReferenceBand;
  source: "model_physics" | "model_nowcast";
  horizon_hours: 0;
  p_open: number;
  mode_class: "digital";
  meta: {
    surface_id: string;
    model_version: string;
    feature_contract: string;
    n_paths: number;
    power_w: number;
    profile_counts: Record<string, unknown>;
    confidence_mean: number;
    missing_feature_count_max: number;
    data_freshness: Record<string, unknown>;
    by_origin: Record<string, number>;
    by_continent_pair: Record<string, number>;
    mixed_profiles?: true;
  };
}

function buildSnapshotRow(
  hourUtc: string,
  band: ReferenceBand,
  response: ReferenceResponse,
  paths: ReferencePath[],
): ModelSnapshotRow {
  const { predictions } = response;

  const profiles = new Set(predictions.map((p) => p.profile));
  const allPhysics = profiles.size === 1 && profiles.has("physics");
  const allNowcast = profiles.size === 1 && profiles.has("nowcast");
  const mixed = !allPhysics && !allNowcast;
  const source: ModelSnapshotRow["source"] = allPhysics
    ? "model_physics"
    : "model_nowcast";

  const byOriginValues = new Map<string, number[]>();
  const byContinentPairValues = new Map<string, number[]>();

  for (let i = 0; i < predictions.length; i++) {
    const prediction = predictions[i];
    const path = paths[i];

    const originValues = byOriginValues.get(path.origin_grid4) ?? [];
    originValues.push(prediction.core_probability);
    byOriginValues.set(path.origin_grid4, originValues);

    const pairKey = `${continentOf(path.origin_grid4)}>${continentOf(path.target_grid4)}`;
    const pairValues = byContinentPairValues.get(pairKey) ?? [];
    pairValues.push(prediction.core_probability);
    byContinentPairValues.set(pairKey, pairValues);
  }

  const byOrigin: Record<string, number> = {};
  for (const [grid, values] of byOriginValues) byOrigin[grid] = mean(values);

  const byContinentPair: Record<string, number> = {};
  for (const [pair, values] of byContinentPairValues) {
    byContinentPair[pair] = mean(values);
  }

  return {
    hour_utc: hourUtc,
    band,
    source,
    horizon_hours: 0,
    p_open: mean(predictions.map((p) => p.core_probability)),
    mode_class: "digital",
    meta: {
      surface_id: REFERENCE_SURFACE_ID,
      model_version: response.model_version,
      feature_contract: response.feature_contract,
      n_paths: predictions.length,
      power_w: DECLARED_POWER_WATTS,
      profile_counts: response.profile_counts,
      confidence_mean: mean(predictions.map((p) => p.confidence)),
      missing_feature_count_max: Math.max(
        ...predictions.map((p) => p.missing_feature_count),
      ),
      data_freshness: response.data_freshness,
      by_origin: byOrigin,
      by_continent_pair: byContinentPair,
      ...(mixed ? { mixed_profiles: true as const } : {}),
    },
  };
}

let warnedNoToken = false;

/** Test-only: reset the no-token warning latch. */
export function resetModelSnapshotStateForTests(): void {
  warnedNoToken = false;
}

export async function collectModelSnapshot(db: SupabaseClient): Promise<void> {
  const start = Date.now();
  const token = inferenceServiceToken();

  if (!token) {
    if (!warnedNoToken) {
      warnedNoToken = true;
      log(
        "warn",
        "INFERENCE_SERVICE_TOKEN not set — model snapshot logging disabled",
      );
    }
    reportHealth("model-snapshot", "disabled", 0);
    return;
  }

  const hourUtc = hourBucketUtc(start);
  const issueTimeIso = new Date(start).toISOString();
  const validTimeIso = new Date(
    Date.parse(hourUtc) + VALID_TIME_OFFSET_MS,
  ).toISOString();
  const paths = referencePaths();

  try {
    const rows: ModelSnapshotRow[] = [];
    for (const band of REFERENCE_BANDS) {
      const response = await fetchReferenceSurface(
        band,
        issueTimeIso,
        validTimeIso,
        paths,
        token,
      );
      rows.push(buildSnapshotRow(hourUtc, band, response, paths));
    }

    // First write for the (hour, band, source, horizon, mode) slot wins.
    const { error: upsertError } = await db
      .from("forecast_snapshots")
      .upsert(rows, {
        onConflict: "hour_utc,band,source,horizon_hours,mode_class",
        ignoreDuplicates: true,
      });

    if (upsertError) {
      throw new Error(`Model snapshot upsert failed: ${upsertError.message}`);
    }

    const durationMs = Date.now() - start;
    reportHealth("model-snapshot", "ok", rows.length);
    await reportToDb(db, "model-snapshot", "ok", rows.length, durationMs);

    log("info", "Model snapshot written", {
      hourUtc,
      rows: rows.length,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    reportHealth("model-snapshot", "error", 0);
    await reportToDb(db, "model-snapshot", "error", 0, durationMs, msg);
    log("error", "Model snapshot failed", { error: msg });
  }
}
