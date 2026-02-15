/**
 * Post-Contest Batch Upload Coordinator
 *
 * Manages batch QSL uploads to LoTW, eQSL, and QRZ after a contest.
 * Generates ADIF from contest log entries and uploads to selected services.
 *
 * Uses an async generator pattern for real-time progress tracking.
 */

import type { LogEntry } from "@/lib/db/types";
import { getAllLogEntries } from "@/lib/db/logStore";
import { uploadToLotw } from "@/lib/sync/lotwSync";

// ─── Types ──────────────────────────────────────────────────────────────────

export type QslService = "lotw" | "eqsl" | "qrz";

export interface BatchUploadJob {
  /** Unique job identifier */
  id: string;
  /** Contest session ID to upload QSOs for */
  sessionId: string;
  /** Services to upload to */
  services: QslService[];
  /** Log entries matching the contest session */
  entries: LogEntry[];
  /** When the job was created */
  createdAt: string;
}

export interface BatchUploadProgress {
  /** Which service is currently being processed */
  service: QslService;
  /** Total entries to upload for this service */
  total: number;
  /** Successfully uploaded count */
  completed: number;
  /** Failed upload count */
  failed: number;
  /** Error messages from failures */
  errors: string[];
  /** Whether this service is done */
  done: boolean;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Create a batch upload job for a contest session.
 *
 * Reads all log entries tagged with the given contestId and packages
 * them into a job that can be executed with `executeBatchUpload()`.
 *
 * @param sessionId - Contest session ID (matches LogEntry.contestId)
 * @param services - Array of QSL services to upload to
 * @returns BatchUploadJob ready for execution
 */
export async function createBatchUpload(
  sessionId: string,
  services: QslService[],
): Promise<BatchUploadJob> {
  // Get all log entries and filter by contestId
  const allEntries = await getAllLogEntries();
  const entries = allEntries.filter((e) => e.contestId === sessionId);

  return {
    id: crypto.randomUUID(),
    sessionId,
    services: [...services],
    entries,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Execute a batch upload job, yielding progress updates for each service.
 *
 * Processes each service sequentially. For LoTW, generates an ADIF file
 * for download (user must sign with TQSL). eQSL and QRZ are stubbed
 * and will throw errors until implemented in Wave 5.
 *
 * @param job - The batch upload job to execute
 * @yields BatchUploadProgress updates for each service
 */
export async function* executeBatchUpload(
  job: BatchUploadJob,
): AsyncGenerator<BatchUploadProgress> {
  for (const service of job.services) {
    const progress: BatchUploadProgress = {
      service,
      total: job.entries.length,
      completed: 0,
      failed: 0,
      errors: [],
      done: false,
    };

    // Yield initial progress
    yield { ...progress };

    try {
      switch (service) {
        case "lotw": {
          const result = uploadToLotw(job.entries);
          if (result.success) {
            progress.completed = result.qsoCount;
          } else {
            progress.failed = job.entries.length;
            progress.errors.push(result.message);
          }
          break;
        }

        case "eqsl": {
          throw new Error("eQSL sync not yet implemented");
        }

        case "qrz": {
          throw new Error("QRZ sync not yet implemented");
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      progress.failed = job.entries.length;
      progress.errors.push(message);
    }

    progress.done = true;
    yield { ...progress };
  }
}
