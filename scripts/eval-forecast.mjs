#!/usr/bin/env node
/**
 * eval-forecast — M4 F2 harness runner.
 *
 * Reads forecast_snapshots + band_hourly_stats through PostgREST (both are
 * public-read) and writes docs/reports/forecast-eval-YYYYMMDD.md. All the
 * scoring math lives in scripts/lib/forecast-eval-core.mjs.
 *
 *   npm run eval:forecast              # 90-day baseline, P25, min 5 spots
 *   node scripts/eval-forecast.mjs --baseline-days 60 --percentile 33
 *
 * Reports are only meaningful once snapshots have flowed for >=14 days
 * (M4 plan F1 gate); the script says so and exits cleanly before then.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateForecasts,
  longestCoverageStreakDays,
  renderReport,
} from "./lib/forecast-eval-core.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`[eval-forecast] ${message}`);
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

function argValue(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  const value = Number(process.argv[idx + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const baselineDays = argValue("--baseline-days", 90);
const percentile = argValue("--percentile", 25);
const minSpots = argValue("--min-spots", 5);

// Out-of-range values would silently corrupt the metrics (e.g. a percentile
// above 100 makes every threshold NaN, labelling every outcome closed).
if (baselineDays <= 0) fail(`--baseline-days must be positive (got ${baselineDays})`);
if (percentile <= 0 || percentile > 100) {
  fail(`--percentile must be in (0, 100] (got ${percentile})`);
}
if (minSpots < 0) fail(`--min-spots must be >= 0 (got ${minSpots})`);

const envLocal = readEnvLocal();
const supabaseUrl = (
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  envLocal.VITE_SUPABASE_URL ??
  ""
).replace(/\/$/, "");
const anonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  envLocal.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  fail(
    "Supabase not configured — set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (env or .env.local)",
  );
}

const PAGE_SIZE = 1000;

async function fetchAll(table, select, sinceIso) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url =
      `${supabaseUrl}/rest/v1/${table}?select=${select}` +
      `&hour_utc=gte.${encodeURIComponent(sinceIso)}` +
      `&order=hour_utc.asc,id.asc&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      fail(`${table} fetch failed: HTTP ${res.status} ${await res.text()}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

const nowMs = Date.now();
const sinceIso = new Date(nowMs - baselineDays * 86_400_000).toISOString();

console.log(
  `[eval-forecast] baseline ${baselineDays}d (since ${sinceIso}), P${percentile}, minSpots ${minSpots}`,
);

const [snapshots, truth] = await Promise.all([
  fetchAll(
    "forecast_snapshots",
    "hour_utc,band,source,horizon_hours,p_open",
    sinceIso,
  ),
  fetchAll("band_hourly_stats", "hour_utc,band,spot_count", sinceIso),
]);

console.log(
  `[eval-forecast] ${snapshots.length} snapshot rows, ${truth.length} truth rows`,
);

if (snapshots.length === 0) {
  console.log(
    "[eval-forecast] No forecast snapshots yet — nothing to evaluate. " +
      "Snapshots start flowing when the collector's forecast-snapshot job is deployed.",
  );
  process.exit(0);
}

const snapshotHourSet = new Set(snapshots.map((s) => s.hour_utc));
// The F1 gate reads "14 consecutive days": require an unbroken run of UTC
// days with near-full coverage, so sparse snapshots after collector outages
// cannot pass as evidence.
const streakDays = longestCoverageStreakDays(snapshotHourSet);
if (streakDays < 14) {
  console.warn(
    `[eval-forecast] WARNING: longest consecutive-day snapshot streak is ${streakDays}d ` +
      "(days with >=20/24 hours) — below the 14-day gate; treat this report " +
      "as a harness smoke test, not evidence.",
  );
}

const results = evaluateForecasts({
  snapshots,
  truth,
  percentile,
  minSpots,
  nowMs,
});

const generatedAt = new Date(nowMs).toISOString();
const report = renderReport(results, {
  generatedAt,
  snapshotHours: snapshotHourSet.size,
  truthHours: new Set(truth.map((t) => t.hour_utc)).size,
  baselineDays,
});

const outDir = path.join(repoRoot, "docs", "reports");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(
  outDir,
  `forecast-eval-${generatedAt.slice(0, 10).replaceAll("-", "")}.md`,
);
fs.writeFileSync(outPath, report + "\n");
console.log(`[eval-forecast] wrote ${path.relative(repoRoot, outPath)}`);
