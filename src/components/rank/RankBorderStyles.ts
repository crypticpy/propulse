/**
 * RankBorderStyles -- Pure CSS utility functions for rank-driven card styling.
 *
 * Returns CSS style objects and class strings for borders, corner brackets,
 * holographic sheen, and other rank-progressive visual treatments.
 * No React, no JSX, no hooks, no side effects -- pure functions only.
 */

import type { CSSProperties } from "react";
import type { RankTier } from "@/types/rank";
import { RANK_COLORS, isRankAtLeast } from "@/lib/data/rankConstants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Append a 2-digit hex alpha to a hex color string (strips existing alpha). */
function withAlpha(hex: string, alpha: number): string {
  const base = hex.length === 9 ? hex.slice(0, 7) : hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${base}${a}`;
}

// ---------------------------------------------------------------------------
// 1. getRankBorderStyle
// ---------------------------------------------------------------------------

/**
 * Returns inline styles for the card's outer border.
 * Progressively more elaborate per rank tier.
 */
export function getRankBorderStyle(
  rank: RankTier,
  accentHex: string,
): CSSProperties {
  switch (rank) {
    case "novice":
      return {
        border: `2px solid ${withAlpha(accentHex, 0.25)}`,
      };

    case "apprentice":
      return {
        border: `2px solid ${withAlpha(accentHex, 0.4)}`,
      };

    case "journeyman":
      return {
        border: `2px solid ${withAlpha(accentHex, 0.4)}`,
        boxShadow: `0 0 12px ${withAlpha(accentHex, 0.06)}`,
      };

    case "expert":
      return {
        border: `2px solid ${withAlpha(accentHex, 0.5)}`,
        boxShadow: `inset 0 0 20px ${withAlpha(accentHex, 0.03)}`,
      };

    case "master":
      return {
        border: `2px solid ${withAlpha(accentHex, 0.55)}`,
        boxShadow: [
          `0 0 16px ${withAlpha(accentHex, 0.12)}`,
          `0 0 2px ${withAlpha("#FFD700", 0.15)}`,
          `inset 0 0 20px ${withAlpha(accentHex, 0.04)}`,
        ].join(", "),
      };

    case "legendary":
      return {
        border: `2px solid ${accentHex}`,
        boxShadow: [
          `0 0 20px ${withAlpha("#FFD700", 0.2)}`,
          `0 0 4px ${withAlpha(accentHex, 0.3)}`,
          `inset 0 0 24px ${withAlpha(accentHex, 0.06)}`,
        ].join(", "),
      };

    case "ethereal":
      return {
        border: `2px solid ${accentHex}`,
        boxShadow: [
          `0 0 24px ${withAlpha(accentHex, 0.2)}`,
          `0 0 48px ${withAlpha("#38BDF8", 0.08)}`,
          `0 0 48px ${withAlpha("#A78BFA", 0.08)}`,
          `inset 0 0 30px ${withAlpha(accentHex, 0.05)}`,
        ].join(", "),
      };
  }
}

// ---------------------------------------------------------------------------
// 2. getCornerBracketFilter
// ---------------------------------------------------------------------------

/**
 * Returns a CSS `filter` string for the decorative corner bracket elements.
 * Legendary/Ethereal return "" because they replace brackets with
 * filigree / rune corners respectively.
 */
export function getCornerBracketFilter(
  rank: RankTier,
  accentHex: string,
): string {
  switch (rank) {
    case "novice":
      return "";
    case "apprentice":
      return `drop-shadow(0 0 2px ${withAlpha(accentHex, 0.19)})`;
    case "journeyman":
      return `drop-shadow(0 0 4px ${withAlpha(accentHex, 0.25)})`;
    case "expert":
      return `drop-shadow(0 0 6px ${withAlpha(accentHex, 0.31)})`;
    case "master":
      return [
        `drop-shadow(0 0 6px ${withAlpha(accentHex, 0.31)})`,
        `drop-shadow(0 0 2px ${withAlpha("#FFD700", 0.25)})`,
      ].join(" ");
    case "legendary":
      return "";
    case "ethereal":
      return "";
  }
}

// ---------------------------------------------------------------------------
// 3. getSheenOpacity
// ---------------------------------------------------------------------------

const SHEEN_OPACITIES: Record<RankTier, number> = {
  novice: 0.08,
  apprentice: 0.12,
  journeyman: 0.18,
  expert: 0.22,
  master: 0.25,
  legendary: 0.3,
  ethereal: 0.35,
};

/**
 * Returns the opacity multiplier (0-1) for the holographic sheen sweep.
 */
export function getSheenOpacity(rank: RankTier): number {
  return SHEEN_OPACITIES[rank];
}

// ---------------------------------------------------------------------------
// 4. getSheenGradient
// ---------------------------------------------------------------------------

/**
 * Returns the CSS gradient string for the holographic sheen overlay.
 * Higher tiers use wider, more prismatic, or multi-angle gradients.
 */
export function getSheenGradient(rank: RankTier, accentHex: string): string {
  const opacity = getSheenOpacity(rank);
  const accent = withAlpha(accentHex, opacity);

  switch (rank) {
    case "novice":
    case "apprentice":
      return `linear-gradient(115deg, transparent 40%, ${accent} 50%, transparent 60%)`;

    case "journeyman":
      return `linear-gradient(115deg, transparent 30%, ${accent} 50%, transparent 70%)`;

    case "expert":
      return [
        "linear-gradient(115deg,",
        "transparent 25%,",
        `${accent} 42%,`,
        `${withAlpha("#FFFFFF", 0.15)} 50%,`,
        `${withAlpha("#A78BFA", 0.08)} 58%,`,
        "transparent 75%)",
      ].join(" ");

    case "master":
      return [
        "linear-gradient(115deg,",
        "transparent 20%,",
        `${accent} 38%,`,
        `${withAlpha("#FFD700", 0.1)} 45%,`,
        `${withAlpha("#FFFFFF", 0.15)} 50%,`,
        `${withAlpha("#A78BFA", 0.08)} 58%,`,
        "transparent 78%)",
      ].join(" ");

    case "legendary":
      return [
        "linear-gradient(115deg,",
        "transparent 15%,",
        `${withAlpha("#FF6B35", 0.12)} 30%,`,
        `${accent} 40%,`,
        `${withAlpha("#FFD700", 0.15)} 48%,`,
        `${withAlpha("#FFFFFF", 0.12)} 52%,`,
        `${withAlpha("#FF4500", 0.08)} 62%,`,
        "transparent 80%)",
      ].join(" ");

    case "ethereal":
      return [
        `linear-gradient(115deg, transparent 15%, ${withAlpha("#38BDF8", 0.12)} 30%, ${accent} 45%, transparent 65%)`,
        `linear-gradient(235deg, transparent 20%, ${withAlpha("#A78BFA", 0.1)} 40%, ${withAlpha("#34D399", 0.08)} 55%, transparent 75%)`,
        `linear-gradient(355deg, transparent 30%, ${withAlpha("#FFD700", 0.06)} 48%, ${withAlpha("#FF6B35", 0.06)} 55%, transparent 70%)`,
      ].join(", ");
  }
}

// ---------------------------------------------------------------------------
// 5. getRankCardClasses
// ---------------------------------------------------------------------------

/**
 * Returns Tailwind utility classes to add to the card wrapper.
 * Higher ranks get elevation, golden accents, and animation class refs.
 */
export function getRankCardClasses(rank: RankTier): string {
  const classes: string[] = [];

  if (isRankAtLeast(rank, "expert")) {
    classes.push("shadow-lg");
  }

  if (isRankAtLeast(rank, "master")) {
    classes.push("ring-1 ring-amber-500/10");
  }

  if (rank === "legendary") {
    classes.push("animate-rank-legendary-glow");
  }

  if (rank === "ethereal") {
    classes.push("animate-rank-ethereal-shift");
  }

  return classes.join(" ");
}

// ---------------------------------------------------------------------------
// 6. getProfileFrameStyle
// ---------------------------------------------------------------------------

/**
 * Returns inline styles for the profile avatar frame border.
 * Progressively more ornate from Novice through Ethereal.
 */
export function getProfileFrameStyle(rank: RankTier): CSSProperties {
  const color = RANK_COLORS[rank];

  switch (rank) {
    case "novice":
      return {
        border: "2px solid rgba(255,255,255,0.15)",
      };

    case "apprentice":
      return {
        border: `2px solid ${withAlpha(color, 0.35)}`,
        boxShadow: `0 0 8px ${withAlpha(color, 0.1)}`,
      };

    case "journeyman":
      return {
        border: `3px solid ${withAlpha(color, 0.5)}`,
        boxShadow: `0 0 12px ${withAlpha(color, 0.15)}`,
        outline: `1px solid ${withAlpha(color, 0.1)}`,
        outlineOffset: "2px",
      };

    case "expert":
      return {
        border: `3px solid ${withAlpha(color, 0.6)}`,
        boxShadow: [
          `0 0 16px ${withAlpha(color, 0.2)}`,
          `0 0 4px ${withAlpha(color, 0.3)}`,
        ].join(", "),
        outline: `1px solid ${withAlpha(color, 0.15)}`,
        outlineOffset: "3px",
        // Animation handled via globals.css class: animate-rank-pulse-glow
      };

    case "master":
      return {
        border: `3px solid ${withAlpha("#FFD700", 0.6)}`,
        boxShadow: [
          `0 0 20px ${withAlpha("#FFD700", 0.15)}`,
          `0 0 6px ${withAlpha(color, 0.25)}`,
          `inset 0 0 8px ${withAlpha("#FFD700", 0.05)}`,
        ].join(", "),
        outline: `1px solid ${withAlpha("#FFD700", 0.12)}`,
        outlineOffset: "3px",
        // Animation handled via globals.css class: animate-rank-golden-ring
      };

    case "legendary":
      return {
        border: `4px solid #FFD700`,
        boxShadow: [
          `0 0 24px ${withAlpha("#FFD700", 0.25)}`,
          `0 0 8px ${withAlpha("#FFD700", 0.35)}`,
          `inset 0 0 10px ${withAlpha("#FFD700", 0.08)}`,
        ].join(", "),
        outline: `2px solid ${withAlpha("#FFD700", 0.15)}`,
        outlineOffset: "4px",
      };

    case "ethereal":
      return {
        border: `4px solid ${withAlpha(color, 0.7)}`,
        boxShadow: [
          `0 0 28px ${withAlpha(color, 0.2)}`,
          `0 0 56px ${withAlpha("#38BDF8", 0.08)}`,
          `0 0 56px ${withAlpha("#A78BFA", 0.08)}`,
        ].join(", "),
        outline: `2px solid ${withAlpha(color, 0.12)}`,
        outlineOffset: "4px",
        // Animation handled via globals.css class: animate-rank-chromatic-ring
      };
  }
}

// ---------------------------------------------------------------------------
// 7. getProfileGlowStyle
// ---------------------------------------------------------------------------

/**
 * Returns box-shadow glow for the profile card container.
 * Novice/Apprentice have no glow; higher tiers progressively intensify.
 */
export function getProfileGlowStyle(rank: RankTier): CSSProperties {
  const color = RANK_COLORS[rank];

  switch (rank) {
    case "novice":
    case "apprentice":
      return {};

    case "journeyman":
      return {
        boxShadow: `0 0 30px ${withAlpha(color, 0.06)}`,
      };

    case "expert":
      return {
        boxShadow: `0 0 40px ${withAlpha(color, 0.08)}`,
      };

    case "master":
      return {
        boxShadow: [
          `0 0 50px ${withAlpha(color, 0.13)}`,
          `0 0 100px ${withAlpha(color, 0.03)}`,
        ].join(", "),
      };

    case "legendary":
      return {
        boxShadow: [
          `0 0 60px ${withAlpha("#FFD700", 0.15)}`,
          `0 0 120px ${withAlpha(color, 0.06)}`,
        ].join(", "),
      };

    case "ethereal":
      return {
        boxShadow: [
          `0 0 60px ${withAlpha(color, 0.12)}`,
          `0 0 120px ${withAlpha("#38BDF8", 0.06)}`,
          `0 0 120px ${withAlpha("#A78BFA", 0.06)}`,
        ].join(", "),
      };
  }
}
