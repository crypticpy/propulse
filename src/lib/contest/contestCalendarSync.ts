/**
 * Contest Calendar Sync
 *
 * Optional Supabase overlay for remote calendar updates. The static
 * calendar dataset (contestCalendar.ts) is always the baseline; remote
 * entries from Supabase are merged on top, with remote winning on
 * conflict (matched by `id`).
 *
 * Currently stubbed — `fetchRemoteCalendar()` returns an empty array.
 * When the Supabase table `contest_calendar` is created, this module
 * will query it and merge the results.
 *
 * @module lib/contest/contestCalendarSync
 */

import type { ContestCalendarEntry } from "./contestCalendarTypes";

// ---------------------------------------------------------------------------
// Remote Fetch (stub)
// ---------------------------------------------------------------------------

/**
 * Fetch updated contest calendar entries from Supabase.
 *
 * Returns an empty array until the remote table is provisioned.
 * When implemented, this will query:
 *   `supabase.from("contest_calendar").select("*")`
 *
 * @returns Promise resolving to an array of remote calendar entries
 */
export async function fetchRemoteCalendar(): Promise<ContestCalendarEntry[]> {
  // TODO: Wire to Supabase when `contest_calendar` table exists
  //
  // try {
  //   const { getSupabase, isSupabaseConfigured } = await import("@/lib/supabase");
  //   if (!isSupabaseConfigured()) return [];
  //   const sb = getSupabase();
  //   const { data, error } = await sb
  //     .from("contest_calendar")
  //     .select("*")
  //     .gte("end_utc", new Date().toISOString());
  //   if (error || !data) return [];
  //   return data.map(mapRowToEntry);
  // } catch {
  //   return [];
  // }

  return [];
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
