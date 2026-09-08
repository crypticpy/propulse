const HOUR_MS = 3_600_000;

/** Must match the database-owned spot_history_two_hour_window job. */
export const RAW_SPOT_RETENTION_MS = 2 * HOUR_MS;

/** The database wrapper serializes aggregation with pruning using an xact lock. */
export const AGGREGATION_SAFETY_MARGIN_MS = 0;

/** A two-hour raw window can contain at most two complete UTC hours. */
export const MAX_RECOVERY_HOURS = Math.ceil(RAW_SPOT_RETENTION_MS / HOUR_MS);

export interface ExpiredMissingRange {
  count: number;
  from: string | null;
  to: string | null;
}

export interface RecoveryWindow {
  hoursToProcess: Date[];
  expiredMissing: ExpiredMissingRange;
}

function hourMs(value: Date | string, label: string): number {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`${label} must be a valid timestamp`);
  if (ms % HOUR_MS !== 0) throw new Error(`${label} must be UTC-hour aligned`);
  return ms;
}

function isRetained(hourStartMs: number, nowMs: number): boolean {
  return (
    nowMs + AGGREGATION_SAFETY_MARGIN_MS
    < hourStartMs + RAW_SPOT_RETENTION_MS
  );
}

/**
 * Refuse to start an RPC once any row in its source hour can reach the raw
 * deletion cutoff when the call begins. This is a scheduling optimization;
 * the database wrapper's shared transaction lock is the authoritative race
 * guard. Neither check proves that upstream collectors delivered every row.
 */
export function assertRetainedHour(hour: Date, now = new Date()): void {
  const hourStartMs = hourMs(hour, "hour");
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error("now must be a valid timestamp");
  if (hourStartMs + HOUR_MS > nowMs) {
    throw new Error(`source hour ${hour.toISOString()} is not complete`);
  }
  if (!isRetained(hourStartMs, nowMs)) {
    throw new Error(`source hour ${hour.toISOString()} is outside the retained raw window`);
  }
}

/**
 * Plan bounded recovery from the database watermark through the latest
 * settled hour. The last completed hour is replayed while it remains wholly
 * retained so late arrivals can be absorbed by the idempotent aggregate RPCs.
 */
export function planRecoveryWindow(
  now: Date,
  latestSettledHour: Date,
  lastWatermark: string | null,
): RecoveryWindow {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error("now must be a valid timestamp");
  const latestMs = hourMs(latestSettledHour, "latest settled hour");
  if (latestMs + HOUR_MS > nowMs) {
    throw new Error("latest settled hour must be complete");
  }

  let watermarkMs: number | null = null;
  if (lastWatermark !== null) {
    watermarkMs = hourMs(lastWatermark, "last watermark");
    if (watermarkMs > latestMs) {
      throw new Error("last watermark is ahead of the latest settled hour");
    }
  }

  const firstMissingMs = watermarkMs === null ? null : watermarkMs + HOUR_MS;
  let firstRetainedMissingMs: number | null = null;
  if (firstMissingMs !== null && firstMissingMs <= latestMs) {
    const cutoff = nowMs + AGGREGATION_SAFETY_MARGIN_MS - RAW_SPOT_RETENTION_MS;
    firstRetainedMissingMs = Math.max(
      firstMissingMs,
      Math.floor(cutoff / HOUR_MS) * HOUR_MS + HOUR_MS,
    );
    if (firstRetainedMissingMs > latestMs) firstRetainedMissingMs = null;
  }

  const expiredEndMs = firstMissingMs === null
    ? null
    : Math.min(latestMs, (firstRetainedMissingMs ?? latestMs + HOUR_MS) - HOUR_MS);
  const expiredCount = firstMissingMs !== null
    && expiredEndMs !== null
    && expiredEndMs >= firstMissingMs
    ? Math.floor((expiredEndMs - firstMissingMs) / HOUR_MS) + 1
    : 0;

  const candidates = new Set<number>();
  if (watermarkMs !== null && isRetained(watermarkMs, nowMs)) {
    candidates.add(watermarkMs);
  }
  const startMs = watermarkMs === null
    ? Math.max(
        latestMs - (MAX_RECOVERY_HOURS - 1) * HOUR_MS,
        Math.floor(
          (nowMs + AGGREGATION_SAFETY_MARGIN_MS - RAW_SPOT_RETENTION_MS)
            / HOUR_MS,
        ) * HOUR_MS + HOUR_MS,
      )
    : firstRetainedMissingMs;
  if (startMs !== null) {
    for (let ms = startMs; ms <= latestMs; ms += HOUR_MS) {
      if (isRetained(ms, nowMs)) candidates.add(ms);
    }
  }

  const hoursToProcess = [...candidates]
    .sort((a, b) => a - b)
    .slice(-MAX_RECOVERY_HOURS)
    .map((ms) => new Date(ms));

  return {
    hoursToProcess,
    expiredMissing: {
      count: expiredCount,
      from: expiredCount > 0 ? new Date(firstMissingMs!).toISOString() : null,
      to: expiredCount > 0 ? new Date(expiredEndMs!).toISOString() : null,
    },
  };
}
