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
import { useMapStore } from "@/stores/mapStore";
import { getSpotFetchLimit } from "@/lib/map/spotDensity";

interface UseLiveSpotsOptions {
  /** Receiver grid locator for PSKReporter queries */
  grid?: string;
  /** Enable live spot fetching */
  enabled?: boolean;
  /** Refresh interval in milliseconds (default: 60000) */
  refetchInterval?: number;
  /** Sources to include */
  sources?: SpotSource[];
}

interface UseLiveSpotsResult {
  /** Combined spots from all sources */
  spots: LiveSpot[];
  /** Loading state */
  isLoading: boolean;
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
}: UseLiveSpotsOptions = {}): UseLiveSpotsResult {
  // How many spots each source contributes. Derived from the map's existing
  // display-density setting -- fetching a flat 50 is why raising that slider
  // never showed more spots. Floored so the analysis consumers of this hook
  // (band-opening detection, alerts) keep their full feed when the map is
  // turned down. In the query key so changing it refetches rather than waiting
  // for the next interval.
  const displayDensity = useMapStore((s) => s.displayDensity);
  const spotLimit = getSpotFetchLimit(displayDensity);

  // Fetch PSKReporter spots
  const pskQuery = useQuery({
    queryKey: ["liveSpots", "pskreporter", grid, spotLimit],
    queryFn: () => fetchPSKReporterSpots(grid, undefined, spotLimit),
    enabled: enabled && sources.includes("PSKReporter"),
    staleTime: 30 * SECOND,
    refetchInterval,
    retry: 2,
  });

  // Fetch RBN spots
  const rbnQuery = useQuery({
    queryKey: ["liveSpots", "rbn", spotLimit],
    queryFn: () => fetchRBNSpots(spotLimit),
    enabled: enabled && sources.includes("RBN"),
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

  // Combine and deduplicate spots
  const spots = useMemo(() => {
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

    // Deduplicate and sort by time (newest first)
    const deduplicated = deduplicateSpots(allSpots);
    const sorted = deduplicated.sort(
      (a, b) => b.time.getTime() - a.time.getTime(),
    );

    // Filter by sources if specified (non-empty array means filter is active)
    if (sources && sources.length > 0) {
      return sorted.filter((spot) => sources.includes(spot.source));
    }

    return sorted;
  }, [pskQuery.data, rbnQuery.data, wsjtxSpots, sources]);

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

  const refetch = () => {
    pskQuery.refetch();
    rbnQuery.refetch();
  };

  return {
    spots,
    isLoading,
    isError,
    spotsBySource,
    refetch,
  };
}

export default useLiveSpots;
