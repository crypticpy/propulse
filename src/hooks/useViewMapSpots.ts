import { useEffect, useMemo } from "react";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { useViewEffectiveSpots } from "@/hooks/useViewClusterSpots";
import { useViewInteraction } from "@/hooks/useViewPresentation";
import { clusterSpots, reduceExpansion } from "@/lib/spots/grouping";
import { projectLiveSpotsForView } from "@/lib/spots/presentation/pipeline";
import type { ResolvedSpot } from "@/components/map/LiveSpotArcs";
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

  // The resolver retains the exact source object; some upstream RBN rows
  // historically share a raw id across receivers/frequencies observed in the
  // same second, so id-set membership can silently multiply a single
  // deduplicated spot. Key on `originalSpot` identity instead, mirroring
  // useResolvedMapSpots. `feed.candidateSpots` and `feed.resolvedSpots` are
  // built pairwise in that hook, so zipping them is safe.
  const resolvedByOriginalSpot = useMemo(
    () =>
      new Map(
        feed.candidateSpots.map(
          (spot, index) => [spot, feed.resolvedSpots[index]] as const,
        ),
      ),
    [feed.candidateSpots, feed.resolvedSpots],
  );
  const resolvedSpots = useMemo(
    () =>
      projection.mapBudgeted
        .map((spot) => resolvedByOriginalSpot.get(spot))
        .filter((spot): spot is ResolvedSpot => Boolean(spot)),
    [projection.mapBudgeted, resolvedByOriginalSpot],
  );
  // The whole eligible feed, so a crowded region cannot disappear from
  // aggregate facts (grid activity etc.) — deliberately not narrowed to the
  // current band/mode match or map budget. See useResolvedMapSpots.ts.
  const allResolvedSpots = feed.allResolvedSpots;

  const resolvedSingles = useMemo(
    () =>
      grouped.singles
        .map((spot) => resolvedByOriginalSpot.get(spot))
        .filter((spot): spot is ResolvedSpot => Boolean(spot)),
    [grouped.singles, resolvedByOriginalSpot],
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
