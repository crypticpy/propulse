/**
 * AchievementGrid - CSS grid of achievement badge tiles
 *
 * Renders all 18 achievement definitions as tiles, coloring earned badges
 * by their tier and greying out unearned ones. Clicking a tile opens the
 * AchievementDetail modal with full progress information.
 */

import { useState } from "react";
import { useAchievements } from "@/hooks/useAchievements";
import { ACHIEVEMENT_DEFINITIONS } from "@/lib/data/achievementDefinitions";
import {
  TIER_COLORS,
  TIER_LABELS,
  ICON_EMOJI,
} from "@/lib/data/achievementConstants";
import { AchievementDetail } from "./AchievementDetail";
import type {
  AchievementDefinition,
  EarnedAchievement,
} from "@/types/achievement";

// ─── Skeleton ────────────────────────────────────────────────────────────────

function BadgeSkeleton() {
  return (
    <div className="bg-white/5 rounded-xl p-4 animate-pulse motion-reduce:animate-none">
      <div className="flex flex-col items-center gap-2">
        <div className="w-10 h-10 rounded-full bg-white/5" />
        <div className="w-16 h-3 rounded bg-white/5" />
        <div className="w-12 h-2 rounded bg-white/5" />
        <div className="w-full h-1.5 rounded bg-white/5 mt-1" />
      </div>
    </div>
  );
}

// ─── Badge Tile ──────────────────────────────────────────────────────────────

function BadgeTile({
  definition,
  earned,
  onClick,
}: {
  definition: AchievementDefinition;
  earned: EarnedAchievement | null;
  onClick: () => void;
}) {
  const isEarned = earned !== null;
  const emoji = ICON_EMOJI[definition.icon] ?? "\uD83C\uDFC5";

  // Progress bar: toward next tier (or bronze if unearned)
  let progressPercent = 0;
  if (isEarned && earned.nextThreshold !== null) {
    // Progress within current tier range toward next
    const currentTierIndex = definition.tiers.findIndex(
      (t) => t.tier === earned.tier,
    );
    const currentThreshold =
      currentTierIndex >= 0 ? definition.tiers[currentTierIndex].threshold : 0;
    const range = earned.nextThreshold - currentThreshold;
    const progressInRange = earned.progress - currentThreshold;
    progressPercent =
      range > 0 ? Math.min((progressInRange / range) * 100, 100) : 100;
  } else if (isEarned) {
    // At platinum
    progressPercent = 100;
  } else {
    // Unearned: no progress
    progressPercent = 0;
  }

  const tierColor = isEarned ? TIER_COLORS[earned.tier] : "#6b7280";

  return (
    <button
      onClick={onClick}
      className={`
        group relative bg-panel/30 backdrop-blur-sm border rounded-xl p-4
        transition-all duration-200 text-left
        hover:bg-white/5 hover:border-white/10 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none
        ${isEarned ? "border-white/5" : "border-white/3 opacity-50 grayscale"}
      `}
      aria-label={`${definition.name}${isEarned ? `, ${TIER_LABELS[earned.tier]} tier` : ", not yet earned"}`}
    >
      <div className="flex flex-col items-center gap-2">
        {/* Icon */}
        <span className="text-2xl" role="img" aria-hidden="true">
          {emoji}
        </span>

        {/* Name */}
        <span className="text-xs font-medium text-gray-300 text-center leading-tight line-clamp-2">
          {definition.name}
        </span>

        {/* Tier badge */}
        {isEarned ? (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
            style={{
              backgroundColor: `${tierColor}20`,
              color: tierColor,
              border: `1px solid ${tierColor}40`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: tierColor }}
            />
            {TIER_LABELS[earned.tier]}
          </span>
        ) : (
          <span className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">
            Locked
          </span>
        )}

        {/* Progress bar */}
        <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden mt-1">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: tierColor,
            }}
          />
        </div>
      </div>
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AchievementGrid() {
  const { achievements, isLoading } = useAchievements();
  const [selectedDef, setSelectedDef] = useState<AchievementDefinition | null>(
    null,
  );

  // Build lookup map: definitionId -> EarnedAchievement
  const earnedMap = new Map<string, EarnedAchievement>();
  for (const a of achievements) {
    earnedMap.set(a.definitionId, a);
  }

  const earnedCount = achievements.length;

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-3 sm:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <BadgeSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Earned count summary */}
      <p className="text-xs text-gray-500 mb-3">
        {earnedCount} of {ACHIEVEMENT_DEFINITIONS.length} achievements unlocked
      </p>

      {/* Badge grid */}
      <div className="grid gap-3 grid-cols-3 sm:grid-cols-4">
        {ACHIEVEMENT_DEFINITIONS.map((def) => (
          <BadgeTile
            key={def.id}
            definition={def}
            earned={earnedMap.get(def.id) ?? null}
            onClick={() => setSelectedDef(def)}
          />
        ))}
      </div>

      {/* Detail modal */}
      {selectedDef && (
        <AchievementDetail
          isOpen={selectedDef !== null}
          onClose={() => setSelectedDef(null)}
          definition={selectedDef}
          earned={earnedMap.get(selectedDef.id) ?? null}
        />
      )}
    </>
  );
}
