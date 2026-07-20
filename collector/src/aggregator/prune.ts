import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectorConfig } from "../types.js";
import { log } from "../logger.js";

let lastPruneDate: string | null = null;

/**
 * Run fail-closed retention maintenance once per day.
 *
 * Historical rows are never deleted directly from the collector. The
 * database RPC requires the environment switch, a separately enabled
 * database control, a sealed manifest covering the complete range, an
 * elapsed hot window, and a passing restore gate. It also bounds every
 * delete batch to protect the high-write database.
 */
export async function pruneOldData(
  db: SupabaseClient,
  config: CollectorConfig,
  now: Date = new Date(),
): Promise<void> {
  const today = now.toISOString().slice(0, 10);
  if (lastPruneDate === today) return;

  if (!config.archive.pruningEnabled) {
    lastPruneDate = today;
    log("info", "Retention maintenance skipped", {
      reason: "ARCHIVE_PRUNING_ENABLED is false",
    });
    return;
  }

  const startedAt = Date.now();
  try {
    const { data: retention, error } = await db.rpc(
      "run_propagation_retention_maintenance",
      {
        p_archive_pruning_enabled: true,
        p_batch_size: config.archive.pruneBatchSize,
        p_now: now.toISOString(),
      },
    );
    if (error) {
      const failure = new Error(
        `retention maintenance RPC failed: ${error.message}`,
      ) as Error & {
        postgresCode?: string;
        details?: string;
        hint?: string;
      };
      failure.postgresCode = error.code;
      failure.details = error.details;
      failure.hint = error.hint;
      throw failure;
    }
    let forecastCompaction: unknown = null;
    if (config.archive.forecastCompactionEnabled) {
      const { data, error: compactionError } = await db.rpc(
        "run_propagation_forecast_payload_compaction",
        {
          p_archive_forecast_compaction_enabled: true,
          p_batch_size: Math.min(config.archive.pruneBatchSize, 10_000),
          p_now: now.toISOString(),
        },
      );
      if (compactionError) {
        const failure = new Error(
          `forecast compaction RPC failed: ${compactionError.message}`,
        ) as Error & {
          postgresCode?: string;
          details?: string;
          hint?: string;
        };
        failure.postgresCode = compactionError.code;
        failure.details = compactionError.details;
        failure.hint = compactionError.hint;
        throw failure;
      }
      forecastCompaction = data;
    }

    lastPruneDate = today;
    log("info", "Retention maintenance complete", {
      result: { retention, forecastCompaction },
      batchSize: config.archive.pruneBatchSize,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const failure = err as Error & {
      postgresCode?: string;
      details?: string;
      hint?: string;
    };
    log("error", "Retention maintenance failed", {
      error: err instanceof Error ? err.message : String(err),
      postgresCode: failure.postgresCode ?? null,
      details: failure.details ?? null,
      hint: failure.hint ?? null,
      durationMs: Date.now() - startedAt,
    });
    throw err;
  }
}
