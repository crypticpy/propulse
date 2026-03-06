/**
 * useSST — TanStack Query hook for NOAA SST data
 */
import { useQuery } from "@tanstack/react-query";
import { fetchSSTData, type SSTDataPoint } from "@/lib/api/sst";

interface UseSSTResult {
  data: SSTDataPoint[];
  isLoading: boolean;
  error: Error | null;
}

export function useSST(enabled = true): UseSSTResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ["sst-data"],
    queryFn: fetchSSTData,
    enabled,
    staleTime: 6 * 60 * 60 * 1000, // 6 hours
    refetchInterval: 6 * 60 * 60 * 1000,
    placeholderData: [],
  });

  return {
    data: data ?? [],
    isLoading,
    error: error as Error | null,
  };
}
