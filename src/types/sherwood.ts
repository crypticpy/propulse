export interface SherwoodReceiverEntry {
  /** Stable key for matching/deduping (not guaranteed globally unique across all sources) */
  key: string;
  manufacturer: string;
  model: string;
  /** Optional row metadata parsed from the table */
  addedDate?: string;
  /** Sherwood table: Noise Floor (dBm) */
  noiseFloorDbm?: number;
  /** Sherwood table: Sensitivity (uV) */
  sensitivityUv?: number;
  /** Sherwood table: 100kHz Blocking (dB) */
  blockingDb?: number;
  /** Sherwood table: Dynamic Range Wide Spaced (dB) */
  dynamicRangeWideDb?: number;
  /** Sherwood table: Dynamic Range Narrow Spaced (dB) */
  dynamicRangeNarrowDb?: number;
  /** Sherwood table: spacing for wide/narrow DR columns (kHz) */
  wideSpacingKhz?: number;
  narrowSpacingKhz?: number;
}

