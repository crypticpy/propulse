/**
 * SDR UI Primitives — Reusable presentational components with zero store dependencies.
 */

// Components
export { FrequencyDisplay } from "./FrequencyDisplay";
export type { FrequencyDisplayProps } from "./FrequencyDisplay";

export { SmeterBar } from "./SmeterBar";
export type { SmeterBarProps } from "./SmeterBar";

export { DspBadge } from "./DspBadge";
export type { DspBadgeProps } from "./DspBadge";

export { RadioBadge } from "./RadioBadge";
export type { RadioBadgeProps } from "./RadioBadge";

export { GainSlider } from "./GainSlider";
export type { GainSliderProps } from "./GainSlider";

// Utilities
export {
  getModeGroup,
  getModeTextClass,
  getModeBgClass,
  getModeAccentCss,
  MODE_GROUPS,
} from "@/lib/sdr/modeColors";
export type { ModeGroup } from "@/lib/sdr/modeColors";
