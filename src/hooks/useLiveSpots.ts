/**
 * useLiveSpots Hook
 *
 * Unified hook for fetching and merging spots from multiple sources:
 * - PSKReporter (digital modes)
 * - Reverse Beacon Network (CW/RTTY)
 * - WSJT-X (local decodes via bridge)
 *
 * Features:
 * - Automatic deduplication
 * - Source attribution
 * - Configurable refresh interval
 * - Filtering by band/mode/source
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPSKReporterSpots } from "@/lib/api/pskreporter";
import { fetchRBNSpots } from "@/lib/api/rbn";
import { getBandFromFrequency } from "@/lib/api/dxcluster";
import { useWSJTXStore } from "@/stores/wsjtxStore";
import type { WSJTXDecode } from "@/stores/wsjtxStore";
import type { LiveSpot, SpotSource } from "@/types/livespot";
import type { SpotFilters } from "@/types/operatingProfile";
import { useMapStore } from "@/stores/mapStore";
import {
  getSpotFetchLimit,
  MAX_SPOT_FETCH_LIMIT,
} from "@/lib/map/spotDensity";
import { selectMapSpotCandidates } from "@/lib/map/spotCandidates";

interface UseLiveSpotsOptions {
  /** Receiver grid locator for PSKReporter queries */
  grid?: string;
  /** Enable live spot fetching */
  enabled?: boolean;
  /** Refresh interval in milliseconds (default: 60000) */
  refetchInterval?: number;
  /** Sources to include */
  sources?: SpotSource[];
  /** Optional map profile filters, applied before cross-source deduplication. */
  spotFilters?: SpotFilters;
  /** Preserve every receiver/source report for evidence-oriented consumers. */
  deduplicate?: boolean;
  /** Explicit per-source request budget for renderer-independent evidence. */
  fetchLimit?: number;
}

interface UseLiveSpotsResult {
  /** Combined spots from all sources */
  spots: LiveSpot[];
  /** Eligible reports before visual deduplication, for semantic aggregation. */
  evidenceSpots: LiveSpot[];
  /** Stable identity for every option that changes the returned feed snapshot. */
  feedScopeKey: string;
  /** Loading state */
  isLoading: boolean;
  /** Every requested remote source has produced an initial successful snapshot. */
  isFeedReady: boolean;
  /** Error state */
  isError: boolean;
  /** Spots by source for attribution */
  spotsBySource: Record<SpotSource, LiveSpot[]>;
  /** Refetch all sources */
  refetch: () => void;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Stable default sources array — avoids new reference on every hook call */
const DEFAULT_SOURCES: SpotSource[] = ["PSKReporter", "RBN", "WSJT-X"];

/**
 * Generate a deduplication key for a spot
 * Same callsign on same frequency within 1 minute = same spot
 */
function getSpotKey(spot: LiveSpot): string {
  const timeMinute = Math.floor(spot.time.getTime() / MINUTE);
  const freqRounded = Math.round(spot.frequency / 10) * 10; // Round to 10 kHz
  return `${spot.dx}_${freqRounded}_${timeMinute}`;
}

/**
 * Deduplicate spots by callsign + frequency + time
 *
 * Priority: PSKReporter(0) > RBN(1) > WSJT-X(2) > Cluster(3)
 */
function deduplicateSpots(spots: LiveSpot[]): LiveSpot[] {
  const seen = new Map<string, LiveSpot>();

  // Sort by source priority
  const prioritized = [...spots].sort((a, b) => {
    const priority: Record<SpotSource, number> = {
      PSKReporter: 0,
      RBN: 1,
      "WSJT-X": 2,
      Cluster: 3,
    };
    return priority[a.source] - priority[b.source];
  });

  for (const spot of prioritized) {
    const key = getSpotKey(spot);
    if (!seen.has(key)) {
      seen.set(key, spot);
    }
  }

  return Array.from(seen.values());
}

/**
 * Convert a WSJT-X decode into a LiveSpot.
 *
 * The WSJT-X decode carries an audio frequency offset (deltaFrequency)
 * relative to the dial frequency from the WSJT-X status. The spot frequency
 * is computed as: dial (in kHz) + audio offset (in kHz).
 */
function wsjtxDecodeToLiveSpot(
  decode: WSJTXDecode,
  statusFreqHz: number,
): LiveSpot {
  const frequencyKHz = statusFreqHz / 1000; // DXSpot uses kHz
  const spotFrequencyKHz = frequencyKHz + decode.deltaFrequency / 1000;
  return {
    id: `wsjtx-${decode.receivedAt}-${decode.callsign || decode.message}`,
    spotter: "WSJT-X", // local receiver
    dx: decode.callsign || "",
    dxGrid: decode.grid,
    frequency: spotFrequencyKHz,
    mode: decode.mode,
    comment: decode.message,
    time: new Date(decode.receivedAt), // use receivedAt timestamp
    band: getBandFromFrequency(frequencyKHz),
    source: "WSJT-X",
    snr: decode.snr,
  };
}

export function useLiveSpots({
  grid,
  enabled = true,
  refetchInterval = MINUTE,
  sources = DEFAULT_SOURCES,
  spotFilters,
  deduplicate = true,
  fetchLimit,
}: UseLiveSpotsOptions = {}): UseLiveSpotsResult {
  // How many spots each source contributes. Derived from the map's existing
  // display-density setting -- fetching a flat 50 is why raising that slider
  // never showed more spots. Floored so the analysis consumers of this hook
  // (band-opening detection, alerts) keep their full feed when the map is
  // turned down. In the query key so changing it refetches rather than waiting
  // for the next interval.
  const displayDensity = useMapStore((s) => s.displayDensity);
  const spotLimit =
    fetchLimit === undefined
      ? getSpotFetchLimit(displayDensity)
      : Math.min(
          MAX_SPOT_FETCH_LIMIT,
          Math.max(1, Math.floor(Number.isFinite(fetchLimit) ? fetchLimit : 1)),
        );
  const pskEnabled = enabled && sources.includes("PSKReporter");
  const rbnEnabled = enabled && sources.includes("RBN");
  const feedScopeKey = JSON.stringify({
    grid: grid ?? null,
    spotLimit,
    sources: [...sources].sort(),
    bands: [...(spotFilters?.bands ?? [])]
      .map((band) => band.toLowerCase())
      .sort(),
    modes: [...(spotFilters?.modes ?? [])]
      .map((mode) => mode.toLowerCase())
      .sort(),
    deduplicate,
  });

  // Fetch PSKReporter spots
  const pskQuery = useQuery({
    queryKey: ["liveSpots", "pskreporter", grid, spotLimit],
    queryFn: () => fetchPSKReporterSpots(grid, undefined, spotLimit),
    enabled: pskEnabled,
    staleTime: 30 * SECOND,
    refetchInterval,
    retry: 2,
  });

  // Fetch RBN spots
  const rbnQuery = useQuery({
    queryKey: ["liveSpots", "rbn", spotLimit],
    queryFn: () => fetchRBNSpots(spotLimit),
    enabled: rbnEnabled,
    staleTime: 30 * SECOND,
    refetchInterval,
    retry: 2,
  });

  // WSJT-X decodes from the bridge (via store)
  const wsjtxDecodes = useWSJTXStore((s) => s.decodes);
  const wsjtxStatus = useWSJTXStore((s) => s.status);
  const wsjtxConnected = useWSJTXStore((s) => s.connected);

  // Convert WSJT-X decodes to LiveSpots
  const wsjtxSpots = useMemo<LiveSpot[]>(() => {
    if (
      !wsjtxConnected ||
      !wsjtxStatus ||
      !sources.includes("WSJT-X") ||
      wsjtxDecodes.length === 0
    ) {
      return [];
    }

    // Only convert decodes that have an extracted callsign (skip noise)
    // and limit to the most recent spots for performance
    return wsjtxDecodes
      .filter((d) => d.callsign)
      .slice(0, spotLimit)
      .map((d) => wsjtxDecodeToLiveSpot(d, wsjtxStatus.frequency));
  }, [wsjtxDecodes, wsjtxStatus, wsjtxConnected, sources, spotLimit]);

  // Establish the complete eligible evidence set once. Visual consumers use
  // the deduplicated projection below, while activity summaries retain each
  // receiver/source report from the same network snapshot.
  const evidenceSpots = useMemo(() => {
    const allSpots: LiveSpot[] = [];

    if (pskQuery.data) {
      allSpots.push(...pskQuery.data);
    }

    if (rbnQuery.data) {
      allSpots.push(...rbnQuery.data);
    }

    // Include WSJT-X spots
    if (wsjtxSpots.length > 0) {
      allSpots.push(...wsjtxSpots);
    }

    // Eligibility must be established before cross-source deduplication. If a
    // preferred PSKReporter member is outside the active band/mode profile, an
    // otherwise-equivalent eligible RBN member must survive the group.
    const eligibleSpots = selectMapSpotCandidates(allSpots, {
      sources,
      spotFilters,
    });
    return eligibleSpots.sort(
      (a, b) => b.time.getTime() - a.time.getTime(),
    );
  }, [
    pskQuery.data,
    rbnQuery.data,
    sources,
    spotFilters,
    wsjtxSpots,
  ]);

  // Map renderers prefer one visual per callsign/frequency/minute. Evidence
  // views can opt out and retain every report before grouping it themselves.
  const spots = useMemo(
    () =>
      deduplicate
        ? deduplicateSpots(evidenceSpots).sort(
            (a, b) => b.time.getTime() - a.time.getTime(),
          )
        : evidenceSpots,
    [deduplicate, evidenceSpots],
  );

  // Group spots by source
  const spotsBySource = useMemo(() => {
    const grouped: Record<SpotSource, LiveSpot[]> = {
      PSKReporter: [],
      RBN: [],
      Cluster: [],
      "WSJT-X": [],
    };

    for (const spot of spots) {
      grouped[spot.source].push(spot);
    }

    return grouped;
  }, [spots]);

  const isLoading = pskQuery.isLoading || rbnQuery.isLoading;
  const isError = pskQuery.isError && rbnQuery.isError;
  // `isLoading` becomes false after an initial error, so it cannot establish
  // the trace feed's hydration baseline. dataUpdatedAt is only populated by a
  // successful query result and remains populated through later refetch
  // errors. Waiting for every requested remote source prevents a recovered
  // source's existing snapshot from being replayed as newly-arrived traces.
  const isFeedReady =
    enabled &&
    (!pskEnabled || pskQuery.dataUpdatedAt > 0) &&
    (!rbnEnabled || rbnQuery.dataUpdatedAt > 0);

  const refetch = () => {
    pskQuery.refetch();
    rbnQuery.refetch();
  };

  return {
    spots,
    evidenceSpots,
    feedScopeKey,
    isLoading,
    isFeedReady,
    isError,
    spotsBySource,
    refetch,
  };
}

export default useLiveSpots;
