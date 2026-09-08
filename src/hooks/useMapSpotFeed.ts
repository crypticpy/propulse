import { useMemo } from "react";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { useMapOperationalContext } from "@/hooks/useMapOperationalContext";
import { usePskStationData } from "@/hooks/usePskStation";
import { pskStationMapSpots } from "@/lib/map/pskStationSpots";
import { policyAllows, selectScopedLiveSpotSources } from "@/lib/map/operationalScope";
import { MAX_SPOT_FETCH_LIMIT } from "@/lib/map/spotDensity";
import { useMapStore } from "@/stores/mapStore";
import type { SpotSource } from "@/types/livespot";
import type { SpotFilters } from "@/types/operatingProfile";

/** Shared map/settings feed policy without importing renderer geometry. */
export function useMapSpotFeed({
  grid, enabled, sources, spotFilters, refetchInterval = 60_000,
}: {
  grid?: string;
  enabled: boolean;
  sources?: SpotSource[];
  spotFilters?: SpotFilters;
  refetchInterval?: number;
}) {
  const { policy } = useMapOperationalContext();
  const scope = useMapStore((s) => s.spotFeedScope);
  const personal = scope === "psk-station";
  const personalAllowed = policyAllows(policy, "liveSpots", "public");
  const station = usePskStationData(enabled && personal && personalAllowed);
  const personalSpots = useMemo(() =>
    enabled && personal && personalAllowed ? pskStationMapSpots(station.rows) : [],
  [enabled, personal, personalAllowed, station.rows]);
  const windowMinutes = useMapStore((s) => s.spotAgeMinutes);
  const scopedSources = useMemo(
    () => selectScopedLiveSpotSources(sources, policy),
    [policy, sources],
  );
  const live = useLiveSpots({
    grid, enabled: enabled && !personal, refetchInterval,
    sources: scopedSources && scopedSources.length > 0 ? scopedSources : undefined,
    spotFilters,
    // Draw density must not change the bounded snapshot used for activity.
    fetchLimit: MAX_SPOT_FETCH_LIMIT,
    windowMinutes,
  });
  if (!personal) return { ...live, policy, scopedSources, effectiveSpotFilters: spotFilters, scope, station };
  const state = !enabled ? "OFF" : !personalAllowed ? "RESTRICTED" : station.state;
  return {
    ...live, policy, scope, station,
    scopedSources: ["PSKReporter"] as SpotSource[],
    // Personal filters are shared with the PSK report, independent of global filters.
    effectiveSpotFilters: undefined,
    spots: personalSpots, evidenceSpots: personalSpots,
    feedScopeKey: JSON.stringify(["psk-station", station.feed.callsign, station.view.direction,
      station.view.minutes, station.view.band, personalAllowed]),
    sourceMetadata: {},
    sourceStates: { PSKReporter: state, RBN: "OFF", "WSJT-X": "OFF" },
    isLoading: enabled && personalAllowed && station.feed.isLoading,
    isFeedReady: enabled && personalAllowed && station.feed.dataUpdatedAt > 0 && station.feed.data?.status !== "unavailable",
    isError: enabled && personalAllowed && (station.feed.isError || station.feed.data?.status === "unavailable"),
    spotsBySource: { PSKReporter: personalSpots, RBN: [], Cluster: [], "WSJT-X": [] },
    refetch: () => { if (enabled && personalAllowed) void station.feed.refetch(); },
  };
}
