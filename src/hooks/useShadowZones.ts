/**
 * useShadowZones — Computes communications shadow zones around the station
 *
 * Combines VHF repeater data with NVIS HF coverage analysis to identify
 * areas with no communications coverage. Returns a GeoJSON FeatureCollection
 * suitable for MapLibre rendering.
 */

import { useMemo } from "react";
import { useRepeaters } from "@/hooks/useRepeaters";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useSolarFlux } from "@/hooks/useSolarData";
import { analyzeNVIS } from "@/lib/utils/nvis";
import {
  estimateShadowZones,
  type ShadowZoneResult,
} from "@/lib/atmos/shadowZones";

/**
 * Hook to compute shadow zones around the user's active station location.
 *
 * Uses repeater data for VHF coverage and NVIS analysis for HF coverage,
 * then identifies grid cells that have neither.
 */
export function useShadowZones(): {
  shadowZones: ShadowZoneResult | null;
} {
  const location = useActiveLocation();
  const { repeaters } = useRepeaters();
  const { data: solarFluxData } = useSolarFlux();

  const shadowZones = useMemo(() => {
    if (!location || location.lat === 0 || location.lon === 0) return null;

    // Get SFI from the latest solar flux entry
    const latestFlux = solarFluxData?.at(-1);
    const sfi =
      latestFlux && typeof latestFlux.flux === "number"
        ? latestFlux.flux
        : null;

    // Compute NVIS coverage radius if solar data is available
    let nvisCoverageKm: number | null = null;
    if (sfi !== null) {
      const nvisResult = analyzeNVIS(
        location.lat,
        location.lon,
        sfi,
        new Date(),
      );
      if (nvisResult.nvisViable) {
        nvisCoverageKm = nvisResult.coverageRadius;
      }
    }

    return estimateShadowZones(
      location.lat,
      location.lon,
      repeaters,
      nvisCoverageKm,
    );
  }, [location, repeaters, solarFluxData]);

  return { shadowZones };
}
