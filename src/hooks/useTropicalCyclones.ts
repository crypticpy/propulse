/**
 * useTropicalCyclones -- TanStack Query hook for active tropical systems
 *
 * One fetch of /api/atmos/tropical serves both hemispheres: NHC
 * Atlantic/EPac storms as `cyclones` (unchanged shape for existing
 * consumers) and JTWC-tracked systems (West Pacific / Indian Ocean /
 * Southern Hemisphere) as additive `jtwc`/`jtwcAvailable` fields.
 */

import { useQuery } from "@tanstack/react-query";

import {
  fetchTropicalSummary,
  type JtwcCyclone,
  type TropicalCyclone,
} from "@/lib/api/tropical";

export type { JtwcBasin, JtwcCyclone } from "@/lib/api/tropical";

interface UseTropicalCyclonesResult {
  cyclones: TropicalCyclone[];
  isLoading: boolean;
  error: Error | null;
  /** JTWC-tracked systems; defaults to [] if unavailable or not yet loaded. */
  jtwc: JtwcCyclone[];
  /** Whether the JTWC feed was reachable on the last fetch. */
  jtwcAvailable: boolean;
}

export function useTropicalCyclones(enabled = true): UseTropicalCyclonesResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ["tropical-cyclones"],
    queryFn: ({ signal }) => fetchTropicalSummary(signal),
    enabled,
    staleTime: 15 * 60 * 1000, // 15 minutes
    refetchInterval: 15 * 60 * 1000,
    placeholderData: { activeStorms: [], jtwc: [], jtwcAvailable: false },
  });

  return {
    cyclones: data?.activeStorms ?? [],
    isLoading,
    error: error as Error | null,
    jtwc: data?.jtwc ?? [],
    jtwcAvailable: data?.jtwcAvailable ?? false,
  };
}
