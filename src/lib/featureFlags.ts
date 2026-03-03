/**
 * Feature Flag System
 *
 * Client-side feature gating based on subscription tier.
 * Server-authoritative: Stripe webhook → Supabase → profileSync → profileStore.
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
  /** Custom profile images / gear photos — pro (storage cost) */
  customImages: boolean;
  /** Per-user propagation modeling — pro (compute cost) */
  perUserPropModeling: boolean;
  /** Access to Mapbox/ESRI high-resolution satellite tiles (Pro only) */
  hdSatellite: boolean;
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
  customImages: false,
  perUserPropModeling: false,
  hdSatellite: false,
};

const PRO_FLAGS: FeatureFlags = {
  spotReplay: true,
  extendedHistory: true,
  contestWatch: true,
  gridGlow: true,
  ambientMode: true,
  savedWatchLimit: 20,
  densityMax: 200,
  customImages: true,
  perUserPropModeling: true,
  hdSatellite: true,
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
