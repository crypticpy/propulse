/**
 * Contest Confirmation Tracker
 *
 * Tracks QSL confirmation rates for contest QSOs across all services
 * (LoTW, eQSL, QRZ, paper card). Provides both aggregate rates and
 * daily confirmation growth timelines for post-contest analytics.
 */

import type { LogEntry } from "@/lib/db/types";
import { getAllLogEntries } from "@/lib/db/logStore";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ConfirmationRate {
  /** Total contest QSOs */
  total: number;
  /** Confirmed via LoTW */
  lotwConfirmed: number;
  /** Confirmed via eQSL */
  eqslConfirmed: number;
  /** Confirmed via QRZ.com */
  qrzConfirmed: number;
  /** Confirmed via physical QSL card */
  cardConfirmed: number;
  /** QSOs with no confirmation from any service */
  unconfirmed: number;
}

export interface ConfirmationTimelineEntry {
  /** Date in ISO format (YYYY-MM-DD) */
  date: string;
  /** Cumulative number of confirmed QSOs as of this date */
  confirmed: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get entries for a specific contest session from the logbook */
async function getContestEntries(contestId: string): Promise<LogEntry[]> {
  const allEntries = await getAllLogEntries();
  return allEntries.filter((e) => e.contestId === contestId);
}

/** Check if an entry has any form of QSL confirmation */
function isAnyConfirmed(entry: LogEntry): boolean {
  return (
    entry.lotw === true ||
    entry.eqsl === true ||
    entry.qslRcvd === "Y" ||
    entry.qrzcomStatus === "confirmed"
  );
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the QSL confirmation rate for a contest session.
 *
 * Queries all log entries tagged with the given contestId and
 * tallies confirmations by service type.
 *
 * @param contestId - Contest session ID (matches LogEntry.contestId)
 * @returns Confirmation rate breakdown
 */
export async function getContestConfirmationRate(
  contestId: string,
): Promise<ConfirmationRate> {
  const entries = await getContestEntries(contestId);

  let lotwConfirmed = 0;
  let eqslConfirmed = 0;
  let qrzConfirmed = 0;
  let cardConfirmed = 0;
  let unconfirmed = 0;

  for (const entry of entries) {
    if (entry.lotw === true) lotwConfirmed++;
    if (entry.eqsl === true) eqslConfirmed++;
    if (entry.qrzcomStatus === "confirmed") qrzConfirmed++;
    if (entry.qslRcvd === "Y") cardConfirmed++;

    if (!isAnyConfirmed(entry)) {
      unconfirmed++;
    }
  }

  return {
    total: entries.length,
    lotwConfirmed,
    eqslConfirmed,
    qrzConfirmed,
    cardConfirmed,
    unconfirmed,
  };
}

/**
 * Get a daily confirmation timeline for a contest session.
 *
 * Builds a cumulative timeline showing how confirmations accumulated
 * over time, based on the updatedAt timestamps of confirmed entries.
 * Useful for visualizing QSL confirmation velocity.
 *
 * @param contestId - Contest session ID (matches LogEntry.contestId)
 * @returns Array of date/confirmed pairs, sorted chronologically
 */
export async function getConfirmationTimeline(
  contestId: string,
): Promise<ConfirmationTimelineEntry[]> {
  const entries = await getContestEntries(contestId);

  // Collect confirmation dates from entries that have been confirmed
  const confirmationDates: string[] = [];

  for (const entry of entries) {
    if (isAnyConfirmed(entry)) {
      // Use updatedAt as best approximation of when confirmation arrived
      const date = entry.updatedAt.slice(0, 10);
      confirmationDates.push(date);
    }
  }

  if (confirmationDates.length === 0) {
    return [];
  }

  // Sort dates and build cumulative counts
  confirmationDates.sort();

  const dailyCounts = new Map<string, number>();
  for (const date of confirmationDates) {
    dailyCounts.set(date, (dailyCounts.get(date) ?? 0) + 1);
  }

  // Build cumulative timeline
  const timeline: ConfirmationTimelineEntry[] = [];
  let cumulative = 0;
  const sortedDates = [...dailyCounts.keys()].sort();

  for (const date of sortedDates) {
    cumulative += dailyCounts.get(date) ?? 0;
    timeline.push({ date, confirmed: cumulative });
  }

  return timeline;
}
