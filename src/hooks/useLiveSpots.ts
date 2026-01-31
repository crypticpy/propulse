/**
 * useLiveSpots Hook
 *
 * Unified hook for fetching and merging spots from multiple sources:
 * - PSKReporter (digital modes)
 * - Reverse Beacon Network (CW/RTTY)
 * - Demo spots (fallback)
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
import { fetchDemoSpots } from "@/lib/api/dxcluster";
import type { LiveSpot, SpotSource } from "@/types/livespot";

interface UseLiveSpotsOptions {
  /** Receiver grid locator for PSKReporter queries */
  grid?: string;
  /** Enable live spot fetching */
  enabled?: boolean;
  /** Refresh interval in milliseconds (default: 60000) */
  refetchInterval?: number;
  /** Sources to include */
  sources?: SpotSource[];
  /** Include demo spots as fallback */
  includeDemo?: boolean;
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
 * Prioritizes real spots over demo spots
 */
function deduplicateSpots(spots: LiveSpot[]): LiveSpot[] {
  const seen = new Map<string, LiveSpot>();

  // Sort by source priority (real sources first)
  const prioritized = [...spots].sort((a, b) => {
    const priority: Record<SpotSource, number> = {
      PSKReporter: 1,
      RBN: 2,
      Cluster: 3,
      Demo: 4,
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

export function useLiveSpots({
  grid,
  enabled = true,
  refetchInterval = MINUTE,
  sources = ["PSKReporter", "RBN", "Demo"],
  includeDemo = true,
}: UseLiveSpotsOptions = {}): UseLiveSpotsResult {
  // Fetch PSKReporter spots
  const pskQuery = useQuery({
    queryKey: ["liveSpots", "pskreporter", grid],
    queryFn: () => fetchPSKReporterSpots(grid, undefined, 50),
    enabled: enabled && sources.includes("PSKReporter"),
    staleTime: 30 * SECOND,
    refetchInterval,
    retry: 2,
  });

  // Fetch RBN spots
  const rbnQuery = useQuery({
    queryKey: ["liveSpots", "rbn"],
    queryFn: () => fetchRBNSpots(50),
    enabled: enabled && sources.includes("RBN"),
    staleTime: 30 * SECOND,
    refetchInterval,
    retry: 2,
  });

  // Fetch demo spots as fallback
  const demoQuery = useQuery({
    queryKey: ["liveSpots", "demo"],
    queryFn: async () => {
      const spots = await fetchDemoSpots(30);
      // Add source attribution
      return spots.map((spot) => ({
        ...spot,
        source: "Demo" as SpotSource,
      }));
    },
    enabled: enabled && includeDemo,
    staleTime: MINUTE,
    refetchInterval: MINUTE,
  });

  // Combine and deduplicate spots
  const spots = useMemo(() => {
    const allSpots: LiveSpot[] = [];

    if (pskQuery.data) {
      allSpots.push(...pskQuery.data);
    }

    if (rbnQuery.data) {
      allSpots.push(...rbnQuery.data);
    }

    // Only include demo spots if no real spots available or explicitly requested
    if (demoQuery.data && (includeDemo || allSpots.length === 0)) {
      allSpots.push(...demoQuery.data);
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
  }, [pskQuery.data, rbnQuery.data, demoQuery.data, includeDemo, sources]);

  // Group spots by source
  const spotsBySource = useMemo(() => {
    const grouped: Record<SpotSource, LiveSpot[]> = {
      PSKReporter: [],
      RBN: [],
      Cluster: [],
      Demo: [],
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
    if (includeDemo) {
      demoQuery.refetch();
    }
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
