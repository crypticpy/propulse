/**
 * Map Preset Configuration
 * Shared constants for layer preset display
 */

import type { PresetName } from "@/stores/mapStore";

export const PRESET_CONFIG: Record<
  PresetName,
  { label: string; description: string }
> = {
  "dx-hunter": {
    label: "DX Hunter",
    description: "Full visibility for DX with city lights",
  },
  contest: { label: "Contest", description: "Quick day/night reference" },
  vhf: { label: "VHF", description: "Terminator + Aurora for VHF ops" },
  emergency: {
    label: "Emergency",
    description: "All layers with labels for coordination",
  },
};
