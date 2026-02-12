/**
 * Field-level conflict detection and auto-merge for QSO log entries.
 *
 * When the same QSO is edited on multiple devices while offline,
 * we need to detect which fields actually conflict vs. which can
 * be auto-merged (additive/non-conflicting metadata).
 *
 * Strategy:
 * - CONFLICT_FIELDS: core QSO data that requires user resolution if different
 * - AUTO_MERGE_FIELDS: confirmations, lookups, statuses — prefer non-null/confirmed
 * - Version: always take the higher version number
 */

import type { LogEntry } from "@/lib/db/types";

/** Fields that participate in conflict detection */
const CONFLICT_FIELDS: (keyof LogEntry)[] = [
  "callsign",
  "frequency",
  "mode",
  "band",
  "date",
  "timeOn",
  "timeOff",
  "rstSent",
  "rstRcvd",
  "grid",
  "name",
  "qth",
  "notes",
  "txPower",
  "myGrid",
  "propMode",
  "mySig",
  "mySigInfo",
  "sig",
  "sigInfo",
  "contestId",
  "srx",
  "stx",
];

/** Fields that can be auto-merged (additive/non-conflicting) */
const AUTO_MERGE_FIELDS: (keyof LogEntry)[] = [
  "qslSent",
  "qslRcvd",
  "lotw",
  "eqsl",
  "lotwQslSent",
  "lotwQslRcvd",
  "clublogStatus",
  "qrzcomStatus",
  "country",
  "dxcc",
  "cqZone",
  "ituZone",
  "continent",
];

/**
 * Detect which fields conflict between local and remote versions.
 * Returns an array of field names that differ (excluding auto-merge fields).
 */
export function detectFieldConflicts(
  local: LogEntry,
  remote: LogEntry,
): string[] {
  const conflicts: string[] = [];

  for (const field of CONFLICT_FIELDS) {
    const localVal = local[field];
    const remoteVal = remote[field];

    // Skip if both are null/undefined
    if (localVal == null && remoteVal == null) continue;
    if (localVal === "" && remoteVal === "") continue;

    // Skip if they're the same (handle 0, false, empty string correctly)
    if (localVal === remoteVal) continue;
    if (String(localVal) === String(remoteVal)) continue;

    // This field differs — it's a real conflict
    conflicts.push(field as string);
  }

  return conflicts;
}

/** QSL confirmation status ranking: higher value = more confirmed */
const QSL_RANK: Record<string, number> = { N: 0, R: 1, I: 2, Y: 3 };

/** Fields that use QSL confirmation ranking */
const QSL_STATUS_FIELDS = new Set([
  "qslSent",
  "qslRcvd",
  "lotwQslSent",
  "lotwQslRcvd",
]);

/**
 * Auto-merge non-conflicting fields from remote into local.
 * For auto-merge fields: prefer non-null/confirmed values.
 * For QSL status fields: prefer the higher confirmation level (N < R < I < Y).
 * For boolean fields (lotw, eqsl): prefer true over false.
 * Takes the higher version number.
 */
export function autoMerge(local: LogEntry, remote: LogEntry): LogEntry {
  const merged = { ...local };

  for (const field of AUTO_MERGE_FIELDS) {
    const localVal = local[field];
    const remoteVal = remote[field];

    // If local has no value, take remote
    if (localVal == null && remoteVal != null) {
      (merged as Record<string, unknown>)[field] = remoteVal;
      continue;
    }

    // Both have values — apply type-aware merge
    if (localVal != null && remoteVal != null && localVal !== remoteVal) {
      // Boolean fields: prefer true
      if (typeof localVal === "boolean" && typeof remoteVal === "boolean") {
        if (remoteVal && !localVal) {
          (merged as Record<string, unknown>)[field] = true;
        }
        continue;
      }

      // QSL status fields: prefer higher confirmation level
      if (
        QSL_STATUS_FIELDS.has(field) &&
        typeof localVal === "string" &&
        typeof remoteVal === "string"
      ) {
        const localRank = QSL_RANK[localVal] ?? -1;
        const remoteRank = QSL_RANK[remoteVal] ?? -1;
        if (remoteRank > localRank) {
          (merged as Record<string, unknown>)[field] = remoteVal;
        }
        continue;
      }

      // Other fields (country, dxcc, zones, continent): prefer non-null remote
      // Local already has a value, so keep it (local-wins for ties)
    }
  }

  // Take the higher version number
  merged.version = Math.max(local.version ?? 0, remote.version ?? 0);
  merged.updatedAt = new Date().toISOString();

  return merged;
}
