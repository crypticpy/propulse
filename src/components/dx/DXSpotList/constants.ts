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
