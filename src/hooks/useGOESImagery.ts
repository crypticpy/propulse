import { useQuery } from "@tanstack/react-query";
import { getGIBSTileUrl } from "@/lib/api/goes";

const MINUTE = 60 * 1000;
const GOES_REFRESH_INTERVAL = 10 * MINUTE;

export function useGOESImagery(enabled = true) {
  const {
    data: tileUrl,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["goes-imagery"],
    queryFn: () => {
      const refreshSlot = Math.floor(Date.now() / GOES_REFRESH_INTERVAL);
      return `${getGIBSTileUrl()}?refresh=${refreshSlot}`;
    },
    enabled,
    staleTime: GOES_REFRESH_INTERVAL,
    gcTime: 30 * MINUTE,
    refetchInterval: enabled ? GOES_REFRESH_INTERVAL : false,
    refetchOnWindowFocus: false,
  });

  return { tileUrl: tileUrl ?? null, isLoading, error };
}
