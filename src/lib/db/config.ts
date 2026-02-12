/**
 * IndexedDB configuration constants for PropUlse
 * Defines database name, version, store names, and capacity limits
 */

/**
 * Database configuration object
 * Controls all IndexedDB settings for the application
 */
export const DB_CONFIG = {
  /** Database name in IndexedDB */
  name: "propulse-db",
  /** Schema version - increment when modifying store structure */
  version: 4,
  /** Object store names */
  stores: {
    logEntries: "logEntries",
    alertRules: "alertRules",
    alertHistory: "alertHistory",
  },
  /** Maximum entries per store */
  limits: {
    logEntries: 50000,
    alertRules: 100,
    alertHistory: 1000,
  },
  /** Percentage of limit at which cleanup runs (0.9 = 90%) */
  cleanupThreshold: 0.9,
  /** Percentage of entries to remove during cleanup (0.1 = 10%) */
  cleanupPercentage: 0.1,
} as const;

/** Type for store names */
export type StoreName = keyof typeof DB_CONFIG.stores;
