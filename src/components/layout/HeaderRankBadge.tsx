import { RankBadge } from "@/components/rank/RankBadge";
import { useOperatorRank } from "@/hooks/useOperatorRank";
import { useVisualEffectsStore } from "@/stores/visualEffectsStore";

/** Header rank chip. Own module so the masthead can lazy-load the rank graph. */
export function HeaderRankBadge() {
  const { rank } = useOperatorRank();
  const showRankBadge = useVisualEffectsStore((s) => s.showRankBadge);
  if (!showRankBadge) return null;
  return <RankBadge rank={rank} size="sm" />;
}
