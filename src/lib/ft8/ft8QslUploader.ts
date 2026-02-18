/**
 * FT8 QSL Auto-Upload Orchestrator
 *
 * Orchestrates uploading a newly logged FT8/FT4 QSO to all enabled QSL
 * confirmation services (eQSL, Club Log, QRZ, LoTW). Designed to be called
 * immediately after `logFt8Qso()` completes.
 *
 * This is fire-and-forget: errors are captured per-service and returned in
 * the result object but never thrown. The QSO is already persisted in
 * IndexedDB; upload failures do not affect the log.
 */

import { getLogEntry } from "@/lib/db/logStore";
import { isUnlocked, getCredential } from "@/lib/db/credentialStore";
import type { LogEntry } from "@/lib/db/types";
import {
  uploadToEqsl,
  uploadToClublog,
  generateLotwAdif,
} from "@/lib/api/logUpload";
import { uploadToQrz } from "@/lib/sync/qrzSync";
import { generateADIF } from "@/lib/utils/adifParser";

// ─── Public Types ───────────────────────────────────────────────────────────

export interface Ft8QslUploadConfig {
  /** Whether to upload to eQSL.cc */
  eqslEnabled: boolean;
  /** Whether to upload to Club Log */
  clublogEnabled: boolean;
  /** Whether to upload to QRZ.com */
  qrzEnabled: boolean;
  /** Whether to generate LoTW ADIF (requires manual TQSL signing) */
  lotwEnabled: boolean;
}

export interface Ft8QslServiceResult {
  service: "eqsl" | "clublog" | "qrz" | "lotw";
  success: boolean;
  error?: string;
}

export interface Ft8QslUploadResult {
  /** Per-service results */
  results: Ft8QslServiceResult[];
  /** Number of successful uploads */
  successCount: number;
  /** Number of failed uploads */
  failureCount: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a single-entry ADIF string from a LogEntry for services that
 * accept raw ADIF content (eQSL, Club Log).
 */
function entryToAdif(entry: LogEntry): string {
  return generateADIF([entry]);
}

/**
 * Attempt eQSL upload for a single log entry.
 */
async function attemptEqsl(entry: LogEntry): Promise<Ft8QslServiceResult> {
  const cred = await getCredential("eqsl");
  if (!cred) {
    return {
      service: "eqsl",
      success: false,
      error: "No eQSL credentials configured. Add them in Settings.",
    };
  }

  const adif = entryToAdif(entry);
  const result = await uploadToEqsl(adif, {
    username: cred.username,
    password: cred.password,
  });

  return {
    service: "eqsl",
    success: result.success,
    error: result.success ? undefined : result.message,
  };
}

/**
 * Attempt Club Log upload for a single log entry.
 *
 * Club Log requires email, password, and callsign. The credential store
 * stores email in the `username` field and password in `password`. The
 * station callsign is taken from the log entry's `stationCallsign` field.
 */
async function attemptClublog(entry: LogEntry): Promise<Ft8QslServiceResult> {
  const cred = await getCredential("clublog");
  if (!cred) {
    return {
      service: "clublog",
      success: false,
      error: "No Club Log credentials configured. Add them in Settings.",
    };
  }

  const callsign = entry.stationCallsign || entry.callsign;
  const adif = entryToAdif(entry);
  const result = await uploadToClublog(adif, {
    email: cred.username,
    password: cred.password,
    callsign,
  });

  return {
    service: "clublog",
    success: result.success,
    error: result.success ? undefined : result.message,
  };
}

/**
 * Attempt QRZ.com upload for a single log entry.
 *
 * `uploadToQrz` handles credential retrieval internally, so we just pass
 * the entry array through.
 */
async function attemptQrz(entry: LogEntry): Promise<Ft8QslServiceResult> {
  const result = await uploadToQrz([entry]);

  return {
    service: "qrz",
    success: result.success,
    error: result.success ? undefined : result.message,
  };
}

/**
 * Generate LoTW ADIF for the log entry.
 *
 * LoTW requires TQSL signing which cannot be done programmatically from
 * the browser, so this step only generates the ADIF content. The result
 * is considered "successful" if generation completes without error.
 *
 * In a future iteration the generated ADIF could be queued for the user
 * to batch-sign via TQSL.
 */
async function attemptLotw(entry: LogEntry): Promise<Ft8QslServiceResult> {
  const cred = await getCredential("lotw");
  if (!cred) {
    return {
      service: "lotw",
      success: false,
      error: "No LoTW credentials configured. Add them in Settings.",
    };
  }

  // Generate the ADIF content — LoTW requires manual TQSL signing, so
  // we generate and consider it a success. The ADIF could be stored or
  // presented to the user for later batch signing.
  generateLotwAdif([entry]);

  return {
    service: "lotw",
    success: true,
    // No error — but callers should understand LoTW still needs TQSL signing
  };
}

// ─── Main Orchestrator ──────────────────────────────────────────────────────

/**
 * Upload a logged QSO to all enabled QSL services.
 *
 * This is fire-and-forget — errors are captured and returned but never
 * thrown. The QSO logging is already complete; upload failures don't
 * affect the log.
 *
 * @param logEntryId  The ID of the just-logged entry
 * @param config      Which services to upload to
 */
export async function uploadFt8Qso(
  logEntryId: string,
  config: Ft8QslUploadConfig,
): Promise<Ft8QslUploadResult> {
  const emptyResult: Ft8QslUploadResult = {
    results: [],
    successCount: 0,
    failureCount: 0,
  };

  // ── 1. Load the log entry ──────────────────────────────────────────────

  let entry: LogEntry | undefined;
  try {
    entry = await getLogEntry(logEntryId);
  } catch {
    // Failed to load the log entry — nothing to upload
    return {
      results: [],
      successCount: 0,
      failureCount: 1,
    };
  }

  if (!entry) {
    return emptyResult;
  }

  // ── 2. Check credential store ──────────────────────────────────────────

  if (!isUnlocked()) {
    // Cannot load credentials — mark all enabled services as failed
    const services: ("eqsl" | "clublog" | "qrz" | "lotw")[] = [];
    if (config.eqslEnabled) services.push("eqsl");
    if (config.clublogEnabled) services.push("clublog");
    if (config.qrzEnabled) services.push("qrz");
    if (config.lotwEnabled) services.push("lotw");

    const results: Ft8QslServiceResult[] = services.map((service) => ({
      service,
      success: false,
      error: "Credential store is locked. Unlock it to enable QSL uploads.",
    }));

    return {
      results,
      successCount: 0,
      failureCount: results.length,
    };
  }

  // ── 3. Build per-service upload promises ───────────────────────────────

  const tasks: Promise<Ft8QslServiceResult>[] = [];

  if (config.eqslEnabled) {
    tasks.push(
      attemptEqsl(entry).catch(
        (err): Ft8QslServiceResult => ({
          service: "eqsl",
          success: false,
          error: err instanceof Error ? err.message : "Unknown eQSL error",
        }),
      ),
    );
  }

  if (config.clublogEnabled) {
    tasks.push(
      attemptClublog(entry).catch(
        (err): Ft8QslServiceResult => ({
          service: "clublog",
          success: false,
          error: err instanceof Error ? err.message : "Unknown Club Log error",
        }),
      ),
    );
  }

  if (config.qrzEnabled) {
    tasks.push(
      attemptQrz(entry).catch(
        (err): Ft8QslServiceResult => ({
          service: "qrz",
          success: false,
          error: err instanceof Error ? err.message : "Unknown QRZ error",
        }),
      ),
    );
  }

  if (config.lotwEnabled) {
    tasks.push(
      attemptLotw(entry).catch(
        (err): Ft8QslServiceResult => ({
          service: "lotw",
          success: false,
          error: err instanceof Error ? err.message : "Unknown LoTW error",
        }),
      ),
    );
  }

  if (tasks.length === 0) {
    return emptyResult;
  }

  // ── 4. Execute all uploads in parallel ─────────────────────────────────

  const settled = await Promise.allSettled(tasks);

  const results: Ft8QslServiceResult[] = settled.map((outcome) => {
    if (outcome.status === "fulfilled") {
      return outcome.value;
    }
    // This branch should not be reached because each task has its own
    // .catch(), but handle it defensively anyway.
    return {
      service: "eqsl" as const,
      success: false,
      error:
        outcome.reason instanceof Error
          ? outcome.reason.message
          : "Unexpected upload failure",
    };
  });

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  return { results, successCount, failureCount };
}
