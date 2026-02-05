/**
 * Band Opening Detector Service
 *
 * Monitors live spot data to detect when amateur radio bands open to
 * specific regions. Uses a sliding window approach to identify transitions
 * from closed to open conditions based on spot density.
 *
 * Key concepts:
 * - A "band opening" is detected when spot count for a band/region pair
 *   jumps from < 2 to >= 5 spots within a 3-minute window
 * - Openings persist until 10 minutes pass without supporting spots
 * - Region = continent code (NA, EU, AS, AF, SA, OC) derived from callsigns
 */

import type { LiveSpot } from "@/types/livespot";
import { getBandFromFrequency } from "@/lib/api/dxcluster";
import { getContinent, type Continent } from "@/lib/utils/multipliers";

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a detected band opening between two regions.
 */
export interface BandOpening {
  /** Unique identifier for this opening */
  id: string;
  /** Band designation (e.g., "10m", "6m") */
  band: string;
  /** Source region continent code */
  fromRegion: string;
  /** Destination region continent code */
  toRegion: string;
  /** Timestamp when the opening was first detected */
  detectedAt: number;
  /** Number of spots supporting this opening */
  spotCount: number;
  /** Average SNR of supporting spots */
  averageSNR: number;
  /** Duration in seconds since detection */
  duration: number;
  /** Whether the opening is still active */
  isActive: boolean;
}

/**
 * Priority level for band opening notifications.
 * Rarer band openings receive higher priority.
 */
export type BandOpeningPriority = "critical" | "high" | "normal" | "info";

// ============================================================================
// Constants
// ============================================================================

/** Sliding window duration in milliseconds (5 minutes) */
const WINDOW_MS = 5 * 60 * 1000;

/** Minimum spots to trigger an opening detection */
const OPENING_THRESHOLD = 5;

/** Time window in ms for spots to accumulate before declaring an opening (3 min) */
const DETECTION_WINDOW_MS = 3 * 60 * 1000;

/** Time without supporting spots before closing an opening (10 min) */
const CLOSING_TIMEOUT_MS = 10 * 60 * 1000;

/** Maximum number of active openings to track (prevent memory issues) */
const MAX_ACTIVE_OPENINGS = 50;

// ============================================================================
// Internal types
// ============================================================================

/** Key for a band/region-pair bucket */
type BucketKey = string;

/** A timestamped spot record within a sliding window bucket */
interface WindowEntry {
  timestamp: number;
  snr: number | null;
}

/** Tracks the state of a single band/region-pair for opening detection */
interface BucketState {
  /** Spots within the current sliding window */
  entries: WindowEntry[];
  /** Whether we have already detected an opening for this bucket */
  openingDetected: boolean;
  /** Timestamp of the last spot in this bucket */
  lastSpotAt: number;
  /** Peak spot count seen in any detection window */
  peakCount: number;
}

/** Subscriber callback type */
type BandOpeningCallback = (opening: BandOpening) => void;

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Create a unique key for a band + region pair.
 */
function makeBucketKey(
  band: string,
  fromRegion: string,
  toRegion: string,
): BucketKey {
  // Normalize ordering so NA->EU and EU->NA are the same bucket
  const regions = [fromRegion, toRegion].sort();
  return `${band}:${regions[0]}-${regions[1]}`;
}

/**
 * Generate a unique opening ID.
 */
function generateOpeningId(
  band: string,
  fromRegion: string,
  toRegion: string,
): string {
  return `opening_${band}_${fromRegion}_${toRegion}_${Date.now()}`;
}

/**
 * Extract continent codes from a spot's spotter and DX callsigns.
 * Returns null if either continent cannot be determined.
 */
function extractRegions(
  spot: LiveSpot,
): { from: Continent; to: Continent } | null {
  const fromContinent = getContinent(spot.spotter);
  const toContinent = getContinent(spot.dx);

  if (!fromContinent || !toContinent) return null;
  // Skip same-region spots as they don't indicate an "opening"
  if (fromContinent === toContinent) return null;

  return { from: fromContinent, to: toContinent };
}

// ============================================================================
// Band Opening Detector Class
// ============================================================================

/**
 * Monitors live spot feeds to detect band openings to specific regions.
 *
 * Usage:
 * ```ts
 * const detector = new BandOpeningDetector();
 *
 * // Subscribe to new openings
 * const unsub = detector.subscribe((opening) => {
 *   console.log(`${opening.band} opened to ${opening.toRegion}!`);
 * });
 *
 * // Feed spots periodically
 * detector.update(newSpots);
 *
 * // Check current openings
 * const openings = detector.getCurrentOpenings();
 *
 * // Cleanup
 * unsub();
 * detector.destroy();
 * ```
 */
export class BandOpeningDetector {
  /** Sliding window buckets keyed by band:region-pair */
  private buckets = new Map<BucketKey, BucketState>();
  /** Currently active band openings */
  private activeOpenings = new Map<BucketKey, BandOpening>();
  /** Subscriber callbacks */
  private subscribers: Set<BandOpeningCallback> = new Set();
  /** Cleanup interval handle */
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Periodic cleanup of stale data every 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 30_000);
  }

  /**
   * Feed new spots into the detector.
   * Call this whenever new spot data arrives.
   */
  update(spots: LiveSpot[]): void {
    const now = Date.now();

    for (const spot of spots) {
      const regions = extractRegions(spot);
      if (!regions) continue;

      const band = spot.band || getBandFromFrequency(spot.frequency);
      if (band === "Unknown") continue;

      const key = makeBucketKey(band, regions.from, regions.to);
      const spotTime =
        spot.time instanceof Date ? spot.time.getTime() : Number(spot.time);

      // Skip spots older than the sliding window
      if (now - spotTime > WINDOW_MS) continue;

      // Get or create bucket
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = {
          entries: [],
          openingDetected: false,
          lastSpotAt: 0,
          peakCount: 0,
        };
        this.buckets.set(key, bucket);
      }

      // Add entry
      bucket.entries.push({
        timestamp: spotTime,
        snr: spot.snr ?? null,
      });
      bucket.lastSpotAt = Math.max(bucket.lastSpotAt, spotTime);
    }

    // After processing all spots, evaluate for openings
    this.evaluate(now);
  }

  /**
   * Get all currently active band openings.
   */
  getCurrentOpenings(): BandOpening[] {
    const now = Date.now();
    const openings: BandOpening[] = [];

    for (const opening of this.activeOpenings.values()) {
      if (opening.isActive) {
        openings.push({
          ...opening,
          duration: Math.round((now - opening.detectedAt) / 1000),
        });
      }
    }

    // Sort by detection time (newest first)
    return openings.sort((a, b) => b.detectedAt - a.detectedAt);
  }

  /**
   * Subscribe to band opening events.
   * Returns an unsubscribe function.
   */
  subscribe(callback: BandOpeningCallback): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Clean up resources. Call when the detector is no longer needed.
   */
  destroy(): void {
    if (this.cleanupInterval != null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.subscribers.clear();
    this.buckets.clear();
    this.activeOpenings.clear();
  }

  // ==========================================================================
  // Private methods
  // ==========================================================================

  /**
   * Evaluate all buckets for opening/closing transitions.
   */
  private evaluate(now: number): void {
    for (const [key, bucket] of this.buckets) {
      // Prune expired entries from sliding window
      bucket.entries = bucket.entries.filter(
        (e) => now - e.timestamp <= WINDOW_MS,
      );

      const windowCount = bucket.entries.length;
      bucket.peakCount = Math.max(bucket.peakCount, windowCount);

      // Check for opening detection
      if (!bucket.openingDetected && windowCount >= OPENING_THRESHOLD) {
        // Verify spots arrived within the detection window
        const recentEntries = bucket.entries.filter(
          (e) => now - e.timestamp <= DETECTION_WINDOW_MS,
        );

        if (recentEntries.length >= OPENING_THRESHOLD) {
          this.detectOpening(key, bucket, now);
        }
      }

      // Check for opening closure
      if (bucket.openingDetected) {
        const existingOpening = this.activeOpenings.get(key);
        if (existingOpening) {
          // Update spot count
          existingOpening.spotCount = windowCount;
          existingOpening.duration = Math.round(
            (now - existingOpening.detectedAt) / 1000,
          );

          // Update average SNR
          const snrEntries = bucket.entries.filter((e) => e.snr != null);
          if (snrEntries.length > 0) {
            existingOpening.averageSNR =
              Math.round(
                (snrEntries.reduce((sum, e) => sum + (e.snr ?? 0), 0) /
                  snrEntries.length) *
                  10,
              ) / 10;
          }

          // Close if no spots for the timeout period
          if (now - bucket.lastSpotAt > CLOSING_TIMEOUT_MS) {
            existingOpening.isActive = false;
            bucket.openingDetected = false;
          }
        }
      }
    }
  }

  /**
   * Create a new band opening record and notify subscribers.
   */
  private detectOpening(
    key: BucketKey,
    bucket: BucketState,
    now: number,
  ): void {
    // Guard against too many active openings
    if (this.activeOpenings.size >= MAX_ACTIVE_OPENINGS) {
      // Remove oldest inactive opening
      let oldestKey: BucketKey | null = null;
      let oldestTime = Infinity;
      for (const [k, o] of this.activeOpenings) {
        if (!o.isActive && o.detectedAt < oldestTime) {
          oldestTime = o.detectedAt;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        this.activeOpenings.delete(oldestKey);
      }
    }

    // Parse key to extract band and regions
    const [band, regionPair] = key.split(":");
    const [fromRegion, toRegion] = regionPair.split("-");

    // Calculate average SNR
    const snrEntries = bucket.entries.filter((e) => e.snr != null);
    const avgSNR =
      snrEntries.length > 0
        ? Math.round(
            (snrEntries.reduce((sum, e) => sum + (e.snr ?? 0), 0) /
              snrEntries.length) *
              10,
          ) / 10
        : 0;

    const opening: BandOpening = {
      id: generateOpeningId(band, fromRegion, toRegion),
      band,
      fromRegion,
      toRegion,
      detectedAt: now,
      spotCount: bucket.entries.length,
      averageSNR: avgSNR,
      duration: 0,
      isActive: true,
    };

    bucket.openingDetected = true;
    this.activeOpenings.set(key, opening);

    // Notify subscribers
    for (const callback of this.subscribers) {
      try {
        callback(opening);
      } catch {
        // Ignore subscriber errors to prevent cascade failures
      }
    }
  }

  /**
   * Periodic cleanup of stale buckets and inactive openings.
   */
  private cleanup(): void {
    const now = Date.now();

    // Remove empty buckets
    for (const [key, bucket] of this.buckets) {
      bucket.entries = bucket.entries.filter(
        (e) => now - e.timestamp <= WINDOW_MS,
      );
      if (bucket.entries.length === 0 && !bucket.openingDetected) {
        this.buckets.delete(key);
      }
    }

    // Remove old inactive openings (older than 30 minutes)
    const OLD_OPENING_MS = 30 * 60 * 1000;
    for (const [key, opening] of this.activeOpenings) {
      if (!opening.isActive && now - opening.detectedAt > OLD_OPENING_MS) {
        this.activeOpenings.delete(key);
        this.buckets.delete(key);
      }
    }
  }
}

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Get the notification priority for a band opening.
 * Rarer band openings are more exciting and receive higher priority.
 *
 * @param band - Band designation (e.g., "6m", "10m", "20m")
 * @returns Priority level for notification/alert purposes
 *
 * @example
 * ```ts
 * getBandOpeningPriority("6m")   // "critical"
 * getBandOpeningPriority("10m")  // "high"
 * getBandOpeningPriority("15m")  // "normal"
 * getBandOpeningPriority("20m")  // "info"
 * ```
 */
export function getBandOpeningPriority(band: string): BandOpeningPriority {
  switch (band) {
    case "6m":
      return "critical"; // Rare, exciting -- sporadic E or F2

    case "10m":
    case "12m":
      return "high"; // Upper HF bands, often closed

    case "15m":
    case "17m":
      return "normal"; // Mid bands, interesting but not rare

    case "20m":
    case "40m":
    case "80m":
    case "160m":
    case "30m":
    case "60m":
      return "info"; // Lower bands, usually open or closing is expected

    default:
      return "info";
  }
}

/**
 * Region name lookup for human-readable messages.
 */
const REGION_NAMES: Record<string, string> = {
  NA: "North America",
  SA: "South America",
  EU: "Europe",
  AF: "Africa",
  AS: "Asia",
  OC: "Oceania",
};

/**
 * Format a band opening into a human-readable notification message.
 *
 * @param opening - The band opening to describe
 * @returns Human-readable description string
 *
 * @example
 * ```ts
 * formatBandOpeningMessage(opening)
 * // "10m just opened to JA! 8 spots in 2 minutes. Average SNR: -6 dB"
 * ```
 */
export function formatBandOpeningMessage(opening: BandOpening): string {
  const fromName = REGION_NAMES[opening.fromRegion] || opening.fromRegion;
  const toName = REGION_NAMES[opening.toRegion] || opening.toRegion;
  const durationMin = Math.round(opening.duration / 60);

  const parts: string[] = [];

  if (opening.duration < 60) {
    parts.push(`${opening.band} just opened ${fromName} to ${toName}!`);
  } else {
    parts.push(
      `${opening.band} open ${fromName} to ${toName} for ${durationMin} min.`,
    );
  }

  parts.push(`${opening.spotCount} spots`);

  if (opening.duration > 0 && opening.duration < 300) {
    const minutes = Math.max(1, durationMin);
    parts[parts.length - 1] +=
      ` in ${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }

  parts[parts.length - 1] += ".";

  if (opening.averageSNR !== 0) {
    parts.push(`Average SNR: ${opening.averageSNR} dB`);
  }

  return parts.join(" ");
}
