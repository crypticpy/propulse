import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  ActivationFeedSource,
  ActivationProgram,
  ActivationSpot,
  ActivationSpotsResponse,
} from "@/types/activationSpots";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const EMPTY_SPOTS: ActivationSpot[] = [];

export const ACTIVATION_SPOTS_QUERY_KEY = ["activationSpots"] as const;

async function fetchActivationSpots(
  signal: AbortSignal,
): Promise<ActivationSpotsResponse> {
  const response = await fetch("/api/activation/spots", { signal });
  if (!response.ok) {
    throw new Error(`Activation feeds unavailable (${response.status})`);
  }
  return response.json() as Promise<ActivationSpotsResponse>;
}

export interface UseActivationSpotsResult {
  spots: ActivationSpot[];
  spotsByProgram: Record<ActivationProgram, ActivationSpot[]>;
  sources: ActivationFeedSource[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/** Poll the small server-normalized feed shared by sidebar and map layers. */
export function useActivationSpots(enabled = true): UseActivationSpotsResult {
  const query = useQuery({
    queryKey: ACTIVATION_SPOTS_QUERY_KEY,
    queryFn: ({ signal }) => fetchActivationSpots(signal),
    staleTime: 30 * SECOND,
    refetchInterval: MINUTE,
    gcTime: 5 * MINUTE,
    enabled,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const spots = query.data?.spots ?? EMPTY_SPOTS;
  const spotsByProgram = useMemo<Record<ActivationProgram, ActivationSpot[]>>(
    () => ({
      POTA: spots.filter((spot) => spot.program === "POTA"),
      SOTA: spots.filter((spot) => spot.program === "SOTA"),
      WWFF: spots.filter((spot) => spot.program === "WWFF"),
      WWBOTA: spots.filter((spot) => spot.program === "WWBOTA"),
    }),
    [spots],
  );

  return {
    spots,
    spotsByProgram,
    sources: query.data?.sources ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}
