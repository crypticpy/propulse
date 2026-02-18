/**
 * PSK Reporter Uploader
 *
 * Batches locally decoded FT8/FT4 reception reports and uploads them to
 * PSK Reporter (https://pskreporter.info).
 *
 * PSK Reporter expects reception reports in a specific binary/UDP format.
 * Since this is a browser-based application, direct UDP is not available
 * and the PSK Reporter web upload endpoint does not support CORS headers.
 * Therefore this module formats the data and POSTs it through the Propulse
 * bridge server (or a Vercel Edge Function proxy) which relays the payload
 * to PSK Reporter on behalf of the client.
 *
 * -- CORS Limitation --
 * Direct browser-to-PSKReporter uploads will fail due to missing
 * Access-Control-Allow-Origin headers on pskreporter.info. The recommended
 * deployment path is:
 *   1. Browser -> Bridge server (localhost:8765) -> PSK Reporter
 *   2. Browser -> /api/spots/pskreporter-upload (Edge Function) -> PSK Reporter
 *
 * The uploader formats reports as JSON and delegates the actual HTTP POST to
 * one of the above relay endpoints. If neither is available, reports are
 * buffered and retried on the next flush cycle.
 */

import type { Ft8EnrichedDecode } from "./ft8EnrichedDecode";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single reception report entry ready for PSK Reporter upload. */
export interface PskReportEntry {
  /** Reporter's callsign (the local station) */
  senderCallsign: string;
  /** Reporter's Maidenhead grid locator */
  senderGrid: string;
  /** Callsign of the station that was heard */
  receiverCallsign: string;
  /** Grid of the heard station, if decoded */
  receiverGrid?: string;
  /** RF frequency in Hz */
  frequency: number;
  /** Signal-to-noise ratio in dB */
  snr: number;
  /** Digital mode: FT8, FT4, etc. */
  mode: string;
  /** ISO 8601 timestamp of the reception */
  timestamp: string;
}

/** Configuration for PskReporterUploader */
export interface PskUploaderConfig {
  /** Operator's callsign (used as the "receiver" in PSK Reporter terms) */
  senderCallsign: string;
  /** Operator's grid locator */
  senderGrid: string;
  /** Reporting program name */
  programName?: string;
  /** Reporting program version */
  programVersion?: string;
  /**
   * Upload relay endpoint URL. Defaults to the bridge relay path.
   * Set to a Vercel Edge Function URL for production deployments.
   */
  relayUrl?: string;
  /** Upload interval in milliseconds (default: 300_000 = 5 minutes) */
  uploadIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default flush interval: 5 minutes, matching PSK Reporter best practice. */
const DEFAULT_UPLOAD_INTERVAL_MS = 5 * 60 * 1000;

/** Maximum batch size per upload (PSK Reporter guideline). */
const MAX_BATCH_SIZE = 200;

/**
 * Bridge-side relay endpoint path.
 * The bridge server forwards the JSON payload to PSK Reporter via
 * server-side HTTP, bypassing browser CORS restrictions.
 */
const DEFAULT_RELAY_URL = "/api/spots/pskreporter-upload";

// ---------------------------------------------------------------------------
// PskReporterUploader
// ---------------------------------------------------------------------------

/**
 * Batches FT8/FT4 decode reports and periodically uploads them to PSK Reporter
 * via a server-side relay (bridge or Edge Function) to avoid CORS limitations.
 *
 * Usage:
 * ```ts
 * const uploader = new PskReporterUploader({
 *   senderCallsign: "W1ABC",
 *   senderGrid: "FN42ig",
 * });
 * uploader.start();
 *
 * // Feed decodes as they arrive:
 * uploader.addDecode(entry);
 *
 * // On shutdown:
 * uploader.stop();
 * ```
 */
export class PskReporterUploader {
  private readonly config: Required<PskUploaderConfig>;
  private batch: PskReportEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private uploading = false;

  constructor(config: PskUploaderConfig) {
    if (!config.senderCallsign) {
      throw new Error("PskReporterUploader: senderCallsign is required");
    }
    if (!config.senderGrid) {
      throw new Error("PskReporterUploader: senderGrid is required");
    }

    this.config = {
      senderCallsign: config.senderCallsign.toUpperCase(),
      senderGrid: config.senderGrid.toUpperCase(),
      programName: config.programName ?? "Propulse",
      programVersion: config.programVersion ?? "0.16.0",
      relayUrl: config.relayUrl ?? DEFAULT_RELAY_URL,
      uploadIntervalMs: config.uploadIntervalMs ?? DEFAULT_UPLOAD_INTERVAL_MS,
    };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Add a single pre-formatted report entry to the upload batch. */
  addDecode(entry: PskReportEntry): void {
    if (!entry.receiverCallsign || !entry.frequency || !entry.mode) return;
    this.batch.push(entry);
  }

  /**
   * Convenience method: convert an enriched FT8 decode into a report entry
   * and add it to the batch. The dialFrequencyHz is the VFO dial frequency,
   * and the decode's deltaFrequency (audio offset) is added to compute the
   * true RF frequency.
   */
  addEnrichedDecode(decode: Ft8EnrichedDecode, dialFrequencyHz: number): void {
    if (!decode.callsign) return;

    const entry: PskReportEntry = {
      senderCallsign: this.config.senderCallsign,
      senderGrid: this.config.senderGrid,
      receiverCallsign: decode.callsign,
      receiverGrid: decode.grid ?? undefined,
      frequency: dialFrequencyHz + decode.deltaFrequency,
      snr: decode.snr,
      mode: decode.mode,
      timestamp: new Date(decode.time).toISOString(),
    };

    this.addDecode(entry);
  }

  /**
   * Immediately flush all buffered reports to the relay endpoint.
   * Called automatically by the upload timer, but can be invoked manually
   * (e.g. on app shutdown or band change).
   */
  async flush(): Promise<void> {
    if (this.batch.length === 0 || this.uploading) return;

    this.uploading = true;

    // Drain the batch into a local copy so new decodes can accumulate
    // while the upload is in flight.
    const toUpload = this.batch.splice(0, MAX_BATCH_SIZE);

    try {
      const payload = {
        reporter: {
          callsign: this.config.senderCallsign,
          grid: this.config.senderGrid,
          programName: this.config.programName,
          programVersion: this.config.programVersion,
        },
        reports: toUpload,
      };

      const response = await fetch(this.config.relayUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        // Re-queue failed reports for the next cycle (prepend so they retry first).
        console.warn(
          `[PskReporterUploader] Upload failed (HTTP ${response.status}). ` +
            `${toUpload.length} reports re-queued.`,
        );
        this.batch.unshift(...toUpload);
      } else {
        console.info(
          `[PskReporterUploader] Uploaded ${toUpload.length} reports to PSK Reporter.`,
        );
      }
    } catch (err) {
      // Network error — re-queue for retry.
      console.warn(
        "[PskReporterUploader] Network error during upload. Reports re-queued.",
        err,
      );
      this.batch.unshift(...toUpload);
    } finally {
      this.uploading = false;
    }
  }

  /** Start the automatic upload timer. */
  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, this.config.uploadIntervalMs);
  }

  /** Stop the automatic upload timer and optionally flush remaining reports. */
  stop(flushRemaining = true): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (flushRemaining && this.batch.length > 0) {
      void this.flush();
    }
  }

  /** Number of reports waiting in the upload buffer. */
  get pendingCount(): number {
    return this.batch.length;
  }

  /** Whether the uploader timer is currently running. */
  get isRunning(): boolean {
    return this.timer !== null;
  }

  /** Discard all buffered reports without uploading. */
  clear(): void {
    this.batch.length = 0;
  }
}
