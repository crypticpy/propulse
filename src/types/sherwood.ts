export interface SherwoodReceiverEntry {
  /** Stable key for matching/deduping (not guaranteed globally unique across all sources) */
  key: string;
  /** Row index in the Sherwood table at import time (best-effort) */
  rowIndex: number;
  manufacturer: string;
  model: string;
  /** Raw device cell text (useful for debugging variants and S/N notes) */
  rawDeviceText?: string;
  /** Sherwood table: Noise Floor (dBm) */
  noiseFloorDbm?: number;
  noiseFloorDbmSamples?: number[];
  /** Sherwood table: Sensitivity (uV) */
  sensitivityUv?: number;
  sensitivityUvSamples?: number[];
  /** Sherwood table: 100kHz Blocking (dB) */
  blockingDb?: number;
  blockingDbSamples?: number[];
  /** Sherwood table: Dynamic Range Wide Spaced (dB) */
  dynamicRangeWideDb?: number;
  dynamicRangeWideDbSamples?: number[];
  /** Sherwood table: Dynamic Range Narrow Spaced (dB) */
  dynamicRangeNarrowDb?: number;
  dynamicRangeNarrowDbSamples?: number[];
  /** Sherwood table: spacing for wide/narrow DR columns (kHz) */
  wideSpacingKhz?: number;
  wideSpacingKhzSamples?: number[];
  narrowSpacingKhz?: number;
  narrowSpacingKhzSamples?: number[];
}
