/**
 * path_hourly_stats day archiver.
 *
 * path_hourly_stats is the append-only ML training aggregate (~75-80K
 * rows/day, ~430 MB/month). Nothing live reads more than a 7-day window, so
 * complete UTC days older than the hot window are exported to the private
 * `propagation-archives` storage bucket as gzipped CSV and — only when the
 * operator has armed pruning — deleted from the hot table.
 *
 * Fail-closed delete chain, in order, all mandatory:
 *   1. day rows exported (keyset-paged, ordered by id),
 *   2. CSV.gz uploaded, downloaded back, SHA-256 + row-count verified,
 *   3. manifest JSON uploaded (its presence marks the day sealed),
 *   4. ARCHIVE_PATH_STATS_PRUNE=true (default false — exports still run),
 *   5. the prune_archived_path_hourly_stats RPC re-counts the live day and
 *      refuses unless it exactly matches the manifest's row count.
 *
 * A day whose manifest already exists is never re-exported; re-runs only
 * retry the prune step (idempotent — a fully pruned day counts 0 live rows
 * and is skipped). Sealed days that need no work do not count against the
 * budget, so exports keep advancing past them even while pruning is
 * disabled; work is bounded to maxDaysPerRun exported/pruned days per tick.
 *
 * See docs/runbooks/AGGREGATE-ARCHIVAL.md.
 */

import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "../logger.js";
import { reportHealth } from "../health.js";
import { reportToDb } from "../lib/db-helpers.js";
import type { PathArchiveControls } from "../types.js";

const BUCKET = "propagation-archives";
const PAGE_SIZE = 1000;
const DATASET = "path_hourly_stats";
const SCHEMA_VERSION = 1;

export const PATH_STATS_COLUMNS = [
  "id",
  "hour_utc",
  "band",
  "mode_class",
  "tx_field",
  "rx_field",
  "spot_count",
  "unique_tx",
  "unique_rx",
  "avg_snr",
  "median_snr",
  "backfilled_count",
] as const;

export type PathStatsRow = Record<
  (typeof PATH_STATS_COLUMNS)[number],
  unknown
>;

export interface DayManifest {
  dataset: string;
  schemaVersion: number;
  day: string;
  rowCount: number;
  sha256: string;
  sizeBytes: number;
  columns: readonly string[];
  exportedAt: string;
}

// ── Pure helpers (exported for tests) ───────────────────────────────────────

export function archiveObjectPath(day: string): string {
  const [year, month] = day.split("-");
  return `aggregates/${DATASET}/v${SCHEMA_VERSION}/year=${year}/month=${month}/${DATASET}-${day}.csv.gz`;
}

export function manifestObjectPath(day: string): string {
  return archiveObjectPath(day).replace(/\.csv\.gz$/, ".manifest.json");
}

export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: PathStatsRow[]): string {
  const lines = [PATH_STATS_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(PATH_STATS_COLUMNS.map((c) => csvField(row[c])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function utcDayString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  return utcDayString(Date.parse(`${day}T00:00:00.000Z`) + n * 86_400_000);
}

/**
 * Complete UTC days from oldestDay (inclusive) strictly older than the hot
 * window. The newest archivable day is the one ending hotDays ago, so late
 * aggregator catch-up (bounded to RETENTION_SPOTS = 7 days) can never append
 * to a day after it is archived. Deliberately uncapped: already-sealed days
 * must stay visible to the pass so it can skip past them, otherwise exports
 * stall on the oldest sealed day while pruning is disabled. The per-tick
 * work bound (maxDaysPerRun) is applied by runArchivePass to days that
 * actually need an export or a prune.
 */
export function archivableDays(
  oldestDay: string,
  nowMs: number,
  hotDays: number,
): string[] {
  const cutoffDay = utcDayString(nowMs - hotDays * 86_400_000);
  const days: string[] = [];
  for (let day = oldestDay; day < cutoffDay; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// ── Database / storage steps ─────────────────────────────────────────────────

async function fetchOldestDay(db: SupabaseClient): Promise<string | null> {
  const { data, error } = await db
    .from("path_hourly_stats")
    .select("hour_utc")
    .order("hour_utc", { ascending: true })
    .limit(1);
  if (error) throw new Error(`oldest-hour query failed: ${error.message}`);
  const first = (data as { hour_utc: string }[] | null)?.[0];
  return first ? first.hour_utc.slice(0, 10) : null;
}

async function fetchDayRows(
  db: SupabaseClient,
  day: string,
): Promise<PathStatsRow[]> {
  const startIso = `${day}T00:00:00.000Z`;
  const endIso = `${addDays(day, 1)}T00:00:00.000Z`;
  const rows: PathStatsRow[] = [];
  let lastId = -1;

  for (;;) {
    const { data, error } = await db
      .from("path_hourly_stats")
      .select(PATH_STATS_COLUMNS.join(","))
      .gte("hour_utc", startIso)
      .lt("hour_utc", endIso)
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    if (error) throw new Error(`day page query failed: ${error.message}`);

    const page = (data ?? []) as unknown as PathStatsRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    lastId = Number(page[page.length - 1].id);
  }
}

async function fetchLiveDayCount(
  db: SupabaseClient,
  day: string,
): Promise<number> {
  const { count, error } = await db
    .from("path_hourly_stats")
    .select("id", { count: "exact", head: true })
    .gte("hour_utc", `${day}T00:00:00.000Z`)
    .lt("hour_utc", `${addDays(day, 1)}T00:00:00.000Z`);
  if (error) throw new Error(`day count query failed: ${error.message}`);
  return count ?? 0;
}

async function downloadManifest(
  db: SupabaseClient,
  day: string,
): Promise<DayManifest | null> {
  const { data, error } = await db.storage
    .from(BUCKET)
    .download(manifestObjectPath(day));
  if (error || !data) return null;
  return JSON.parse(await data.text()) as DayManifest;
}

async function downloadObjectBytes(
  bucket: ReturnType<SupabaseClient["storage"]["from"]>,
  objectPath: string,
  day: string,
): Promise<Uint8Array> {
  const { data, error } = await bucket.download(objectPath);
  if (error || !data) {
    throw new Error(
      `archive verification download failed for ${day}: ${error?.message ?? "empty body"}`,
    );
  }
  return new Uint8Array(await data.arrayBuffer());
}

/** Export one day's rows, upload, verify byte-for-byte, and seal a manifest. */
async function exportDay(
  db: SupabaseClient,
  day: string,
): Promise<DayManifest> {
  const rows = await fetchDayRows(db, day);
  const gz = gzipSync(Buffer.from(toCsv(rows), "utf8"));
  const sha256 = sha256Hex(gz);
  const objectPath = archiveObjectPath(day);
  const bucket = db.storage.from(BUCKET);

  // The bucket's allowed_mime_types is octet-stream/parquet/json/text only
  // (propagation-archives foundation migration); application/gzip is rejected.
  const uploadOpts = {
    contentType: "application/octet-stream",
    cacheControl: "31536000",
    upsert: false,
  };
  const { error: uploadError } = await bucket.upload(objectPath, gz, uploadOpts);
  const preExisting =
    uploadError?.message.toLowerCase().includes("already exists") ?? false;
  if (uploadError && !preExisting) {
    throw new Error(`archive upload failed for ${day}: ${uploadError.message}`);
  }

  // Verify what storage actually holds. A pre-existing object can only come
  // from an interrupted prior run (a sealed day never reaches exportDay), so
  // on mismatch it is safe to overwrite once and re-verify.
  let storedBytes = await downloadObjectBytes(bucket, objectPath, day);
  if (sha256Hex(storedBytes) !== sha256 && preExisting) {
    const { error: replaceError } = await bucket.upload(objectPath, gz, {
      ...uploadOpts,
      upsert: true,
    });
    if (replaceError) {
      throw new Error(
        `archive re-upload failed for ${day}: ${replaceError.message}`,
      );
    }
    storedBytes = await downloadObjectBytes(bucket, objectPath, day);
  }
  if (sha256Hex(storedBytes) !== sha256) {
    throw new Error(
      `archive SHA-256 mismatch for ${day} — stored object differs from export; not sealing`,
    );
  }
  const storedCsv = gunzipSync(Buffer.from(storedBytes)).toString("utf8");
  const storedRowCount = storedCsv.split("\n").length - 2; // header + trailing \n
  if (storedRowCount !== rows.length) {
    throw new Error(
      `archive row-count mismatch for ${day}: csv has ${storedRowCount}, exported ${rows.length}`,
    );
  }

  const manifest: DayManifest = {
    dataset: DATASET,
    schemaVersion: SCHEMA_VERSION,
    day,
    rowCount: rows.length,
    sha256,
    sizeBytes: gz.length,
    columns: PATH_STATS_COLUMNS,
    exportedAt: new Date().toISOString(),
  };
  const { error: manifestError } = await bucket.upload(
    manifestObjectPath(day),
    Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
    { contentType: "application/json", cacheControl: "3600", upsert: true },
  );
  if (manifestError) {
    throw new Error(`manifest upload failed for ${day}: ${manifestError.message}`);
  }
  return manifest;
}

async function pruneDay(
  db: SupabaseClient,
  manifest: DayManifest,
): Promise<number> {
  const live = await fetchLiveDayCount(db, manifest.day);
  if (live === 0) return 0; // already pruned
  const { data, error } = await db.rpc("prune_archived_path_hourly_stats", {
    p_day: manifest.day,
    p_expected_rows: manifest.rowCount,
  });
  if (error) {
    throw new Error(`prune refused for ${manifest.day}: ${error.message}`);
  }
  return Number(data ?? 0);
}

// ── Entry point ──────────────────────────────────────────────────────────────

export interface ArchivePassResult {
  daysArchived: number;
  daysPruned: number;
  rowsArchived: number;
  rowsPruned: number;
}

export async function runArchivePass(
  db: SupabaseClient,
  controls: PathArchiveControls,
  nowMs: number,
): Promise<ArchivePassResult> {
  const result: ArchivePassResult = {
    daysArchived: 0,
    daysPruned: 0,
    rowsArchived: 0,
    rowsPruned: 0,
  };

  const oldestDay = await fetchOldestDay(db);
  if (!oldestDay) return result;

  const days = archivableDays(oldestDay, nowMs, controls.hotDays);

  // Budget counts days that needed real work (an export and/or a prune).
  // Sealed days needing neither are skipped for free, so the pass always
  // advances to unexported days even when pruning is disabled and the
  // sealed backlog grows.
  let budget = controls.maxDaysPerRun;
  for (const day of days) {
    if (budget <= 0) break;
    let worked = false;

    let manifest = await downloadManifest(db, day);
    if (!manifest) {
      manifest = await exportDay(db, day);
      worked = true;
      result.daysArchived += 1;
      result.rowsArchived += manifest.rowCount;
      log("info", "Archived path_hourly_stats day", {
        day,
        rows: manifest.rowCount,
        bytes: manifest.sizeBytes,
      });
    }

    if (controls.pruneEnabled) {
      const deleted = await pruneDay(db, manifest);
      if (deleted > 0) {
        worked = true;
        result.daysPruned += 1;
        result.rowsPruned += deleted;
        log("info", "Pruned archived path_hourly_stats day", {
          day,
          rows: deleted,
        });
      }
    }

    if (worked) budget -= 1;
  }

  return result;
}

export async function archivePathStats(
  db: SupabaseClient,
  controls: PathArchiveControls,
): Promise<void> {
  const start = Date.now();
  try {
    const result = await runArchivePass(db, controls, start);
    const durationMs = Date.now() - start;
    reportHealth("path-archive", "ok", result.rowsArchived);
    await reportToDb(
      db,
      "path-archive",
      "ok",
      result.rowsArchived,
      durationMs,
    );
    if (result.daysArchived > 0 || result.daysPruned > 0) {
      log("info", "Path stats archive pass complete", { ...result, durationMs });
    }
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    reportHealth("path-archive", "error", 0);
    await reportToDb(db, "path-archive", "error", 0, durationMs, msg);
    log("error", "Path stats archive pass failed", { error: msg });
  }
}
