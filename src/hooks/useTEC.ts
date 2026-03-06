/**
 * TanStack Query hook for ionospheric TEC (Total Electron Content) data.
 * TEC maps are updated roughly every 15 minutes upstream, so we match
 * that cadence with stale/refetch timers.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchTECData } from "@/lib/api/tec";
import type { TECData } from "@/lib/api/tec";

const MINUTE = 60 * 1000;

const EMPTY_TEC: TECData = { grid: [], timestamp: null, available: false };

export function useTEC(enabled = true) {
  const { data, isLoading, error } = useQuery<TECData>({
    queryKey: ["ionospheric-tec"],
    queryFn: ({ signal }) => fetchTECData(signal),
    enabled,
    staleTime: 15 * MINUTE,
    gcTime: 30 * MINUTE,
    refetchInterval: enabled ? 15 * MINUTE : false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
  });

  return {
    tecData: data ?? EMPTY_TEC,
    isLoading,
    error,
  };
}
