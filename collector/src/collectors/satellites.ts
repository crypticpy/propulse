import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "../logger.js";
import { reportHealth } from "../health.js";
import { reportToDb } from "../lib/db-helpers.js";

// ---------------------------------------------------------------------------
// Celestrak TLE groups to fetch
// ---------------------------------------------------------------------------

const TLE_GROUPS = [
  "amateur",
  "stations",
  "weather",
  "noaa",
  "cubesat",
  "education",
  "engineering",
  "science",
  "tle-new",
] as const;

const BATCH_SIZE = 500;
const USER_AGENT = "Propulse-Collector/1.0 (satellite-tle)";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TleRow {
  norad_id: number;
  satellite_name: string;
  tle_line1: string;
  tle_line2: string;
  tle_group: string;
  tle_epoch: string;
  collected_at: string;
}

// ---------------------------------------------------------------------------
// TLE epoch parser: line1 cols 19-32 → "YYDDD.DDDDDDDD"
// ---------------------------------------------------------------------------

function parseTleEpoch(line1: string): Date {
  const epochStr = line1.substring(18, 32).trim();
  const year2 = parseInt(epochStr.substring(0, 2), 10);
  const dayFrac = parseFloat(epochStr.substring(2));

  // Two-digit year: 57-99 → 1957-1999, 00-56 → 2000-2056
  const year = year2 >= 57 ? 1900 + year2 : 2000 + year2;

  // Day-of-year is 1-based fractional
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const epochMs = jan1.getTime() + (dayFrac - 1) * 86_400_000;
  return new Date(epochMs);
}

// ---------------------------------------------------------------------------
// Parse three-line TLE text into rows
// ---------------------------------------------------------------------------

function parseTleText(text: string, group: string, nowIso: string): TleRow[] {
  const lines = text.split("\n").map((l) => l.trimEnd());
  const rows: TleRow[] = [];

  // Three-line format: name / line1 / line2 repeating
  let i = 0;
  while (i + 2 < lines.length) {
    const nameLine = lines[i].trim();
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    // Validate TLE structure: line1 starts with "1 ", line2 starts with "2 "
    if (!line1?.startsWith("1 ") || !line2?.startsWith("2 ")) {
      i++;
      continue;
    }

    // NORAD catalog ID from line2, columns 3-7 (1-indexed)
    const noradId = parseInt(line2.substring(2, 7).trim(), 10);
    if (isNaN(noradId)) {
      i += 3;
      continue;
    }

    let epochDate: Date;
    try {
      epochDate = parseTleEpoch(line1);
    } catch {
      i += 3;
      continue;
    }

    rows.push({
      norad_id: noradId,
      satellite_name: nameLine,
      tle_line1: line1,
      tle_line2: line2,
      tle_group: group,
      tle_epoch: epochDate.toISOString(),
      collected_at: nowIso,
    });

    i += 3;
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Fetch a single TLE group
// ---------------------------------------------------------------------------

async function fetchTleGroup(group: string): Promise<string> {
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Main collector
// ---------------------------------------------------------------------------

export async function collectSatellites(db: SupabaseClient): Promise<void> {
  const start = Date.now();
  const nowIso = new Date().toISOString();

  try {
    // Fetch all groups in parallel
    const results = await Promise.allSettled(
      TLE_GROUPS.map((group) =>
        fetchTleGroup(group).then((text) => ({
          group,
          rows: parseTleText(text, group, nowIso),
        })),
      ),
    );

    const allRows: TleRow[] = [];
    const failedGroups: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const group = TLE_GROUPS[i];
      if (result.status === "fulfilled") {
        allRows.push(...result.value.rows);
      } else {
        failedGroups.push(group);
        log("warn", `TLE group '${group}' failed`, {
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
      }
    }

    // Total failure — none succeeded
    if (allRows.length === 0) {
      throw new Error(`All TLE groups failed: ${failedGroups.join(", ")}`);
    }

    // Batch upsert in chunks of 500
    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
      const chunk = allRows.slice(i, i + BATCH_SIZE);
      const { error } = await db
        .from("satellite_tle")
        .upsert(chunk, { onConflict: "norad_id,tle_group" });
      if (error) {
        throw new Error(
          `TLE upsert failed at batch ${Math.floor(i / BATCH_SIZE)}: ${error.message}`,
        );
      }
    }

    const durationMs = Date.now() - start;
    const status = failedGroups.length > 0 ? "warning" : "ok";

    reportHealth("satellites", status, allRows.length);
    await reportToDb(
      db,
      "satellites",
      status,
      allRows.length,
      durationMs,
      failedGroups.length > 0
        ? `Failed groups: ${failedGroups.join(", ")}`
        : undefined,
    );

    log("info", "Satellite TLE collection complete", {
      totalSatellites: allRows.length,
      groupsOk: TLE_GROUPS.length - failedGroups.length,
      groupsFailed: failedGroups.length,
      failedGroups: failedGroups.length > 0 ? failedGroups : undefined,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    reportHealth("satellites", "error", 0);
    await reportToDb(db, "satellites", "error", 0, durationMs, msg);
    log("error", "Satellite TLE collection failed", { error: msg });
  }
}
