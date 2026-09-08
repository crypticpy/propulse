import { useEffect, useMemo } from "react";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { useViewEffectiveSpots } from "@/hooks/useViewClusterSpots";
import { useViewInteraction } from "@/hooks/useViewPresentation";
import { clusterSpots, reduceExpansion } from "@/lib/spots/grouping";
import { projectLiveSpotsForView } from "@/lib/spots/presentation/pipeline";
import {
  useResolvedMapSpots,
  type UseResolvedMapSpotsOptions,
} from "@/components/map/hooks/useResolvedMapSpots";

export {
  projectLiveSpotsForView,
  type ViewLiveSpotProjection,
} from "@/lib/spots/presentation/pipeline";

type ViewMapSpotsOptions = Omit<
  UseResolvedMapSpotsOptions,
  "maxSpots" | "spotFilters" | "sources" | "fetchLimit"
>;

/**
 * Bound-runtime live feed: view filters, budget, and geographic grouping.
 * Shared ingestion is unchanged; camera is not a membership input.
 */
export function useViewMapSpots(options: ViewMapSpotsOptions) {
  const runtime = useViewRuntime();
  const prefs = useViewEffectiveSpots();
  const interaction = useViewInteraction();
  const sources =
    prefs.filters.sources.length > 0 ? [...prefs.filters.sources] : undefined;
  const feed = useResolvedMapSpots({
    ...options,
    sources,
  });
  const projection = useMemo(
    () => projectLiveSpotsForView(feed.candidateSpots, prefs, Date.now()),
    [feed.candidateSpots, prefs],
  );
  const grouped = useMemo(
    () =>
      clusterSpots(projection.mapBudgeted, {
        enabled: prefs.grouping.enabled,
        minClusterSize: prefs.grouping.minGroupSize,
        detail: prefs.grouping.detail,
        expandedIds: interaction.expandedGroupIds,
      }),
    [
      projection.mapBudgeted,
      prefs.grouping.enabled,
      prefs.grouping.minGroupSize,
      prefs.grouping.detail,
      interaction.expandedGroupIds,
    ],
  );

  useEffect(() => {
    const next = reduceExpansion(
      { expandedIds: interaction.expandedGroupIds },
      { type: "sync", liveGroupIds: grouped.liveGroupIds },
    );
    if (next.expandedIds !== interaction.expandedGroupIds) {
      runtime.setExpandedGroups(next.expandedIds);
    }
  }, [grouped.liveGroupIds, interaction.expandedGroupIds, runtime]);

  const budgetIds = useMemo(
    () => new Set(projection.mapBudgeted.map((spot) => spot.id)),
    [projection.mapBudgeted],
  );
  const matchingIds = useMemo(
    () => new Set(projection.matching.map((spot) => spot.id)),
    [projection.matching],
  );
  const resolvedSpots = useMemo(
    () => feed.allResolvedSpots.filter((spot) => budgetIds.has(spot.id)),
    [budgetIds, feed.allResolvedSpots],
  );
  const allResolvedSpots = useMemo(
    () => feed.allResolvedSpots.filter((spot) => matchingIds.has(spot.id)),
    [feed.allResolvedSpots, matchingIds],
  );

  const resolvedSingles = useMemo(
    () =>
      feed.allResolvedSpots.filter((spot) =>
        grouped.singles.some((single) => single.id === spot.id),
      ),
    [feed.allResolvedSpots, grouped.singles],
  );

  const expandGroup = (groupId: string) => {
    if (interaction.expandedGroupIds.includes(groupId)) return;
    runtime.setExpandedGroups([...interaction.expandedGroupIds, groupId]);
  };

  return {
    ...feed,
    spots: projection.matching,
    candidateSpots: projection.mapBudgeted,
    resolvedSpots,
    resolvedSingles,
    allResolvedSpots,
    listTotal: projection.matchingCount,
    mapBudget: prefs.filters.spotLimit,
    matchingCount: projection.matchingCount,
    mappedCount: projection.mappedCount,
    unlocatedCount: projection.unlocatedCount,
    budgetOmittedCount: projection.budgetOmittedCount,
    clusters: grouped.clusters,
    singles: grouped.singles,
    groupingEnabled: prefs.grouping.enabled,
    expandGroup,
  };
}
