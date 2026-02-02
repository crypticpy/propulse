/**
 * Band plan types for PropSphere Professional
 * Types for ITU region allocations and amateur radio frequency regulations
 */

import type { ITURegion, LicenseClass } from "./user";

// Re-export shared types for consumers of this module
export type { ITURegion, LicenseClass } from "./user";

/**
 * Operating mode categories for band segment allocations
 * Defines permitted emission types within frequency segments
 */
export type BandMode = "CW" | "PHONE" | "DATA" | "IMAGE" | "RTTY" | "AM" | "FM";

/**
 * Band segment allocation within an amateur band
 * Defines permitted uses for a specific frequency range
 */
export interface BandSegment {
  /** Segment start frequency in kHz */
  startKHz: number;
  /** Segment end frequency in kHz */
  endKHz: number;
  /** Permitted operating modes within this segment */
  modes: BandMode[];
  /** License classes authorized to operate in this segment */
  licenseClasses: LicenseClass[];
  /** Maximum permitted transmit power in watts */
  maxPowerWatts: number;
  /** Optional notes about special conditions or restrictions */
  notes?: string;
  /** True if this is a primary allocation, false for secondary */
  isPrimary: boolean;
}

/**
 * Complete band plan for an amateur band in a specific ITU region
 * Contains all segment allocations and regulatory information
 */
export interface BandPlan {
  /** Band designator (e.g., '20m', '40m', '2m') */
  band: string;
  /** ITU region this band plan applies to */
  region: ITURegion;
  /** Human-readable band name (e.g., '20 Meter Band', '2 Meter Band') */
  name: string;
  /** Band start frequency in MHz */
  startMHz: number;
  /** Band end frequency in MHz */
  endMHz: number;
  /** Array of frequency segments with their allocations */
  segments: BandSegment[];
}

/**
 * Result of a regulatory compliance check
 * Indicates whether operation at a specific frequency is permitted
 */
export interface RegulatoryStatus {
  /** True if operation is allowed at the requested frequency */
  allowed: boolean;
  /** Array of warning messages (e.g., power restrictions, mode limitations) */
  warnings: string[];
  /** Suggested alternative frequency in kHz if current frequency is not allowed */
  suggestedFrequency?: number;
}
