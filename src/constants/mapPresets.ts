/**
 * Map Preset Configuration
 * Shared constants for layer preset display
 */

import type { PresetName } from "@/stores/mapStore";

export const PRESET_CONFIG: Record<
  PresetName,
  {
    label: string;
    shortLabel: string;
    description: string;
    /** SVG path(s) for the preset icon (24x24 viewBox) */
    iconPath: string;
    /** Accent color when active */
    activeColor: string;
    /** Brief summary of what layers are toggled on */
    layerSummary: string;
  }
> = {
  "dx-hunter": {
    label: "DX Hunter",
    shortLabel: "DX",
    description: "Maximum propagation awareness for chasing DX",
    iconPath: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    activeColor: "plasma-orange",
    layerSummary: "Day/Night + Greyline + MUF + Spots + Lights",
  },
  contest: {
    label: "Contest",
    shortLabel: "CTX",
    description: "Minimal clutter for fast contest operating",
    iconPath:
      "M6 9H4.5a2.5 2.5 0 010-5C6 4 6 2 12 2s6 2 7.5 2a2.5 2.5 0 010 5H18m-12 0v7a4 4 0 004 4h4a4 4 0 004-4V9M6 9h12",
    activeColor: "caution-amber",
    layerSummary: "Day/Night + Spots only",
  },
  vhf: {
    label: "VHF/UHF",
    shortLabel: "VHF",
    description: "Aurora scatter, satellites & VHF propagation",
    iconPath:
      "M9.348 14.651a3.75 3.75 0 010-5.302m5.302 0a3.75 3.75 0 010 5.302m-7.424 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.788m13.788 0c3.808 3.808 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
    activeColor: "cosmic-cyan",
    layerSummary: "Day/Night + Aurora + Satellites",
  },
  emergency: {
    label: "Emergency",
    shortLabel: "EMRG",
    description: "NVIS coverage, labels & lights for ARES/RACES",
    iconPath:
      "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
    activeColor: "alert-red",
    layerSummary: "Day/Night + Greyline + NVIS + Lights + Labels",
  },
};
