/**
 * MUF Data Hook
 *
 * Provides MUF grid data computed from current Solar Flux Index.
 * Uses SFI-based estimation since GIRO ionosonde data is rate-limited.
 */

import { useMemo } from "react";
import { useSolarFlux } from "./useSolarData";
import {
  generateMUFGrid,
  sampleMufSeries,
  type MUFData,
  type MUFSeriesPoint,
} from "@/lib/api/muf";

/**
 * Hook to get MUF grid data based on current SFI and display time
 *
 * @param displayTime - The time to calculate MUF for (supports time machine feature)
 * @returns MUF grid data or null if SFI data not available
 */
export function useMUFData(displayTime: Date): MUFData | null {
  const { data: solarFluxData } = useSolarFlux();

  return useMemo(() => {
    if (!solarFluxData?.length) {
      return null;
    }

    // Use the most recent SFI value
    const latestSFI = solarFluxData[solarFluxData.length - 1];
    const sfi = latestSFI.flux;

    // Generate MUF grid for the display time
    return generateMUFGrid(sfi, displayTime);
  }, [solarFluxData, displayTime]);
}

/**
 * Hook to get just the current SFI value
 * Useful for components that need SFI but not the full grid
 */
export function useCurrentSFI(): number | null {
  const { data: solarFluxData } = useSolarFlux();

  return useMemo(() => {
    if (!solarFluxData?.length) {
      return null;
    }
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);
}

/**
 * 24 hourly MUF-at-QTH samples ending at `displayTime`, for the MUF report's
 * trend chart. `null` location or SFI reports `null` (nothing to sample);
 * no new feed is added, the existing point function is just swept hourly.
 */
export function useMUFHourlySeries(
  location: { lat: number; lon: number } | null,
  displayTime: Date,
  hours = 24,
): MUFSeriesPoint[] | null {
  const sfi = useCurrentSFI();

  return useMemo(() => {
    if (!location || sfi == null) return null;
    return sampleMufSeries(location.lat, location.lon, sfi, displayTime, hours);
  }, [location, sfi, displayTime, hours]);
}
