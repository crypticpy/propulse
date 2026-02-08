/**
 * Radio Port Definitions
 *
 * Static port metadata for radio equipment in the Station Builder Lab.
 * Used to render port labels on radio nodes in the signal chain canvas.
 */

export interface RadioPort {
  /** Port display label (e.g., "TX/RX", "RX", "PWR") */
  label: string;
  /** Hex color for the port pill */
  color: string;
}

/** Default ports for HF transceivers */
export const DEFAULT_RADIO_PORTS: RadioPort[] = [
  { label: "TX/RX", color: "#F97316" },
  { label: "RX", color: "#22C55E" },
];

/**
 * Get port definitions for a radio.
 * Currently returns static defaults for all radios.
 * Future: per-radio overrides based on equipment ID.
 */
export function getRadioPorts(_equipmentId?: string): RadioPort[] {
  return DEFAULT_RADIO_PORTS;
}
