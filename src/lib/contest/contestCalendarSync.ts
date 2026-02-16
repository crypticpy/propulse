/**
 * Contest Calendar Sync
 *
 * Optional Supabase overlay for remote calendar updates. The static
 * calendar dataset (contestCalendar.ts) is always the baseline; remote
 * entries from Supabase are merged on top, with remote winning on
 * conflict (matched by `id`).
 *
 * @module lib/contest/contestCalendarSync
 */

import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { ContestCalendarEntry } from "./contestCalendarTypes";

// ---------------------------------------------------------------------------
// Remote Fetch
// ---------------------------------------------------------------------------

type ContestDifficulty = ContestCalendarEntry["difficulty"];
const VALID_DIFFICULTIES: ContestDifficulty[] = [
  "beginner",
  "intermediate",
  "advanced",
];

interface ContestCalendarQueryClient {
  from: (table: string) => {
    select: (
      columns: string,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

function getStringField(
  row: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function getBooleanField(
  row: Record<string, unknown>,
  keys: string[],
): boolean | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function getNumberField(
  row: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function getStringArrayField(
  row: Record<string, unknown>,
  keys: string[],
): string[] | undefined {
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) {
      const strings = value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      if (strings.length > 0) return strings;
    }
  }
  return undefined;
}

function toContestCalendarEntry(
  row: Record<string, unknown>,
): ContestCalendarEntry | null {
  const id = getStringField(row, ["id"]);
  const name = getStringField(row, ["name"]);
  const sponsor = getStringField(row, ["sponsor"]);
  const startUtc = getStringField(row, ["start_utc", "startUtc"]);
  const endUtc = getStringField(row, ["end_utc", "endUtc"]);
  const bands = getStringArrayField(row, ["bands"]);
  const modes = getStringArrayField(row, ["modes"]);
  const exchange = getStringField(row, ["exchange"]);
  const description = getStringField(row, ["description"]);
  const difficultyRaw = getStringField(row, ["difficulty"]);
  const estimatedParticipants = getNumberField(row, [
    "estimated_participants",
    "estimatedParticipants",
  ]);
  const tags = getStringArrayField(row, ["tags"]);
  const warcExempt =
    getBooleanField(row, ["warc_exempt", "warcExempt"]) ?? false;
  const rulesUrl = getStringField(row, ["rules_url", "rulesUrl"]);
  const definitionId = getStringField(row, ["definition_id", "definitionId"]);

  const difficulty = VALID_DIFFICULTIES.find((d) => d === difficultyRaw);

  if (
    !id ||
    !name ||
    !sponsor ||
    !startUtc ||
    !endUtc ||
    !bands ||
    !modes ||
    !exchange ||
    !description ||
    !difficulty ||
    estimatedParticipants === undefined ||
    !tags
  ) {
    return null;
  }

  if (
    Number.isNaN(new Date(startUtc).getTime()) ||
    Number.isNaN(new Date(endUtc).getTime())
  ) {
    return null;
  }

  return {
    id,
    name,
    sponsor,
    startUtc,
    endUtc,
    bands,
    modes,
    exchange,
    description,
    difficulty,
    estimatedParticipants,
    tags,
    warcExempt,
    rulesUrl,
    definitionId,
  };
}

/**
 * Fetch updated contest calendar entries from Supabase.
 *
 * @returns Promise resolving to an array of remote calendar entries
 */
export async function fetchRemoteCalendar(): Promise<ContestCalendarEntry[]> {
  if (!isSupabaseConfigured) return [];

  const supabase = getSupabase();
  const queryClient = supabase as unknown as ContestCalendarQueryClient;
  const { data, error } = await queryClient
    .from("contest_calendar")
    .select("*");

  if (error) {
    throw new Error(`contest_calendar query failed: ${error.message}`);
  }

  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }

  const nowMs = Date.now();
  const remoteEntries = data
    .filter((row): row is Record<string, unknown> => {
      return typeof row === "object" && row !== null;
    })
    .map(toContestCalendarEntry)
    .filter((entry): entry is ContestCalendarEntry => entry !== null)
    .filter((entry) => new Date(entry.endUtc).getTime() >= nowMs)
    .sort((a, b) => {
      return new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime();
    });

  return remoteEntries;
}

// ---------------------------------------------------------------------------
// Merge Logic
// ---------------------------------------------------------------------------

/**
 * Merge remote calendar entries into a base (static) list.
 *
 * - If a remote entry has the same `id` as a static entry, the remote
 *   entry replaces the static one (remote wins on conflict).
 * - Remote entries with new IDs are appended.
 * - The result is sorted by `startUtc` ascending.
 *
 * @param base     Static calendar entries (the baseline)
 * @param remote   Remote entries fetched from Supabase
 * @returns Merged array sorted by start time
 */
export function mergeCalendars(
  base: ContestCalendarEntry[],
  remote: ContestCalendarEntry[],
): ContestCalendarEntry[] {
  if (remote.length === 0) return base;

  const remoteById = new Map<string, ContestCalendarEntry>();
  for (const entry of remote) {
    remoteById.set(entry.id, entry);
  }

  // Replace matching entries, keep non-matching base entries
  const merged: ContestCalendarEntry[] = [];
  const usedRemoteIds = new Set<string>();

  for (const entry of base) {
    const remoteOverride = remoteById.get(entry.id);
    if (remoteOverride) {
      merged.push(remoteOverride);
      usedRemoteIds.add(entry.id);
    } else {
      merged.push(entry);
    }
  }

  // Append any remote entries that didn't override a base entry
  for (const entry of remote) {
    if (!usedRemoteIds.has(entry.id)) {
      merged.push(entry);
    }
  }

  // Sort by start time
  merged.sort(
    (a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime(),
  );

  return merged;
}
