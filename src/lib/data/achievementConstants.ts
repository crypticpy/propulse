/**
 * Shared constants for achievement badge rendering.
 *
 * Used by AchievementGrid and AchievementDetail to avoid duplication
 * of tier colors, tier labels, and icon-to-emoji mappings.
 */

import type { AchievementTier } from "@/types/achievement";

export const TIER_COLORS: Record<AchievementTier, string> = {
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold: "#FFD700",
  platinum: "#E5E4E2",
};

export const TIER_LABELS: Record<AchievementTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

export const ICON_EMOJI: Record<string, string> = {
  radio: "\uD83D\uDCFB",
  calendar: "\uD83D\uDCC5",
  "radio-tower": "\uD83D\uDCE1",
  settings: "\u2699\uFE0F",
  zap: "\u26A1",
  flame: "\uD83D\uDD25",
  globe: "\uD83C\uDF0D",
  "check-circle": "\u2705",
  users: "\uD83D\uDC65",
  map: "\uD83D\uDDFA\uFE0F",
  "map-pin": "\uD83D\uDCCD",
  compass: "\uD83E\uDDED",
  trophy: "\uD83C\uDFC6",
  "message-circle": "\uD83D\uDCAC",
  "heart-handshake": "\uD83E\uDD1D",
  moon: "\uD83C\uDF19",
  plane: "\u2708\uFE0F",
};
