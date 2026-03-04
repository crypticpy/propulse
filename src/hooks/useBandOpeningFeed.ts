/**
 * useBandOpeningFeed Hook
 *
 * Layout-level hook that continuously feeds live spot data to the shared
 * BandOpeningDetector singleton. Mounted in Layout and MobileLayout so
 * the detector receives spots regardless of which route the user is on.
 *
 * This decouples spot feeding from BandConditionsPanel, which previously
 * was the only component that called detector.update().
 */

import { useEffect, useRef } from "react";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { getBandOpeningDetector } from "@/lib/services/bandOpeningService";
import type { LiveSpot } from "@/types/livespot";

/**
 * Feeds live spot data to the band opening detector singleton.
 * Call this once in each layout component (Layout + MobileLayout).
 * No return value — this is a side-effect-only hook.
 */
export function useBandOpeningFeed(): void {
  const location = useActiveLocation();
  const grid = location?.grid;

  // Solar data for plausibility filtering
  const kIndexQuery = useKIndex();
  const solarFluxQuery = useSolarFlux();

  const { spots } = useLiveSpots({
    grid,
    enabled: true,
  });

  const detectorRef = useRef(getBandOpeningDetector());

  // Track last-fed spot set to avoid feeding duplicates on re-render
  const lastSpotsRef = useRef<LiveSpot[]>([]);

  // Feed solar context to the detector for plausibility filtering
  useEffect(() => {
    const kpData = kIndexQuery.data;
    const sfiData = solarFluxQuery.data;
    if (!kpData?.length || !sfiData?.length) return;

    const latestKp = kpData[kpData.length - 1].kp_index;
    const latestSfi = sfiData[sfiData.length - 1].flux;

    detectorRef.current.setSolarContext(latestKp, latestSfi);
  }, [kIndexQuery.data, solarFluxQuery.data]);

  useEffect(() => {
    if (spots.length === 0) return;
    // Skip if same array reference (React Query returns stable refs until refetch)
    if (spots === lastSpotsRef.current) return;
    lastSpotsRef.current = spots;
    detectorRef.current.update(spots);
  }, [spots]);
}
