/**
 * DB size guard — periodic check that the Supabase database is not
 * over-accumulating.
 *
 * Calls the db_size_report() RPC (service_role only) and compares the total
 * database size against DB_SIZE_BUDGET_MB. Within budget it reports "ok"
 * like any other source; over budget it reports "over-budget", which stops
 * refreshing the source's last-success time, so /health flips to degraded
 * once the staleness window (2x poll interval) elapses and stays degraded
 * until the database is back under budget. The breach message, including
 * the top offending tables, is persisted to collector_status/collector_health
 * via reportToDb.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "../logger.js";
import { reportHealth } from "../health.js";
import { reportToDb } from "../lib/db-helpers.js";

export interface DbSizeTable {
  table_name: string;
  total_bytes: number;
  approx_rows: number;
}

export interface DbSizeReport {
  database_bytes: number;
  captured_at: string;
  tables: DbSizeTable[];
}

export interface DbSizeVerdict {
  ok: boolean;
  totalMb: number;
  budgetMb: number;
  message: string;
}

function mb(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

/** Pure budget evaluation — exported for tests. */
export function evaluateDbSize(
  report: DbSizeReport,
  budgetMb: number,
): DbSizeVerdict {
  const totalMb = mb(report.database_bytes);
  const top = report.tables
    .slice(0, 3)
    .map((t) => `${t.table_name}=${mb(t.total_bytes)}MB`)
    .join(", ");
  const ok = totalMb <= budgetMb;
  return {
    ok,
    totalMb,
    budgetMb,
    message: ok
      ? `db ${totalMb}MB within ${budgetMb}MB budget (top: ${top})`
      : `db ${totalMb}MB EXCEEDS ${budgetMb}MB budget (top: ${top})`,
  };
}

export async function checkDbSize(
  db: SupabaseClient,
  budgetMb: number,
): Promise<void> {
  const start = Date.now();
  try {
    const { data, error } = await db.rpc("db_size_report");
    if (error) {
      throw new Error(`db_size_report RPC failed: ${error.message}`);
    }

    const verdict = evaluateDbSize(data as DbSizeReport, budgetMb);
    const durationMs = Date.now() - start;

    if (verdict.ok) {
      reportHealth("db-size", "ok", verdict.totalMb);
      await reportToDb(db, "db-size", "ok", verdict.totalMb, durationMs);
      log("info", "DB size within budget", {
        totalMb: verdict.totalMb,
        budgetMb,
      });
    } else {
      // In-memory status is "over-budget" (anything but "ok" leaves
      // last-success unrefreshed, so /health degrades). The durable write
      // uses "warning" — the only over-budget-shaped status the DB accepts
      // (collector_health CHECK and record_collector_source_status both
      // allow only ok/error/warning).
      reportHealth("db-size", "over-budget", verdict.totalMb);
      await reportToDb(
        db,
        "db-size",
        "warning",
        verdict.totalMb,
        durationMs,
        verdict.message,
      );
      log("warn", "DB size over budget", { message: verdict.message });
    }
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    reportHealth("db-size", "error", 0);
    await reportToDb(db, "db-size", "error", 0, durationMs, msg);
    log("error", "DB size guard failed", { error: msg });
  }
}
