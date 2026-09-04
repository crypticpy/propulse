import { formatKHz as formatKHzCore } from "@/lib/dxwizard";
import {
  formatPathBearing as formatPathBearingCore,
  formatPathDistanceKm as formatPathDistanceKmCore,
} from "@/lib/dxwizard";
import type { PropagationMode } from "@/lib/utils/propagationModes";

export const formatKHz = formatKHzCore;
export const formatPathBearing = formatPathBearingCore;
export const formatPathDistanceKm = formatPathDistanceKmCore;

const PROP_MODE_LABELS: Record<PropagationMode, string> = {
  F2: "F2",
  sporadic_E: "Es",
  TEP: "TEP",
  NVIS: "NVIS",
  gray_line: "Gray line",
  long_path: "Long path",
  backscatter: "Backscatter",
  ground_wave: "Ground wave",
  unknown: "Unknown",
};

export function getPropagationModeLabel(mode: PropagationMode): string {
  return PROP_MODE_LABELS[mode] ?? mode;
}
