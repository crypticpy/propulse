/**
 * Feature Flag System
 *
 * Lightweight client-side feature gating based on subscription tier.
 * No actual billing — just a flag on profileStore that can be toggled
 * from settings or future billing integration.
 */

import { useProfileStore } from "@/stores/profileStore";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SubscriptionTier = "free" | "pro";

export interface FeatureFlags {
  /** Spot replay from Supabase history — requires pro */
  spotReplay: boolean;
  /** 30-day vs 7-day replay window — requires pro */
  extendedHistory: boolean;
  /** Contest-aware watch presets — requires pro */
  contestWatch: boolean;
  /** Grid glow effects — free (visual delight) */
  gridGlow: boolean;
  /** Ambient mode in Pro view — free */
  ambientMode: boolean;
  /** Maximum number of saved watch presets */
  savedWatchLimit: number;
  /** Maximum arc density slider value */
  densityMax: number;
}

// ─── Flag Resolution ─────────────────────────────────────────────────────────

const FREE_FLAGS: FeatureFlags = {
  spotReplay: false,
  extendedHistory: false,
  contestWatch: false,
  gridGlow: true,
  ambientMode: true,
  savedWatchLimit: 5,
  densityMax: 100,
};

const PRO_FLAGS: FeatureFlags = {
  spotReplay: true,
  extendedHistory: true,
  contestWatch: true,
  gridGlow: true,
  ambientMode: true,
  savedWatchLimit: 20,
  densityMax: 200,
};

/**
 * Get feature flags for a given subscription tier.
 */
export function getFeatureFlags(tier: SubscriptionTier): FeatureFlags {
  return tier === "pro" ? PRO_FLAGS : FREE_FLAGS;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * React hook that reads the current subscription tier from profileStore
 * and returns the resolved feature flags.
 */
export function useFeatureFlags(): FeatureFlags {
  const tier = useProfileStore((s) => s.subscriptionTier);
  return getFeatureFlags(tier);
}
