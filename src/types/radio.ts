/**
 * Radio Equipment Types for Propulse
 * Types for amateur radio transceiver specifications and performance metrics
 */

/**
 * Sherwood-style receiver performance metrics
 * Based on the Sherwood Engineering receiver test data
 */
export interface ReceiverPerformance {
  /** Reciprocal Mixing Dynamic Range in dB (higher is better) */
  rmdr: number;
  /** 3rd Order IMD Dynamic Range in dB (higher is better) */
  imdr3: number;
  /** Blocking Gain Compression in dB (higher is better) */
  blockingGain: number;
  /** Sensitivity in microvolts (lower is better) */
  sensitivity: number;
  /**
   * Optional receive noise floor in dBm (bandwidth/conditions dependent).
   * When present, treat as a relative indicator rather than an absolute value.
   */
  noiseFloorDbm?: number;
  /**
   * Optional phase noise measurements (dBc/Hz) at common offsets.
   * Example keys: `"2kHz"`, `"10kHz"`, `"20kHz"`.
   */
  phaseNoiseDbcHz?: Record<string, number>;
  /** Optional 3rd-order intercept point in dBm (higher is better) */
  ip3Dbm?: number;
}

/**
 * Optional transmit performance metrics (when measured data is available)
 */
export interface TransmitPerformance {
  /**
   * Typical SSB/2-tone IMD3 (dB). More negative is better.
   * Example: -30 dB (good), -40 dB (excellent).
   */
  imd3Db?: number;
  /** Spurious/harmonic suppression in dBc (higher is better) */
  spuriousDbc?: number;
  /** Notes about ALC/compression behavior and clean TX setup */
  notes?: string;
}

/**
 * Radio data source attribution
 */
export interface RadioDataSource {
  name: string;
  url?: string;
  retrievedAt?: string;
  license?: string;
  notes?: string;
}

/**
 * Radio transceiver equipment specification
 */
export interface RadioEquipment {
  /** Unique identifier for the radio */
  id: string;
  /**
   * Optional user-facing label for custom radios (e.g., "My Portable 100W HF Rig").
   * When absent, UI should fall back to `${manufacturer} ${model}`.
   */
  displayName?: string;
  /** Manufacturer name (e.g., 'Icom', 'Yaesu', 'Kenwood', 'Elecraft') */
  manufacturer: string;
  /** Model number/name (e.g., 'IC-7300', 'FT-991A', 'TS-890S') */
  model: string;
  /** Receiver performance metrics */
  receiver: ReceiverPerformance;
  /** Optional transmit performance metrics */
  transmit?: TransmitPerformance;
  /**
   * Optional tested receiver specs from independent lab testing (e.g., Sherwood Engineering).
   * When present, these measurements supersede factory specs for receiver performance calculations.
   * The `receiver` field contains factory/claimed specs; `testedSpecs` contains verified measurements.
   */
  testedSpecs?: ReceiverPerformance;
  /** Optional data source attribution */
  sources?: RadioDataSource[];
  /** Maximum transmit power in watts */
  maxPower: number;
  /** Minimum transmit power in watts (for QRP operation) */
  minPower: number;
  /** Supported operating modes */
  modes: RadioMode[];
  /** Amateur bands covered by this radio */
  bands: string[];
  /** Radio category/tier for UI grouping */
  tier: RadioTier;
  /** Year of release (for reference) */
  releaseYear?: number;
}

/**
 * Operating modes supported by transceivers
 */
export type RadioMode =
  | "CW"
  | "SSB"
  | "AM"
  | "FM"
  | "FT8"
  | "FT4"
  | "RTTY"
  | "PSK31"
  | "JS8"
  | "DATA";

/**
 * Radio performance tier categories
 */
export type RadioTier =
  | "entry" // Entry-level / budget radios
  | "midrange" // Mid-range / popular enthusiast radios
  | "highend" // High-end / contest-grade radios
  | "flagship"; // Top-tier / flagship models

/**
 * User's saved radio instance (a specific owned radio)
 *
 * This is intentionally an *instance* type (not just an equipment ID),
 * so we can support multiple owned radios of the same model and attach
 * ownership/maintenance metadata (purchase date, firmware, wiring, etc.).
 */
export interface UserRadio {
  /** Unique identifier for this user-owned radio instance */
  id: string;
  /** Reference to the base radio equipment ID (DB or custom equipment) */
  equipmentId: string;
  /** User's nickname for this specific radio instance */
  nickname?: string;
  /** Custom power limit (e.g., for QRP contests or license restrictions) */
  customPowerLimit?: number;
  /** Date added to collection */
  addedAt: string;
  /** Optional purchase date (ISO-8601 date or datetime string) */
  purchaseDate?: string;
  /** Optional purchase location (freeform) */
  purchaseLocation?: string;
  /** Optional firmware revision string */
  firmwareRevision?: string;
  /** Optional wiring configuration notes (interfaces, CAT, audio, PTT, etc.) */
  wiringConfiguration?: string;
  /** Optional additional notes */
  notes?: string;
  /**
   * Optional per-radio override for receiver spec source.
   * - "global": use user preference `preferTestedSpecs`
   * - "factory": always use manufacturer/factory specs
   * - "tested": always use lab-tested (Sherwood) specs when available
   */
  specPreference?: "global" | "factory" | "tested";
}

/**
 * Legacy persisted user radio shape (v6 and earlier)
 * @deprecated Only used for migration.
 */
export interface LegacyUserRadio {
  radioId: string;
  nickname?: string;
  customPowerLimit?: number;
  addedAt: string;
}

/**
 * Calculate a receiver quality score (0-100) based on Sherwood metrics
 * Higher is better
 */
export function calculateReceiverScore(receiver: ReceiverPerformance): number {
  // Weighted scoring based on importance for HF operation
  // RMDR and IMDR3 are most important for crowded band conditions
  const rmdrScore = Math.min(100, (receiver.rmdr / 110) * 100); // 110dB is excellent
  const imdr3Score = Math.min(100, (receiver.imdr3 / 105) * 100); // 105dB is excellent
  const blockingScore = Math.min(100, (receiver.blockingGain / 140) * 100); // 140dB is excellent
  const sensitivityScore = Math.min(100, (0.2 / receiver.sensitivity) * 100); // 0.2uV is excellent

  // Weighted average
  return Math.round(
    rmdrScore * 0.35 +
      imdr3Score * 0.35 +
      blockingScore * 0.15 +
      sensitivityScore * 0.15,
  );
}

/**
 * Get a tier label for display
 */
export function getTierLabel(tier: RadioTier): string {
  const labels: Record<RadioTier, string> = {
    entry: "Entry Level",
    midrange: "Mid-Range",
    highend: "High-End",
    flagship: "Flagship",
  };
  return labels[tier];
}

/**
 * Get tier color for UI display
 */
export function getTierColor(tier: RadioTier): string {
  const colors: Record<RadioTier, string> = {
    entry: "#6ee7b7", // green
    midrange: "#60a5fa", // blue
    highend: "#a78bfa", // purple
    flagship: "#fbbf24", // gold
  };
  return colors[tier];
}
