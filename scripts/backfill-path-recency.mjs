#!/usr/bin/env node
/**
 * backfill-path-recency — #297 (NowCast N2).
 *
 * Walks whole UTC hours and calls the service-role-only
 * `compute_path_recency_hourly` RPC once per hour, filling
 * `path_recency_hourly` from `path_hourly_stats`.
 *
 * One RPC call = one hour = one server-side statement, so nothing here goes
 * near PostgREST's 8 s statement timeout the way a paged client-side
 * aggregation would. The RPC is delete+insert per (hour, transform_version),
 * so re-running any range is safe and repairs late spots.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/backfill-path-recency.mjs --dry-run
 *   node scripts/backfill-path-recency.mjs --from 2026-07-16T00:00:00Z
 *   node scripts/backfill-path-recency.mjs --from 2026-08-01T00:00:00Z \
 *     --to 2026-08-08T00:00:00Z
 *
 * Resumable: on a failure it prints the exact --from to restart with. The
 * default range starts at the first hour path_hourly_stats covers.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const DEFAULT_FROM = "2026-07-16T00:00:00Z";
const DEFAULT_TRANSFORM_VERSION = "psk-rbn-field-recency-v2";
const HOUR_MS = 3_600_000;
const MAX_ATTEMPTS = 3;

function fail(message) {
  console.error(`[backfill-path-recency] ${message}`);
  process.exit(1);
}

function readEnvLocal() {
  const envPath = path.join(repoRoot, ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const parsed = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) parsed[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return parsed;
}

function flagValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function hourFloor(value, flag) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(`${flag} is not a valid date: ${value}`);
  return parsed - (parsed % HOUR_MS);
}

const dryRun = process.argv.includes("--dry-run");
const transformVersion = flagValue(
  "--transform-version",
  DEFAULT_TRANSFORM_VERSION,
);
const fromMs = hourFloor(flagValue("--from", DEFAULT_FROM), "--from");
// Default end: the last hour that has certainly finished. The RPC refuses an
// hour that is not complete yet, so never offer it one.
const lastCompleteHourMs = Date.now() - (Date.now() % HOUR_MS) - HOUR_MS;
const toMs = Math.min(
  hourFloor(
    flagValue("--to", new Date(lastCompleteHourMs).toISOString()),
    "--to",
  ),
  lastCompleteHourMs,
);

if (toMs < fromMs) {
  fail(
    `nothing to do: --from ${new Date(fromMs).toISOString()} is after ` +
      `--to ${new Date(toMs).toISOString()}`,
  );
}

const envLocal = readEnvLocal();
const supabaseUrl = (
  process.env.SUPABASE_URL ??
  envLocal.SUPABASE_URL ??
  ""
).replace(/\/$/, "");
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? envLocal.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  fail(
    "Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
      "(env or .env.local). The service-role key must never be a VITE_ variable.",
  );
}

const totalHours = Math.floor((toMs - fromMs) / HOUR_MS) + 1;
console.log(
  `[backfill-path-recency] ${totalHours} hour(s) ` +
    `${new Date(fromMs).toISOString()} .. ${new Date(toMs).toISOString()} ` +
    `transform=${transformVersion}${dryRun ? " (dry run)" : ""}`,
);

async function computeHour(hourISO) {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response;
    try {
      response = await fetch(
        `${supabaseUrl}/rest/v1/rpc/compute_path_recency_hourly`,
        {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_hour: hourISO,
            p_transform_version: transformVersion,
          }),
          signal: AbortSignal.timeout(60_000),
        },
      );
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      response = null;
    }
    if (response && response.ok) {
      const body = await response.text();
      const rows = Number(body);
      return Number.isFinite(rows) ? rows : 0;
    }
    if (response) {
      lastError = `HTTP ${response.status} ${await response.text()}`;
      // A 4xx other than 429 is a contract problem (bad argument, missing
      // grant, stale schema cache) — retrying cannot fix it.
      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 429
      ) {
        break;
      }
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
  throw new Error(lastError || "unknown failure");
}

const startedMs = Date.now();
let hoursDone = 0;
let rowsWritten = 0;
let emptyHours = 0;

for (let hourMs = fromMs; hourMs <= toMs; hourMs += HOUR_MS) {
  const hourISO = new Date(hourMs).toISOString();
  if (dryRun) {
    hoursDone += 1;
    continue;
  }
  let rows;
  try {
    rows = await computeHour(hourISO);
  } catch (error) {
    console.error(
      `[backfill-path-recency] ${hourISO} failed: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
    console.error(
      `[backfill-path-recency] resume with: node scripts/backfill-path-recency.mjs ` +
        `--from ${hourISO} --to ${new Date(toMs).toISOString()}`,
    );
    process.exit(1);
  }
  hoursDone += 1;
  rowsWritten += rows;
  if (rows === 0) emptyHours += 1;
  if (hoursDone % 24 === 0 || hourMs === toMs) {
    const elapsedS = Math.round((Date.now() - startedMs) / 1000);
    console.log(
      `[backfill-path-recency] ${hoursDone}/${totalHours} hours, ` +
        `${rowsWritten} rows, ${elapsedS}s elapsed (through ${hourISO})`,
    );
  }
}

const elapsedS = Math.round((Date.now() - startedMs) / 1000);
console.log(
  `[backfill-path-recency] done: ${hoursDone}/${totalHours} hours, ` +
    `${rowsWritten} rows written, ${emptyHours} empty hour(s), ${elapsedS}s` +
    `${dryRun ? " (dry run — no RPC calls made)" : ""}`,
);
