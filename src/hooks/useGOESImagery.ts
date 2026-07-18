import { useQuery } from "@tanstack/react-query";
import { getGIBSTileUrl } from "@/lib/api/goes";

const MINUTE = 60 * 1000;

export function useGOESImagery(enabled = true) {
  const {
    data: tileUrl,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["goes-imagery"],
    queryFn: () => getGIBSTileUrl(),
    enabled,
    staleTime: 10 * MINUTE,
    gcTime: 30 * MINUTE,
    refetchInterval: enabled ? 10 * MINUTE : false,
    refetchOnWindowFocus: false,
  });

  return { tileUrl: tileUrl ?? null, isLoading, error };
}
