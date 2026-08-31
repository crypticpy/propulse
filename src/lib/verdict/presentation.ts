import type { CanonicalLadderRow } from "@/hooks/useBandLadder";
import type { ActivityLevel, ActivityTrend } from "@/lib/utils/bandActivity";
import type { LadderState } from "@/lib/verdict/ladder";

/** Shared BH2/BH3 presentation vocabulary used by Home and PropSphere. */
export const LADDER_LABEL: Record<LadderState, string> = {
  closed: "Closed",
  forecast: "Forecast",
  stirring: "Stirring",
  verified: "Verified Open",
  hot: "Hot",
};

export const LADDER_TEXT_CLASSES: Record<LadderState, string> = {
  hot: "text-plasma-orange",
  verified: "text-signal-green",
  stirring: "text-caution-amber",
  forecast: "text-signal-green/70",
  closed: "text-gray-500",
};

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  quiet: "Quiet",
  normal: "Normal",
  busy: "Busy",
  exceptional: "Exceptional",
};

export const ACTIVITY_TEXT_CLASSES: Record<ActivityLevel, string> = {
  quiet: "text-gray-500",
  normal: "text-white/60",
  busy: "text-caution-amber",
  exceptional: "text-plasma-orange",
};

export const TREND_ARROW: Record<ActivityTrend, string> = {
  rising: "↗",
  steady: "→",
  falling: "↘",
};

export const MODE_BADGE_LABEL: Record<string, string> = {
  cw: "CW",
  digital: "DIG",
  phone: "PH",
};

/** Ladder ticks every ~5 min; a lead time older than this is stale noise. */
const LEAD_MAX_AGE_MIN = 20;

/**
 * BH3 lead-time minutes, aged from the tick that computed them: the stored
 * value counts from `updated_at`, not from render time. Returns null when
 * absent, already elapsed, or when the row is too stale to trust.
 */
export function leadMinutes(
  canonical: CanonicalLadderRow,
  key: "opens_in_min" | "fades_in_min",
): number | null {
  const value = canonical.inputs[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const tickMs = Date.parse(canonical.updatedAt);
  if (!Number.isFinite(tickMs)) return null;
  const ageMin = Math.max(0, (Date.now() - tickMs) / 60_000);
  if (ageMin > LEAD_MAX_AGE_MIN) return null;
  const remaining = Math.round(value - ageMin);
  return remaining > 0 ? remaining : null;
}
export function formatLead(min: number): string {
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Dominant mode class of the 20-min deduplicated observations, if any. */
export function dominantModeClass(
  modeObs20m: Record<string, number> | undefined,
): string | null {
  if (!modeObs20m) return null;
  let best: string | null = null;
  let bestCount = 0;
  for (const [mode, count] of Object.entries(modeObs20m)) {
    if (!(mode in MODE_BADGE_LABEL)) continue;
    if (count > bestCount) {
      best = mode;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : null;
}
