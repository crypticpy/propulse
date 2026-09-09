/**
 * AchievementDetail - Modal displaying full achievement information
 *
 * Shows the achievement icon, name, description, current tier badge,
 * progress bar toward the next tier, and contextual helper text.
 */

import { DetailModal } from "@/components/ui/DetailModal";
import {
  TIER_COLORS,
  TIER_LABELS,
  ICON_EMOJI,
} from "@/lib/data/achievementConstants";
import { inkOnFill } from "@/lib/utils/spotColors";
import type {
  AchievementDefinition,
  EarnedAchievement,
} from "@/types/achievement";

// ─── Props ───────────────────────────────────────────────────────────────────

interface AchievementDetailProps {
  isOpen: boolean;
  onClose: () => void;
  definition: AchievementDefinition;
  earned: EarnedAchievement | null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AchievementDetail({
  isOpen,
  onClose,
  definition,
  earned,
}: AchievementDetailProps) {
  const emoji = ICON_EMOJI[definition.icon] ?? "\uD83C\uDFC5";
  const isEarned = earned !== null;

  // Current tier info
  const currentTier = earned?.tier ?? null;
  const currentTierIndex = currentTier
    ? definition.tiers.findIndex((t) => t.tier === currentTier)
    : -1;

  // Next tier info
  const nextTier =
    currentTierIndex >= 0 && currentTierIndex < definition.tiers.length - 1
      ? definition.tiers[currentTierIndex + 1]
      : null;

  // Progress bar calculation
  const progress = earned?.progress ?? 0;
  let progressPercent = 0;
  let progressLabel = "";

  if (!isEarned) {
    // Not earned: show progress toward bronze
    const bronzeThreshold = definition.tiers[0].threshold;
    progressPercent =
      bronzeThreshold > 0
        ? Math.min((progress / bronzeThreshold) * 100, 100)
        : 0;
    progressLabel = `${progress} / ${bronzeThreshold} for Bronze`;
  } else if (nextTier) {
    // Earned but not platinum: show progress toward next tier
    const currentThreshold = definition.tiers[currentTierIndex].threshold;
    const range = nextTier.threshold - currentThreshold;
    const progressInRange = progress - currentThreshold;
    progressPercent =
      range > 0 ? Math.min((progressInRange / range) * 100, 100) : 100;
    const remaining = nextTier.threshold - progress;
    progressLabel = `${remaining} more for ${TIER_LABELS[nextTier.tier]}`;
  } else {
    // At platinum
    progressPercent = 100;
    progressLabel = "Maximum tier achieved!";
  }

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title={definition.name}
      subtitle={
        definition.category.charAt(0).toUpperCase() +
        definition.category.slice(1)
      }
      size="md"
    >
      <div className="space-y-6">
        {/* Icon + tier badge */}
        <div className="flex flex-col items-center gap-3">
          <span
            className="text-5xl"
            style={{ filter: isEarned ? "none" : "grayscale(1)" }}
            role="img"
            aria-label={definition.name}
          >
            {emoji}
          </span>

          {currentTier && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
              style={{
                backgroundColor: TIER_COLORS[currentTier],
                color: inkOnFill(TIER_COLORS[currentTier]),
                border: `1px solid ${TIER_COLORS[currentTier]}`,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: TIER_COLORS[currentTier] }}
              />
              {TIER_LABELS[currentTier]}
            </span>
          )}

          {!isEarned && (
            <span className="text-xs text-su-muted uppercase tracking-wider font-semibold">
              Not yet earned
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-su-muted text-center leading-relaxed">
          {definition.description}
        </p>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-su-muted">
            <span>Progress</span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
          <div className="h-2 rounded-full bg-su-line/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: currentTier
                  ? TIER_COLORS[currentTier]
                  : "#6b7280",
              }}
            />
          </div>
          <p className="text-xs text-su-muted text-center">{progressLabel}</p>
        </div>

        {/* Tier breakdown */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-su-muted uppercase tracking-wider">
            Tier Requirements
          </h4>
          <div className="space-y-1.5">
            {definition.tiers.map((tierDef) => {
              const isCurrentTier = currentTier === tierDef.tier;
              const isAchieved =
                currentTierIndex >=
                definition.tiers.findIndex((t) => t.tier === tierDef.tier);

              return (
                <div
                  key={tierDef.tier}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                    isCurrentTier
                      ? "bg-su-line/10 border border-su-line/40"
                      : "opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor: isAchieved
                          ? TIER_COLORS[tierDef.tier]
                          : "#374151",
                      }}
                    />
                    <span
                      className={`font-medium ${isAchieved ? "text-su-text" : ""}`}
                      style={isAchieved ? undefined : { color: "#6b7280" }}
                    >
                      {TIER_LABELS[tierDef.tier]}
                    </span>
                  </div>
                  <span className="text-su-muted">{tierDef.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Current value */}
        {isEarned && (
          <div className="text-center pt-2 border-t border-su-line/20">
            <span className="text-xs text-su-muted">Current value: </span>
            <span className="text-sm font-medium text-su-muted">
              {earned.progress.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </DetailModal>
  );
}
