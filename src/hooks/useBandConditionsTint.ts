/**
 * useBandConditionsTint
 *
 * Returns a mapping of BandId -> propagation status for tinting the band grid.
 * Uses station QTH, current solar data, and path illumination to compute
 * per-band propagation conditions.
 */

import { useMemo } from "react";
import { useUserStore } from "@/stores/userStore";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { getBandConditionsForPath } from "@/lib/utils/bands";
import { getPathIllumination } from "@/lib/utils/path";

type BandStatus = "excellent" | "good" | "fair" | "poor" | "closed";

const STATUS_COLORS: Record<BandStatus, string> = {
  excellent: "rgba(34, 197, 94, 0.15)", // green
  good: "rgba(234, 179, 8, 0.12)", // yellow
  fair: "rgba(249, 115, 22, 0.10)", // orange
  poor: "rgba(239, 68, 68, 0.08)", // red
  closed: "rgba(107, 114, 128, 0.06)", // gray
};

export function useBandConditionsTint(): {
  tints: Record<string, string>;
  statuses: Record<string, BandStatus>;
} {
  const station = useUserStore((s) => s.station);
  const savedTargets = useUserStore((s) => s.savedTargets);
  const { data: kData } = useKIndex();
  const { data: sfiData } = useSolarFlux();

  return useMemo(() => {
    const tints: Record<string, string> = {};
    const statuses: Record<string, BandStatus> = {};

    if (!station?.lat || !station?.lon) return { tints, statuses };

    // Use first saved target if available, otherwise default to mid-Atlantic generic DX target
    const firstTarget = savedTargets?.[0];
    const tLat = firstTarget?.lat ?? 45;
    const tLon = firstTarget?.lon ?? -30;

    const kp = kData?.[kData.length - 1]?.kp_index ?? 3;
    const sfi = sfiData?.[sfiData.length - 1]?.flux ?? 100;
    const illumination = getPathIllumination(
      station.lat,
      station.lon,
      tLat,
      tLon,
      new Date(),
    );

    const conditions = getBandConditionsForPath(
      station.lat,
      station.lon,
      tLat,
      tLon,
      kp,
      sfi,
      illumination,
    );

    for (const c of conditions) {
      const status = c.status;
      statuses[c.band] = status;
      tints[c.band] = STATUS_COLORS[status] ?? "";
    }

    return { tints, statuses };
  }, [station, savedTargets, kData, sfiData]);
}
