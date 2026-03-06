/**
 * useTropicalCyclones -- TanStack Query hook for NHC active tropical systems
 */

import { useQuery } from "@tanstack/react-query";

import {
  fetchTropicalCyclones,
  type TropicalCyclone,
} from "@/lib/api/tropical";

interface UseTropicalCyclonesResult {
  cyclones: TropicalCyclone[];
  isLoading: boolean;
  error: Error | null;
}

export function useTropicalCyclones(enabled = true): UseTropicalCyclonesResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ["tropical-cyclones"],
    queryFn: fetchTropicalCyclones,
    enabled,
    staleTime: 15 * 60 * 1000, // 15 minutes
    refetchInterval: 15 * 60 * 1000,
    placeholderData: [],
  });

  return {
    cyclones: data ?? [],
    isLoading,
    error: error as Error | null,
  };
}
