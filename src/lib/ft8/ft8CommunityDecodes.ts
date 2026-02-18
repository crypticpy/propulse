/**
 * ft8CommunityDecodes — Client for an anonymized community decode sharing network.
 *
 * Allows Propulse users to optionally share their FT8/FT4 decode data with a
 * community network, providing aggregated band activity and callsign spotting
 * information. All data is anonymized: only the 4-character Maidenhead grid
 * is shared, never the reporter's callsign.
 *
 * The client buffers decode reports locally and uploads them in batches
 * every 60 seconds. Network errors are handled gracefully and never surface
 * to the caller.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A decode report to share with the community. */
export interface CommunityDecodeReport {
  /** Reporter's grid (4-char, anonymized) */
  reporterGrid: string;
  /** Decoded callsign */
  callsign: string;
  /** Decoded grid (if available) */
  grid?: string;
  /** SNR in dB */
  snr: number;
  /** Frequency in Hz */
  frequency: number;
  /** Mode */
  mode: "FT8" | "FT4";
  /** Timestamp ISO */
  timestamp: string;
  /** Band */
  band: string;
}

/** Aggregated community data for a band/time window. */
export interface CommunityBandActivity {
  band: string;
  /** Total reports in the last N minutes */
  totalReports: number;
  /** Unique callsigns heard */
  uniqueCallsigns: number;
  /** Unique reporter grids */
  uniqueReporters: number;
  /** Average SNR */
  avgSnr: number;
  /** Active continents */
  activeContinents: string[];
  /** Last updated */
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Configuration options for the community decode client. */
export interface CommunityDecodeClientConfig {
  /** Base URL for the community decode REST API */
  apiBaseUrl?: string;
  /** Whether community sharing is enabled */
  enabled?: boolean;
  /** Reporter's 4-char Maidenhead grid for anonymized uploads */
  reporterGrid?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default REST API base path. */
const DEFAULT_API_BASE_URL = "/api/ft8/community-decodes";

/** Buffer flush interval in milliseconds (60 seconds). */
const FLUSH_INTERVAL_MS = 60_000;

/** Maximum batch size per upload. */
const MAX_BATCH_SIZE = 500;

// ---------------------------------------------------------------------------
// CommunityDecodeClient
// ---------------------------------------------------------------------------

/**
 * Client for the community decode sharing network.
 *
 * Buffers decode reports locally and periodically uploads them to a REST
 * endpoint. All reports are anonymized: only the 4-character grid square
 * is included, never the reporter's callsign.
 *
 * Usage:
 * ```ts
 * const client = new CommunityDecodeClient({
 *   enabled: true,
 *   reporterGrid: "FN42",
 * });
 * client.start();
 *
 * // Feed decodes as they arrive:
 * client.uploadDecodes([report1, report2]);
 *
 * // Query community data:
 * const activity = await client.fetchBandActivity("20m", 15);
 *
 * // On shutdown:
 * client.stop();
 * ```
 */
export class CommunityDecodeClient {
  private apiBaseUrl: string;
  private enabled: boolean;
  private reporterGrid: string;
  private buffer: CommunityDecodeReport[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(config?: CommunityDecodeClientConfig) {
    this.apiBaseUrl = config?.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    this.enabled = config?.enabled ?? false;
    this.reporterGrid = sanitizeGrid(config?.reporterGrid ?? "");
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Upload a batch of decode reports.
   *
   * Reports are buffered locally and flushed to the server on the next
   * flush cycle (every 60 seconds). If sharing is disabled, reports are
   * silently discarded.
   */
  async uploadDecodes(reports: CommunityDecodeReport[]): Promise<void> {
    if (!this.enabled || reports.length === 0) return;

    // Anonymize each report: enforce 4-char grid, strip any extra detail
    const anonymized = reports.map((r) => ({
      reporterGrid: this.reporterGrid || sanitizeGrid(r.reporterGrid),
      callsign: r.callsign,
      grid: r.grid ? sanitizeGrid(r.grid) : undefined,
      snr: r.snr,
      frequency: r.frequency,
      mode: r.mode,
      timestamp: r.timestamp,
      band: r.band,
    }));

    this.buffer.push(...anonymized);

    // If the buffer is large, flush immediately to avoid memory pressure
    if (this.buffer.length >= MAX_BATCH_SIZE) {
      await this.flush();
    }
  }

  /**
   * Fetch current band activity from the community.
   *
   * @param band           Optional band filter (e.g. "20m"). Omit for all bands.
   * @param windowMinutes  Time window in minutes (default: 15).
   * @returns              Array of band activity summaries.
   */
  async fetchBandActivity(
    band?: string,
    windowMinutes = 15,
  ): Promise<CommunityBandActivity[]> {
    const params = new URLSearchParams({
      windowMinutes: String(windowMinutes),
    });
    if (band) params.set("band", band);

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/activity?${params.toString()}`,
      );
      if (!response.ok) {
        console.warn(
          `[CommunityDecodeClient] fetchBandActivity failed (HTTP ${response.status}).`,
        );
        return [];
      }
      const data: unknown = await response.json();
      if (!Array.isArray(data)) return [];
      return data as CommunityBandActivity[];
    } catch (err) {
      console.warn(
        "[CommunityDecodeClient] Network error fetching band activity.",
        err,
      );
      return [];
    }
  }

  /**
   * Fetch recent decodes for a specific callsign from the community.
   *
   * @param callsign       The callsign to look up.
   * @param windowMinutes  Time window in minutes (default: 30).
   * @returns              Array of community decode reports for the callsign.
   */
  async fetchCallsignSpots(
    callsign: string,
    windowMinutes = 30,
  ): Promise<CommunityDecodeReport[]> {
    if (!callsign) return [];

    const params = new URLSearchParams({
      callsign: callsign.toUpperCase(),
      windowMinutes: String(windowMinutes),
    });

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/spots?${params.toString()}`,
      );
      if (!response.ok) {
        console.warn(
          `[CommunityDecodeClient] fetchCallsignSpots failed (HTTP ${response.status}).`,
        );
        return [];
      }
      const data: unknown = await response.json();
      if (!Array.isArray(data)) return [];
      return data as CommunityDecodeReport[];
    } catch (err) {
      console.warn(
        "[CommunityDecodeClient] Network error fetching callsign spots.",
        err,
      );
      return [];
    }
  }

  /** Enable or disable community sharing. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      // Discard any buffered reports when sharing is turned off
      this.buffer.length = 0;
    }
  }

  /**
   * Set the reporter grid for anonymized uploads.
   *
   * Only the first 4 characters are used (Maidenhead field + square).
   */
  setReporterGrid(grid: string): void {
    this.reporterGrid = sanitizeGrid(grid);
  }

  /** Whether community sharing is currently enabled. */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Number of reports waiting in the upload buffer. */
  get pendingCount(): number {
    return this.buffer.length;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Start the automatic flush timer. */
  start(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  /** Stop the automatic flush timer and optionally flush remaining reports. */
  stop(flushRemaining = true): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (flushRemaining && this.buffer.length > 0) {
      void this.flush();
    }
  }

  /** Discard all buffered reports without uploading. */
  clear(): void {
    this.buffer.length = 0;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Flush buffered reports to the server.
   *
   * Network errors are caught and logged but never thrown. Failed reports
   * are re-queued for the next cycle.
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.flushing || !this.enabled) return;

    this.flushing = true;
    const toUpload = this.buffer.splice(0, MAX_BATCH_SIZE);

    try {
      const response = await fetch(`${this.apiBaseUrl}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reports: toUpload }),
      });

      if (!response.ok) {
        console.warn(
          `[CommunityDecodeClient] Upload failed (HTTP ${response.status}). ` +
            `${toUpload.length} reports re-queued.`,
        );
        this.buffer.unshift(...toUpload);
      } else {
        console.info(
          `[CommunityDecodeClient] Uploaded ${toUpload.length} community decode reports.`,
        );
      }
    } catch (err) {
      console.warn(
        "[CommunityDecodeClient] Network error during upload. Reports re-queued.",
        err,
      );
      this.buffer.unshift(...toUpload);
    } finally {
      this.flushing = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a grid locator to the first 4 characters (field + square).
 * Returns an empty string if the input is invalid.
 */
function sanitizeGrid(grid: string): string {
  if (!grid || grid.length < 4) return grid?.toUpperCase() ?? "";
  return grid.slice(0, 4).toUpperCase();
}
