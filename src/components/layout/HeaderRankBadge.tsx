import { RankBadge } from "@/components/rank/RankBadge";
import { useOperatorRank } from "@/hooks/useOperatorRank";

/** Header rank chip. Own module so the masthead can lazy-load the rank graph. */
export function HeaderRankBadge() {
  const { rank } = useOperatorRank();
  return <RankBadge rank={rank} size="sm" />;
}
