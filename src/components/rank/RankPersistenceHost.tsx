import { useVisualEffects } from "@/hooks/useVisualEffects";
import { useCallback, useEffect, useRef, useState } from "react";
import { RankUpCelebration } from "@/components/rank/RankUpCelebration";
import { useOperatorRank } from "@/hooks/useOperatorRank";
import { useKioskStore } from "@/stores/kioskStore";
import { useProfileStore } from "@/stores/profileStore";
import type { RankTier } from "@/types/rank";

/**
 * Persists operator rank and shows the rank-up celebration. Lazy-loaded from
 * App so the rank/logbook graph stays out of the startup entry.
 */
export function RankPersistenceHost() {
  useOperatorRank({ persist: true });
  const effects = useVisualEffects();
  const consumedTransition = useRef<string | null>(null);
  const isKiosk = useKioskStore((s) => s.active);
  const rankHistory = useProfileStore((s) => s.operatorRank.rankHistory);
  const rankCelebrationSeen = useProfileStore((s) => s.rankCelebrationSeen);
  const markCelebrationSeen = useProfileStore((s) => s.markCelebrationSeen);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationRanks, setCelebrationRanks] = useState<{
    from: RankTier;
    to: RankTier;
  } | null>(null);

  useEffect(() => {
    if (!effects.celebrations || isKiosk) {
      setShowCelebration(false);
      setCelebrationRanks(null);
    }
    if (rankHistory.length === 0) return;
    const latestTransition = rankHistory[rankHistory.length - 1];
    const latestTimestamp = latestTransition.timestamp;

    if (consumedTransition.current === latestTimestamp) return;
    if (!rankCelebrationSeen || latestTimestamp > rankCelebrationSeen) {
      if (!effects.celebrations || isKiosk) {
        consumedTransition.current = latestTimestamp;
        markCelebrationSeen();
        return;
      }
      setCelebrationRanks({
        from: latestTransition.from,
        to: latestTransition.to,
      });
      setShowCelebration(true);
    }
  }, [rankHistory, rankCelebrationSeen, effects.celebrations, isKiosk, markCelebrationSeen]);

  const handleDismissCelebration = useCallback(() => {
    consumedTransition.current = rankHistory.at(-1)?.timestamp ?? null;
    setShowCelebration(false);
    markCelebrationSeen();
  }, [markCelebrationSeen, rankHistory]);

  if (!effects.celebrations || isKiosk || !showCelebration || !celebrationRanks) return null;

  return (
    <RankUpCelebration
      fromRank={celebrationRanks.from}
      toRank={celebrationRanks.to}
      onDismiss={handleDismissCelebration}
    />
  );
}
