import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectorConfig } from "../types.js";
import { log } from "../logger.js";

let lastPruneDate: string | null = null;

interface RpcError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

type RpcFailure = Error & {
  postgresCode?: string;
  details?: string;
  hint?: string;
};

function toRpcFailure(prefix: string, error: RpcError): RpcFailure {
  const failure = new Error(`${prefix}: ${error.message}`) as RpcFailure;
  failure.postgresCode = error.code;
  failure.details = error.details;
  failure.hint = error.hint;
  return failure;
}

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

  if (
    !config.archive.pruningEnabled
    && !config.archive.forecastCompactionEnabled
  ) {
    lastPruneDate = today;
    log("info", "Retention maintenance skipped", {
      reason:
        "ARCHIVE_PRUNING_ENABLED and ARCHIVE_FORECAST_COMPACTION_ENABLED are false",
    });
    return;
  }

  const startedAt = Date.now();
  try {
    let retention: unknown = null;
    if (config.archive.pruningEnabled) {
      const { data, error } = await db.rpc(
        "run_propagation_retention_maintenance",
        {
          p_archive_pruning_enabled: true,
          p_batch_size: config.archive.pruneBatchSize,
          p_now: now.toISOString(),
        },
      );
      if (error) {
        throw toRpcFailure("retention maintenance RPC failed", error);
      }
      retention = data;
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
        throw toRpcFailure("forecast compaction RPC failed", compactionError);
      }
      forecastCompaction = data;
    }

    lastPruneDate = today;
    log("info", "Archive maintenance complete", {
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
