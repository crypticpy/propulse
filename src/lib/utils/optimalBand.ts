import type { PathBandCondition } from "@/lib/utils/bands";

const STATUS_SCORE: Record<PathBandCondition["status"], number> = {
  excellent: 100,
  good: 75,
  fair: 50,
  poor: 25,
  closed: 0,
};

/**
 * Pick a single best band from a list of path band conditions.
 * Returns `null` when no band is viable (all closed).
 */
export function pickOptimalBandCondition(
  conditions: PathBandCondition[],
): PathBandCondition | null {
  const viable = conditions.filter((c) => c.status !== "closed");
  if (viable.length === 0) {
    return null;
  }

  return viable
    .map((cond) => ({
      cond,
      score: (STATUS_SCORE[cond.status] || 0) + (cond.snrEstimate + 50),
    }))
    .sort((a, b) => b.score - a.score)[0]?.cond ?? null;
}

