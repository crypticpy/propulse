import { useViewMapSpots } from "@/hooks/useViewMapSpots";

interface UseAzimuthalMapSpotsOptions {
  grid?: string;
  enabled: boolean;
  activationsEnabled: boolean;
}

/**
 * Azimuthal live feed uses the same bound-view filter, budget, and grouping
 * pipeline as globe and flat. Camera is not a membership input.
 */
export function useAzimuthalMapSpots(options: UseAzimuthalMapSpotsOptions) {
  return useViewMapSpots(options);
}
