/**
 * WAE QTC System
 *
 * Implements the Worked All Europe (WAE) QTC system where EU stations
 * can send batches of 10 previously logged QSOs as "QTCs" to non-EU
 * stations for bonus points.
 *
 * Each QTC item contains: time, callsign, and serial number from a
 * previously logged QSO. QTCs are sent in batches of exactly 10 items.
 * Both the sender and receiver earn 1 point per QTC item.
 *
 * @module lib/contest/qtc
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A single QTC item representing a previously logged QSO
 */
export interface QTCItem {
  /** Time of the original QSO in HHMM format */
  time: string;
  /** Callsign from the original QSO */
  callsign: string;
  /** Serial number from the original QSO */
  serialNumber: number;
}

/**
 * A batch of QTC items (up to 10 per batch)
 */
export interface QTCBatch {
  /** Unique batch identifier */
  id: string;
  /** Batch number (1-based, sequential per receiving station) */
  batchNumber: number;
  /** Callsign of the station receiving the QTC batch */
  sentTo: string;
  /** Array of QTC items in this batch (max 10) */
  items: QTCItem[];
  /** ISO timestamp when the batch was sent */
  sentAt: string;
  /** Whether the batch was confirmed by the receiving station */
  confirmed: boolean;
}

// ============================================================================
// QTC Tracker Class
// ============================================================================

/**
 * Tracks QTC items and batches for WAE contest operations
 *
 * EU stations use this to:
 * 1. Add QSOs to the available pool via addQSO()
 * 2. Create batches of 10 items via createBatch()
 * 3. Confirm batches after successful exchange via confirmBatch()
 *
 * @example
 * ```ts
 * const tracker = new QTCTracker();
 *
 * // Add QSOs as they are logged
 * tracker.addQSO("W1AW", "1423", 1);
 * tracker.addQSO("K3LR", "1425", 2);
 * // ... add more QSOs
 *
 * // When 10+ items available, create a batch to send
 * if (tracker.getAvailableCount() >= 10) {
 *   const batch = tracker.createBatch("DL1ABC");
 *   if (batch) {
 *     // Send QTC batch to DL1ABC...
 *     tracker.confirmBatch(batch.id);
 *   }
 * }
 * ```
 */
export class QTCTracker {
  /** Pool of QSO items available to be batched */
  private availableItems: QTCItem[] = [];

  /** Set of unique keys to detect duplicate QTC items */
  private sentKeys: Set<string> = new Set();

  /** Array of all created QTC batches */
  private batches: QTCBatch[] = [];

  /** Counter for generating unique batch IDs */
  private nextBatchId: number = 1;

  /** Map of batch counts per receiving station for batch numbering */
  private batchCountByStation: Map<string, number> = new Map();

  /**
   * Add a logged QSO to the available QTC item pool
   *
   * @param callsign - Callsign of the worked station
   * @param time - Time of the QSO in HHMM format
   * @param serial - Serial number exchanged during the QSO
   */
  addQSO(callsign: string, time: string, serial: number): void {
    const key = this.makeKey(callsign, time);

    // Don't add duplicates
    if (this.sentKeys.has(key)) {
      return;
    }

    this.availableItems.push({
      time: time.padStart(4, "0"),
      callsign: callsign.toUpperCase(),
      serialNumber: serial,
    });
  }

  /**
   * Create a QTC batch of 10 items to send to a receiving station
   *
   * @param sendTo - Callsign of the station that will receive the QTC batch
   * @returns QTCBatch if 10+ items are available, null otherwise
   */
  createBatch(sendTo: string): QTCBatch | null {
    if (this.availableItems.length < 10) {
      return null;
    }

    // Take the first 10 available items
    const batchItems = this.availableItems.splice(0, 10);

    // Mark items as sent
    for (const item of batchItems) {
      this.sentKeys.add(this.makeKey(item.callsign, item.time));
    }

    // Increment batch number for this station
    const stationKey = sendTo.toUpperCase();
    const currentCount = this.batchCountByStation.get(stationKey) || 0;
    const batchNumber = currentCount + 1;
    this.batchCountByStation.set(stationKey, batchNumber);

    const batch: QTCBatch = {
      id: `qtc-${this.nextBatchId++}`,
      batchNumber,
      sentTo: stationKey,
      items: batchItems,
      sentAt: new Date().toISOString(),
      confirmed: false,
    };

    this.batches.push(batch);
    return batch;
  }

  /**
   * Mark a QTC batch as confirmed by the receiving station
   *
   * @param batchId - ID of the batch to confirm
   */
  confirmBatch(batchId: string): void {
    const batch = this.batches.find((b) => b.id === batchId);
    if (batch) {
      batch.confirmed = true;
    }
  }

  /**
   * Get the number of QSO items available for batching
   *
   * @returns Count of items not yet assigned to a batch
   */
  getAvailableCount(): number {
    return this.availableItems.length;
  }

  /**
   * Get all sent QTC batches
   *
   * @returns Array of all created QTC batches (both confirmed and unconfirmed)
   */
  getSentBatches(): QTCBatch[] {
    return [...this.batches];
  }

  /**
   * Calculate total QTC points earned
   *
   * Each confirmed QTC item is worth 1 point. Only items in confirmed
   * batches count toward the score.
   *
   * @returns Total QTC bonus points
   */
  getTotalQTCPoints(): number {
    let total = 0;
    for (const batch of this.batches) {
      if (batch.confirmed) {
        total += batch.items.length;
      }
    }
    return total;
  }

  /**
   * Check if a QSO has already been used in a QTC batch
   *
   * Prevents the same QSO from being sent as a QTC more than once.
   *
   * @param callsign - Callsign to check
   * @param time - Time to check in HHMM format
   * @returns True if this QSO has already been batched
   */
  isDuplicate(callsign: string, time: string): boolean {
    return this.sentKeys.has(this.makeKey(callsign, time));
  }

  /**
   * Generate a unique key for deduplication
   */
  private makeKey(callsign: string, time: string): string {
    return `${callsign.toUpperCase()}|${time.padStart(4, "0")}`;
  }
}
