/**
 * LoTW (Logbook of The World) Sync
 *
 * Upload: Generates ADIF from selected QSOs for external TQSL signing.
 * Download: Fetches confirmations via the `/api/log/lotw` proxy edge function,
 *           parses the returned ADIF, and matches against local log entries.
 *
 * Matching strategy:
 *   1. Exact: callsign + band + mode + date
 *   2. Fuzzy: callsign + band + mode + date within +/-1 day (handles UTC edge cases)
 */

import type { LogEntry } from "@/lib/db/types";
import { getCredential, isUnlocked } from "@/lib/db/credentialStore";
import { getAllLogEntries } from "@/lib/db/logStore";
import { exportADIF } from "@/lib/adif/export";
import { importADIF } from "@/lib/adif/import";
import { downloadBlob } from "@/lib/utils/downloadBlob";

// ── Types ────────────────────────────────────────────────────────────────────

export interface LotwUploadResult {
  /** Whether the ADIF file was generated and downloaded for TQSL signing */
  success: boolean;
  /** Number of QSOs included in the generated ADIF */
  qsoCount: number;
  /** Human-readable status message */
  message: string;
}

export interface LotwDownloadResult {
  /** Whether the download and matching completed successfully */
  success: boolean;
  /** Number of confirmations received from LoTW */
  confirmationsReceived: number;
  /** Number of local QSOs that were updated */
  matchedCount: number;
  /** Number of confirmations that could not be matched locally */
  unmatchedCount: number;
  /** Human-readable status message */
  message: string;
}

export interface LotwConfirmation {
  callsign: string;
  band: string;
  mode: string;
  date: string;
  timeOn: string;
  lotwQslRcvd: string;
  lotwQslSent?: string;
}

export interface QslStatusUpdate {
  id: string;
  field: string;
  value: string;
}

// ── Upload (Generate ADIF for TQSL) ─────────────────────────────────────────

/**
 * Generate an ADIF file from the provided log entries for TQSL signing.
 *
 * The user downloads this file, signs it with TQSL (external desktop app),
 * then uploads the signed .tq8 file to LoTW via tqsl.arrl.org.
 *
 * @param entries - Log entries to include in the export
 * @returns Upload result with success status and QSO count
 */
export function uploadToLotw(entries: LogEntry[]): LotwUploadResult {
  if (entries.length === 0) {
    return {
      success: false,
      qsoCount: 0,
      message: "No QSOs selected for LoTW upload",
    };
  }

  try {
    // Generate ADIF optimized for LoTW (include station callsign for multi-call ops)
    const adif = exportADIF(entries, {
      includeStationCallsign: true,
      includeExtended: true,
      includeContest: true,
      includeActivation: true,
    });

    // Trigger browser download of the ADIF file
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadBlob(adif, `propulse-lotw-upload-${dateStr}.adi`, "text/plain");

    return {
      success: true,
      qsoCount: entries.length,
      message: `Generated ADIF with ${entries.length} QSO${entries.length !== 1 ? "s" : ""}. Open this file in TQSL to sign and upload to LoTW.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      qsoCount: 0,
      message: `Failed to generate ADIF: ${message}`,
    };
  }
}

// ── Download (Fetch confirmations from LoTW) ────────────────────────────────

/**
 * Download QSL confirmations from LoTW via the proxy edge function.
 *
 * Requires the credential store to be unlocked and a "lotw" credential
 * to be stored (username = callsign, password = LoTW password).
 *
 * @param since - Optional ISO date string (YYYY-MM-DD) to fetch only recent confirmations
 * @returns Array of parsed LoTW confirmations
 */
export async function downloadLotwConfirmations(
  since?: string,
): Promise<{ confirmations: LotwConfirmation[]; error?: string }> {
  // Validate credential store state
  if (!isUnlocked()) {
    return {
      confirmations: [],
      error: "Credential store is locked. Please unlock it first.",
    };
  }

  const cred = await getCredential("lotw");
  if (!cred) {
    return {
      confirmations: [],
      error:
        "No LoTW credentials found. Add your LoTW username and password in Settings.",
    };
  }

  try {
    // Call the edge function proxy
    const body: Record<string, string> = {
      username: cred.username,
      password: cred.password,
    };
    if (since) {
      body.since = since;
    }

    const response = await fetch("/api/log/lotw", {
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
          : `LoTW server returned ${response.status}`;
      return { confirmations: [], error: errorMsg };
    }

    const data = (await response.json()) as { adif?: string; error?: string };

    if (data.error) {
      return { confirmations: [], error: data.error };
    }

    if (!data.adif || data.adif.trim().length === 0) {
      return {
        confirmations: [],
        error: undefined, // Not an error — simply no new confirmations
      };
    }

    // Parse the ADIF response into confirmation records
    const result = importADIF(data.adif);
    const confirmations: LotwConfirmation[] = result.entries.map((entry) => ({
      callsign: entry.callsign,
      band: entry.band,
      mode: entry.mode,
      date: entry.date,
      timeOn: entry.timeOn,
      lotwQslRcvd: entry.lotwQslRcvd ?? "Y",
      lotwQslSent: entry.lotwQslSent,
    }));

    return { confirmations };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      confirmations: [],
      error: `Failed to download LoTW confirmations: ${message}`,
    };
  }
}

// ── Matching ─────────────────────────────────────────────────────────────────

/**
 * Shift an ISO date string by `days` days.
 * E.g., shiftDate("2026-02-15", -1) => "2026-02-14"
 */
function shiftDate(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Build a composite key for QSO matching (callsign + band + mode + date).
 * All parts are normalized to uppercase / lowercase as appropriate.
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
 * Match LoTW confirmations against local log entries and produce
 * a list of QSL status updates to apply.
 *
 * Matching strategy:
 *   1. Exact match: callsign + band + mode + date
 *   2. Fuzzy match: callsign + band + mode + date +/- 1 day
 *      (handles UTC date boundary edge cases)
 *
 * For each matched QSO, sets:
 *   - lotwQslRcvd = "Y"
 *   - lotw = true (convenience boolean)
 *
 * @param confirmations - Parsed confirmations from LoTW
 * @returns Object with updates to apply and match statistics
 */
export async function matchLotwConfirmations(
  confirmations: LotwConfirmation[],
): Promise<{
  updates: QslStatusUpdate[];
  matchedCount: number;
  unmatchedCount: number;
}> {
  if (confirmations.length === 0) {
    return { updates: [], matchedCount: 0, unmatchedCount: 0 };
  }

  // Load all local entries and build lookup maps
  const localEntries = await getAllLogEntries();

  // Primary map: exact key -> entry
  const exactMap = new Map<string, LogEntry>();
  // Secondary map: key without date for fuzzy matching
  // callsign+band+mode -> array of { entry, date }
  const fuzzyMap = new Map<string, { entry: LogEntry; date: string }[]>();

  for (const entry of localEntries) {
    const key = matchKey(entry.callsign, entry.band, entry.mode, entry.date);
    // Only store first match (oldest wins for exact)
    if (!exactMap.has(key)) {
      exactMap.set(key, entry);
    }

    const fuzzyKey = `${entry.callsign.toUpperCase()}|${entry.band.toLowerCase()}|${entry.mode.toUpperCase()}`;
    const arr = fuzzyMap.get(fuzzyKey) ?? [];
    arr.push({ entry, date: entry.date });
    fuzzyMap.set(fuzzyKey, arr);
  }

  const updates: QslStatusUpdate[] = [];
  const matchedIds = new Set<string>();
  let unmatchedCount = 0;

  for (const conf of confirmations) {
    // Skip if already confirmed locally
    const exactKey = matchKey(conf.callsign, conf.band, conf.mode, conf.date);
    const exactEntry = exactMap.get(exactKey);

    if (exactEntry && !matchedIds.has(exactEntry.id)) {
      // Exact match found
      matchedIds.add(exactEntry.id);

      // Only update if not already confirmed
      if (exactEntry.lotwQslRcvd !== "Y") {
        updates.push({
          id: exactEntry.id,
          field: "lotwQslRcvd",
          value: "Y",
        });
        // Also set the convenience boolean
        if (!exactEntry.lotw) {
          updates.push({
            id: exactEntry.id,
            field: "lotw",
            value: "true",
          });
        }
      }
      continue;
    }

    // Try fuzzy match: same callsign + band + mode, date +/- 1 day
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

        if (fuzzyMatch.entry.lotwQslRcvd !== "Y") {
          updates.push({
            id: fuzzyMatch.entry.id,
            field: "lotwQslRcvd",
            value: "Y",
          });
          if (!fuzzyMatch.entry.lotw) {
            updates.push({
              id: fuzzyMatch.entry.id,
              field: "lotw",
              value: "true",
            });
          }
        }
        continue;
      }
    }

    // No match found
    unmatchedCount++;
  }

  return {
    updates,
    matchedCount: matchedIds.size,
    unmatchedCount,
  };
}
