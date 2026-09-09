import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "../logger.js";
import type { PathArchiveControls } from "../types.js";
import { resolveAggregationWatermark } from "./watermark.js";
import { rewindScanCursorTo } from "./archivePathStats.js";

/**
 * Field-grain path recency aggregator (#297 — NowCast N2).
 *
 * Derives `path_recency_hourly` from `path_hourly_stats` one hour at a time
 * via the `compute_path_recency_hourly` RPC. This is a NETWORK-RECENCY
 * statistic over our own PSK Reporter / RBN spots — never a WSPR opportunity
 * rate, and nothing here reads a WSPR table (that pipeline is decommissioned
 * and must not be rebuilt).
 *
 * Chaining: the recency rows for hour H are a pure function of
 * `path_hourly_stats` for hour H, so this job never runs ahead of the path
 * aggregator. Instead of keeping a second settle clock, it reads the
 * `path_hourly` watermark the path aggregator writes and recomputes every
 * hour from the newest hour already stored in `path_recency_hourly` (or the
 * hour before the watermark, whichever is older) up to the watermark. Redoing
 * the newest stored hour absorbs late spots: when the path aggregator
 * rewrites an hour's cells, the next recency tick rewrites the matching
 * recency rows (the RPC is delete+insert, so it is idempotent). Starting from
 * the stored hour rather than a fixed two-hour window means a collector
 * outage that made the path aggregator catch up several hours at once leaves
 * no holes here either; a gap wider than MAX_HOURS_PER_TICK is capped and
 * logged (scripts/backfill-path-recency.mjs covers anything larger).
 *
 * The service consuming these rows is not activated by this job — that is
 * N4, after the N3 retrain.
 */

/** Must match the transform_version the migration and backfill script use. */
export const PATH_RECENCY_TRANSFORM_VERSION = "psk-rbn-field-recency-v2";

const HOUR_MS = 3_600_000;

/** Upper bound on hours recomputed in one tick; larger holes need the backfill script. */
export const MAX_HOURS_PER_TICK = 48;

async function computeRecencyForHour(
  db: SupabaseClient,
  hourISO: string,
): Promise<number> {
  const { data, error } = await db.rpc("compute_path_recency_hourly", {
    p_hour: hourISO,
    p_transform_version: PATH_RECENCY_TRANSFORM_VERSION,
  });
  if (error) {
    throw new Error(`path-recency RPC failed for ${hourISO}: ${error.message}`);
  }
  return Number(data ?? 0);
}

async function newestStoredRecencyHour(
  db: SupabaseClient,
): Promise<number | null> {
  const { data, error } = await db
    .from("path_recency_hourly")
    .select("hour_utc")
    .eq("transform_version", PATH_RECENCY_TRANSFORM_VERSION)
    .order("hour_utc", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`path-recency newest hour lookup failed: ${error.message}`);
  }
  if (!data?.hour_utc) return null;
  const ms = new Date(String(data.hour_utc)).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Recompute every settled hour of `path_recency_hourly` from the newest
 * stored hour (inclusive) up to the path_hourly watermark. Returns the number
 * of rows written across those hours.
 */
export async function computePathRecency(db: SupabaseClient): Promise<number> {
  const watermark = await resolveAggregationWatermark(db, "path_hourly");
  if (!watermark) {
    // Fresh deployment (or the path aggregator has never completed an hour).
    // Nothing to derive from yet; the next tick retries.
    log("info", "No path hourly watermark yet - skipping path recency");
    return 0;
  }

  const watermarkMs = new Date(watermark).getTime();
  if (!Number.isFinite(watermarkMs)) {
    throw new Error(`path_hourly watermark is not a valid time: ${watermark}`);
  }

  const stored = await newestStoredRecencyHour(db);
  let startMs = Math.min(watermarkMs - HOUR_MS, stored ?? Number.POSITIVE_INFINITY);
  const span = Math.floor((watermarkMs - startMs) / HOUR_MS) + 1;
  if (span > MAX_HOURS_PER_TICK) {
    log("warn", "Path recency gap exceeds one tick; run the backfill script", {
      newestStoredHour: new Date(startMs).toISOString(),
      watermarkHour: watermark,
      gapHours: span,
      cappedTo: MAX_HOURS_PER_TICK,
    });
    startMs = watermarkMs - (MAX_HOURS_PER_TICK - 1) * HOUR_MS;
  }

  // Oldest first, newest hour last, so a mid-run failure leaves the cursor
  // unadvanced and the next tick resumes from the newest stored hour.
  const hours: string[] = [];
  for (let ms = startMs; ms <= watermarkMs; ms += HOUR_MS) {
    hours.push(new Date(ms).toISOString());
  }

  // Re-read gaps on every tick. An advanced path watermark is progress, not
  // proof that intervening hours were observed. Do not synthesize recency from
  // known-expired raw hours. Missing metadata fails closed.
  const { data: gaps, error: gapError } = await db
    .from("collector_aggregation_gaps")
    .select("start_hour,end_hour")
    .eq("aggregation", "path_hourly")
    .lte("start_hour", watermark)
    .gte("end_hour", hours[0])
    .limit(100);
  if (gapError || !Array.isArray(gaps) || gaps.length >= 100) {
    throw new Error("Cannot verify path aggregation recovery gaps");
  }
  const ranges = gaps.map((gap) => {
    const from = Date.parse(gap.start_hour);
    const to = Date.parse(gap.end_hour);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
      throw new Error("Invalid path aggregation recovery gap");
    }
    return { from, to };
  });
  let rowsWritten = 0;
  let skipped = 0;
  for (const hourISO of hours) {
    const ms = Date.parse(hourISO);
    if (ranges.some(({ from, to }) => from <= ms && ms <= to)) {
      skipped++;
      continue;
    }
    rowsWritten += await computeRecencyForHour(db, hourISO);
  }
  if (skipped > 0) {
    throw new Error(`Path recency skipped ${skipped} expired source hours`);
  }
  // Always replay the newest stored hour: same-hour path updates can contain
  // late reports even when the watermark hour has not changed.
  log("info", "Path recency aggregation complete", {
    watermarkHour: watermark,
    hours,
    rowsWritten,
  });
  return rowsWritten;
}

export interface PathRecencyPruneResult {
  daysPruned: number;
  rowsDeleted: number;
}

/**
 * Delete one hour of `path_recency_hourly`. Deletes go hour-by-hour rather
 * than day-wide: `path_recency_hourly` is ~70k rows/day, and every other
 * delete on these tables (`prune_archived_path_hourly_stats`,
 * `compute_path_recency_hourly`) is a `SECURITY DEFINER` RPC with
 * `SET statement_timeout = '120s'` for exactly this reason — a range delete
 * of this shape does not reliably finish inside the default 8s PostgREST
 * role timeout (#609 review N2). 24 bounded statements per day instead of
 * one day-wide one.
 */
async function deleteRecencyHour(
  db: SupabaseClient,
  hourStartIso: string,
  hourEndIso: string,
): Promise<number> {
  const { error, count } = await db
    .from("path_recency_hourly")
    .delete({ count: "exact" })
    .gte("hour_utc", hourStartIso)
    .lt("hour_utc", hourEndIso);
  if (error) {
    throw new Error(
      `path-recency prune failed for hour ${hourStartIso}: ${error.message}`,
    );
  }
  return count ?? 0;
}

async function deleteRecencyDay(
  db: SupabaseClient,
  day: string,
): Promise<number> {
  const dayStartMs = Date.parse(`${day}T00:00:00.000Z`);
  let deleted = 0;
  for (let hour = 0; hour < 24; hour++) {
    const hourStartIso = new Date(dayStartMs + hour * HOUR_MS).toISOString();
    const hourEndIso = new Date(
      dayStartMs + (hour + 1) * HOUR_MS,
    ).toISOString();
    deleted += await deleteRecencyHour(db, hourStartIso, hourEndIso);
  }
  return deleted;
}

/**
 * Drop derived `path_recency_hourly` days the archive pass just confirmed
 * sealed (a verified `path_hourly_stats` manifest exists for that day).
 * Recency is a pure function of hourly stats and has no archive of its own:
 * restore a day's stats CSV and rerun `scripts/backfill-path-recency.mjs`
 * to reconstruct it. `sealedDays` must come from the same archive pass
 * (`ArchivePassResult.sealedDays`, collector/src/index.ts) that ran this
 * tick — the prune must be a subset of confirmed-sealed days by
 * construction, not by a separately computed window (#609 review N1/N3).
 * Fail-closed — a no-op unless `ARCHIVE_PATH_STATS_PRUNE=true`. Work is
 * bounded to `maxDaysPerRun`.
 */
export async function prunePathRecency(
  db: SupabaseClient,
  controls: PathArchiveControls,
  sealedDays: string[],
): Promise<PathRecencyPruneResult> {
  if (!controls.pruneEnabled) {
    return { daysPruned: 0, rowsDeleted: 0 };
  }

  const days = sealedDays.slice(0, controls.maxDaysPerRun);
  let daysPruned = 0;
  let rowsDeleted = 0;
  for (const day of days) {
    let deleted: number;
    try {
      deleted = await deleteRecencyDay(db, day);
    } catch (error) {
      // This day's prune did not finish, so nothing after it in sealedDays
      // did either. Rewind archivePathStats's scan cursor to it: the
      // manifest is already sealed, so the next pass free-walks straight
      // back to this day and only retries the prune step — it does not
      // re-export (#711 F1).
      rewindScanCursorTo(day);
      throw error;
    }
    if (deleted > 0) {
      daysPruned += 1;
      rowsDeleted += deleted;
      log("info", "Pruned path_recency_hourly day", { day, rows: deleted });
    }
  }
  if (days.length < sealedDays.length) {
    // The per-run budget capped this call before the rest of sealedDays.
    // Already-sealed days cost the archive pass no budget, so a restart or
    // an idle deploy can seal far more days in one pass than
    // maxDaysPerRun; the un-pruned remainder must not be left behind a
    // cursor that already raced past it (#711 F1).
    rewindScanCursorTo(sealedDays[days.length]);
  }
  return { daysPruned, rowsDeleted };
}
