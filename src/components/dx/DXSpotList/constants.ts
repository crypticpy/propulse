/**
 * DXSpotList Constants
 *
 * Static values and configuration options for the DXSpotList component family.
 */

/**
 * Time range options in minutes for filtering spots by age
 */
export const TIME_RANGE_OPTIONS = [
  { value: 5, label: "5m" },
  { value: 15, label: "15m" },
  { value: 30, label: "30m" },
  { value: 60, label: "1h" },
  { value: 120, label: "2h" },
] as const;

/**
 * Type for time range option values
 */
export type TimeRangeValue = (typeof TIME_RANGE_OPTIONS)[number]["value"];

/**
 * Maximum number of band presets a user can save
 */
export const MAX_BAND_PRESETS = 5;

/**
 * Length of grid prefix for display/filtering (e.g., "EM73" from "EM73vk")
 */
export const GRID_PREFIX_LENGTH = 4;

/**
 * Duration in ms for highlight animation after scroll-to-selected
 */
export const HIGHLIGHT_TIMEOUT_MS = 1500;

/**
 * Duration in ms for "copied" feedback state
 */
export const COPY_FEEDBACK_TIMEOUT_MS = 1500;

/**
 * Interval in ms for reloading alert rules
 */
export const ALERT_RULES_RELOAD_INTERVAL_MS = 30000;

/**
 * Maximum character length for preset names
 */
export const MAX_PRESET_NAME_LENGTH = 20;

/**
 * Maximum character length for grid locator input
 */
export const MAX_GRID_INPUT_LENGTH = 6;
