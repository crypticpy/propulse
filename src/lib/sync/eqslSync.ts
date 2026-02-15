/**
 * eQSL Sync Module
 *
 * Upload: Generates ADIF from selected QSOs and uploads to eQSL.cc via proxy.
 * Download: Fetches inbox confirmations from eQSL.cc via proxy, parses ADIF.
 * Matching: Matches inbox confirmations against local log entries.
 *
 * Matching strategy:
 *   1. Exact: callsign + band + mode + date
 *   2. Fuzzy: callsign + band + mode + date within +/-1 day (UTC edge cases)
 */

import type { LogEntry } from "@/lib/db/types";
import { getCredential, isUnlocked } from "@/lib/db/credentialStore";
import { getAllLogEntries } from "@/lib/db/logStore";
import { exportADIF } from "@/lib/adif/export";
import { importADIF } from "@/lib/adif/import";

// -- Types ------------------------------------------------------------------

export interface EqslUploadResult {
  /** Whether the upload completed successfully */
  success: boolean;
  /** Number of QSOs included in the upload */
  qsoCount: number;
  /** Number of records the server accepted (if available) */
  recordsUploaded?: number;
  /** Human-readable status message */
  message: string;
}

export interface EqslInboxResult {
  /** Whether the inbox download completed successfully */
  success: boolean;
  /** Parsed confirmations from the inbox */
  confirmations: EqslConfirmation[];
  /** Human-readable status message */
  message: string;
}

export interface EqslConfirmation {
  callsign: string;
  band: string;
  mode: string;
  date: string;
  timeOn: string;
  /** eQSL QSL received flag */
  eqslQslRcvd: string;
}

export interface MatchResult {
  /** QSL status updates to apply to local entries */
  updates: QslUpdate[];
  /** Number of local QSOs that were matched and updated */
  matchedCount: number;
  /** Number of confirmations that could not be matched locally */
  unmatchedCount: number;
}

export interface QslUpdate {
  id: string;
  field: string;
  value: string;
}

// -- Upload -----------------------------------------------------------------

/**
 * Upload log entries to eQSL.cc via the proxy edge function.
 *
 * Requires the credential store to be unlocked and an "eqsl" credential stored.
 *
 * @param entries - Log entries to upload
 * @returns Upload result with success status and counts
 */
export async function uploadToEqsl(
  entries: LogEntry[],
): Promise<EqslUploadResult> {
  if (entries.length === 0) {
    return {
      success: false,
      qsoCount: 0,
      message: "No QSOs provided for eQSL upload",
    };
  }

  if (!isUnlocked()) {
    return {
      success: false,
      qsoCount: 0,
      message: "Credential store is locked. Please unlock it first.",
    };
  }

  const cred = await getCredential("eqsl");
  if (!cred) {
    return {
      success: false,
      qsoCount: 0,
      message:
        "No eQSL credentials found. Add your eQSL username and password in Settings.",
    };
  }

  try {
    const adifContent = exportADIF(entries, {
      includeExtended: true,
      includeContest: true,
      includeActivation: true,
    });

    const response = await fetch("/api/log/eqsl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adifContent,
        username: cred.username,
        password: cred.password,
      }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const errorMsg =
        typeof data.error === "string"
          ? data.error
          : `eQSL server returned ${response.status}`;
      return { success: false, qsoCount: entries.length, message: errorMsg };
    }

    const data = (await response.json()) as {
      success?: boolean;
      recordsUploaded?: number;
      message?: string;
      error?: string;
    };

    if (data.error) {
      return {
        success: false,
        qsoCount: entries.length,
        message: data.error,
      };
    }

    return {
      success: data.success ?? true,
      qsoCount: entries.length,
      recordsUploaded: data.recordsUploaded,
      message:
        data.message ??
        `Uploaded ${entries.length} QSO${entries.length !== 1 ? "s" : ""} to eQSL`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      qsoCount: entries.length,
      message: `Failed to upload to eQSL: ${message}`,
    };
  }
}

// -- Download ---------------------------------------------------------------

/**
 * Download eQSL inbox confirmations via the proxy edge function.
 *
 * @param since - Optional ISO date string (YYYY-MM-DD) for incremental download
 * @returns Inbox result with parsed confirmations
 */
export async function downloadEqslInbox(
  since?: string,
): Promise<EqslInboxResult> {
  if (!isUnlocked()) {
    return {
      success: false,
      confirmations: [],
      message: "Credential store is locked. Please unlock it first.",
    };
  }

  const cred = await getCredential("eqsl");
  if (!cred) {
    return {
      success: false,
      confirmations: [],
      message:
        "No eQSL credentials found. Add your eQSL username and password in Settings.",
    };
  }

  try {
    const body: Record<string, string> = {
      username: cred.username,
      password: cred.password,
    };
    if (since) {
      body.since = since;
    }

    const response = await fetch("/api/log/eqsl-inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const errorMsg =
        typeof data.error === "string"
          ? data.error
          : `eQSL server returned ${response.status}`;
      return { success: false, confirmations: [], message: errorMsg };
    }

    const data = (await response.json()) as {
      adif?: string;
      message?: string;
      error?: string;
    };

    if (data.error) {
      return { success: false, confirmations: [], message: data.error };
    }

    if (!data.adif || data.adif.trim().length === 0) {
      return {
        success: true,
        confirmations: [],
        message: data.message ?? "No new eQSL confirmations",
      };
    }

    // Parse the ADIF response into confirmation records
    const result = importADIF(data.adif);
    const confirmations: EqslConfirmation[] = result.entries.map((entry) => ({
      callsign: entry.callsign,
      band: entry.band,
      mode: entry.mode,
      date: entry.date,
      timeOn: entry.timeOn,
      eqslQslRcvd: "Y",
    }));

    return {
      success: true,
      confirmations,
      message: `Received ${confirmations.length} confirmation${confirmations.length !== 1 ? "s" : ""} from eQSL`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      confirmations: [],
      message: `Failed to download eQSL inbox: ${message}`,
    };
  }
}

// -- Matching ---------------------------------------------------------------

/**
 * Shift an ISO date string by `days` days.
 */
function shiftDate(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Build a composite key for QSO matching (callsign + band + mode + date).
 */
function matchKey(
  callsign: string,
  band: string,
  mode: string,
  date: string,
): string {
  return `${callsign.toUpperCase()}|${band.toLowerCase()}|${mode.toUpperCase()}|${date}`;
}

/**
 * Match eQSL inbox confirmations against local log entries and produce
 * a list of QSL status updates to apply.
 *
 * Matching strategy:
 *   1. Exact match: callsign + band + mode + date
 *   2. Fuzzy match: callsign + band + mode + date +/- 1 day
 *
 * For each matched QSO, sets:
 *   - eqsl = true (convenience boolean)
 *
 * @param confirmations - Parsed confirmations from eQSL inbox
 * @returns Object with updates to apply and match statistics
 */
export async function matchEqslConfirmations(
  confirmations: EqslConfirmation[],
): Promise<MatchResult> {
  if (confirmations.length === 0) {
    return { updates: [], matchedCount: 0, unmatchedCount: 0 };
  }

  const localEntries = await getAllLogEntries();

  // Primary map: exact key -> entry
  const exactMap = new Map<string, LogEntry>();
  // Secondary map: callsign+band+mode -> array of { entry, date }
  const fuzzyMap = new Map<string, { entry: LogEntry; date: string }[]>();

  for (const entry of localEntries) {
    const key = matchKey(entry.callsign, entry.band, entry.mode, entry.date);
    if (!exactMap.has(key)) {
      exactMap.set(key, entry);
    }

    const fuzzyKey = `${entry.callsign.toUpperCase()}|${entry.band.toLowerCase()}|${entry.mode.toUpperCase()}`;
    const arr = fuzzyMap.get(fuzzyKey) ?? [];
    arr.push({ entry, date: entry.date });
    fuzzyMap.set(fuzzyKey, arr);
  }

  const updates: QslUpdate[] = [];
  const matchedIds = new Set<string>();
  let unmatchedCount = 0;

  for (const conf of confirmations) {
    // Exact match
    const exactKey = matchKey(conf.callsign, conf.band, conf.mode, conf.date);
    const exactEntry = exactMap.get(exactKey);

    if (exactEntry && !matchedIds.has(exactEntry.id)) {
      matchedIds.add(exactEntry.id);
      if (!exactEntry.eqsl) {
        updates.push({
          id: exactEntry.id,
          field: "eqsl",
          value: "true",
        });
      }
      continue;
    }

    // Fuzzy match: same callsign + band + mode, date +/- 1 day
    const fuzzyKey = `${conf.callsign.toUpperCase()}|${conf.band.toLowerCase()}|${conf.mode.toUpperCase()}`;
    const candidates = fuzzyMap.get(fuzzyKey);

    if (candidates && candidates.length > 0) {
      const prevDate = shiftDate(conf.date, -1);
      const nextDate = shiftDate(conf.date, 1);

      const fuzzyMatch = candidates.find(
        (c) =>
          !matchedIds.has(c.entry.id) &&
          (c.date === prevDate || c.date === nextDate),
      );

      if (fuzzyMatch) {
        matchedIds.add(fuzzyMatch.entry.id);
        if (!fuzzyMatch.entry.eqsl) {
          updates.push({
            id: fuzzyMatch.entry.id,
            field: "eqsl",
            value: "true",
          });
        }
        continue;
      }
    }

    unmatchedCount++;
  }

  return {
    updates,
    matchedCount: matchedIds.size,
    unmatchedCount,
  };
}
