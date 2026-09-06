import { useVisualEffects } from "@/hooks/useVisualEffects";
/**
 * RankBadge -- Reusable badge for operator rank tiers.
 *
 * Renders a styled pill / inline label for each of the 7 rank tiers
 * with size variants (sm, md, lg). Higher tiers get progressively
 * fancier treatments: golden glow (master), Orbitron font (legendary),
 * animated prismatic gradient (ethereal).
 */

import type { RankTier } from "@/types/rank";
import {
  RANK_BADGE_STYLES,
  RANK_ICONS,
  RANK_LABELS,
} from "@/lib/data/rankConstants";

// ---------------------------------------------------------------------------
// Inject rank-specific keyframes once (follows EquipmentCard ensureCardStyles)
// ---------------------------------------------------------------------------
const RANK_STYLE_ID = "rank-badge-styles";
function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(RANK_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = RANK_STYLE_ID;
  style.textContent = `
@keyframes rankPrismatic {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@media (prefers-reduced-motion: reduce) {
  .rank-prismatic { animation: none !important; }
}`;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface RankBadgeProps {
  rank: RankTier;
  size?: "sm" | "md" | "lg";
  className?: string;
}

// ---------------------------------------------------------------------------
// Tier-specific inline styles
// ---------------------------------------------------------------------------
function getTierInlineStyles(
  rank: RankTier,
  size: "sm" | "md" | "lg",
): React.CSSProperties | undefined {
  if (rank === "master" && size !== "sm") {
    return { textShadow: "0 0 4px currentColor" };
  }

  if (rank === "legendary") {
    return { textShadow: "0 0 8px #FFD700" };
  }

  if (rank === "ethereal") {
    return {
      backgroundImage:
        "linear-gradient(90deg, #38BDF8, #A78BFA, #F472B6, #34D399, #38BDF8)",
      backgroundSize: "200% 200%",
      animation: "rankPrismatic 3s ease infinite",
      textShadow: "1px 0 #ff000015, -1px 0 #0000ff15",
    };
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function RankBadge({
  rank,
  size = "md",
  className = "",
}: RankBadgeProps) {
  const effects = useVisualEffects();
  ensureStyles();

  const styles = RANK_BADGE_STYLES[rank];
  const icon = RANK_ICONS[rank];
  const label = RANK_LABELS[rank];
  const inlineStyle = {
    ...getTierInlineStyles(rank, size),
    animation: effects.animatedBadges ? getTierInlineStyles(rank, size)?.animation : "none",
    textShadow: effects.glow ? getTierInlineStyles(rank, size)?.textShadow : "none",
  };

  // -- Size classes ---------------------------------------------------------
  let sizeClasses: string;
  let textSize: string;
  switch (size) {
    case "sm":
      sizeClasses = "px-1.5 py-0";
      textSize = "text-[9px]";
      break;
    case "lg":
      sizeClasses = "px-2.5 py-1";
      textSize = "text-[11px]";
      break;
    case "md":
    default:
      sizeClasses = "px-2 py-0.5";
      textSize = "text-[10px]";
      break;
  }

  // -- Border handling: novice at sm has no border --------------------------
  const borderClass =
    rank === "novice" && size === "sm" ? "border-0" : `border ${styles.border}`;

  // -- Ethereal overrides bg/text since it uses a gradient background -------
  const isEthereal = rank === "ethereal";
  const bgClass = isEthereal ? "" : styles.bg;
  const textClass = isEthereal ? "text-white" : styles.text;
  const prismaticClass = isEthereal ? "rank-prismatic" : "";

  // -- Font overrides for legendary/ethereal --------------------------------
  const fontClass = styles.font ?? "";
  const trackingClass =
    rank === "legendary" || rank === "ethereal"
      ? "tracking-[0.2em]"
      : "tracking-wider";

  const classes = [
    "inline-flex items-center gap-1 rounded-full font-semibold uppercase",
    sizeClasses,
    textSize,
    borderClass,
    bgClass,
    textClass,
    fontClass,
    trackingClass,
    prismaticClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} style={inlineStyle}>
      {icon && <span>{icon}</span>}
      <span>{label}</span>
    </span>
  );
}

export default RankBadge;
