export type TracePhase = "traveling" | "persist" | "fadeout" | "done";

export interface TraceFeedReconciliation {
  hydrated: boolean;
  seenIds: Set<string>;
  newEligibleIds: string[];
}

/**
 * Suppress the initial query hydration, then identify only feed IDs that were
 * not present in any earlier snapshot. Eligibility is evaluated after that
 * distinction so changing a display filter cannot replay an old trace.
 */
export function reconcileTraceFeed(
  seenIds: ReadonlySet<string>,
  hydrated: boolean,
  ready: boolean,
  feedIds: readonly string[],
  eligibleIds: ReadonlySet<string>,
): TraceFeedReconciliation {
  if (!ready) {
    return {
      hydrated,
      seenIds: new Set(seenIds),
      newEligibleIds: [],
    };
  }

  const nextSeenIds = new Set(seenIds);
  if (!hydrated) {
    for (const id of feedIds) nextSeenIds.add(id);
    return { hydrated: true, seenIds: nextSeenIds, newEligibleIds: [] };
  }

  const newEligibleIds: string[] = [];
  for (const id of feedIds) {
    if (nextSeenIds.has(id)) continue;
    nextSeenIds.add(id);
    if (eligibleIds.has(id)) newEligibleIds.push(id);
  }

  return { hydrated: true, seenIds: nextSeenIds, newEligibleIds };
}

export function getTraceEndpointOpacity(
  phase: TracePhase,
  fadeProgress = 0,
): number {
  if (phase === "done") return 0;
  if (phase !== "fadeout") return 1;
  return 1 - Math.min(1, Math.max(0, fadeProgress));
}
