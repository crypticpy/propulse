import { useMemo } from "react";
import { useCurrentSFI } from "@/hooks/useMUFData";
import { useKIndex } from "@/hooks/useSolarData";
import { useActiveFrequency } from "@/hooks/useActiveBandMode";
import { useMapStore } from "@/stores/mapStore";
import { useDXStore } from "@/stores/dxStore";
import { useUserStore } from "@/stores/userStore";
import { useScopedMapLayers } from "@/hooks/useMapOperationalContext";
import { traceRayPath, type RayTraceResult } from "@/lib/utils/rayTrace";
import {
  bounceMarkersFromResult,
  pathModesToRender,
  resolveTraceFrequencyMHz,
  shouldHideOtherPaths,
  type PathLeg,
} from "@/lib/map/targetPathPresentation";

const FALLBACK_SFI = 100;
const FALLBACK_KP = 2;

function safeTrace(args: Parameters<typeof traceRayPath>[0]): RayTraceResult | null {
  try {
    return traceRayPath(args);
  } catch {
    return null;
  }
}

function selectedSpotMatchesTarget(
  spot: { dxLat?: number; dxLon?: number } | null | undefined,
  target: { lat: number; lon: number } | null | undefined,
): boolean {
  if (
    !spot ||
    !target ||
    !Number.isFinite(spot.dxLat) ||
    !Number.isFinite(spot.dxLon)
  ) {
    return false;
  }
  return (
    Math.abs((spot.dxLat as number) - target.lat) < 1e-6 &&
    Math.abs((spot.dxLon as number) - target.lon) < 1e-6
  );
}

/** Shared short/long ray traces and isolate flags for every map projection. */
export function useTargetPathPresentation(displayTime: Date) {
  const target = useMapStore((s) => s.target);
  const pathMode = useMapStore((s) => s.pathMode);
  const isolateTargetPath = useMapStore((s) => s.isolateTargetPath);
  const scopedLayers = useScopedMapLayers();
  const station = useUserStore((s) => s.station);
  const selectedSpot = useDXStore((s) => s.selectedSpot);
  const currentSFI = useCurrentSFI();
  const kIndexData = useKIndex();
  const activeFrequencyHz = useActiveFrequency();

  const hasTarget = Boolean(station && target);
  const hideOtherPaths = shouldHideOtherPaths(isolateTargetPath, hasTarget);
  const showRayPath = hasTarget && (scopedLayers.rayPath || isolateTargetPath);
  const modes = pathModesToRender(pathMode);
  const needsShort = pathMode === "short" || pathMode === "both";
  const needsLong = pathMode === "long" || pathMode === "both";
  const frequencyMHz = resolveTraceFrequencyMHz(
    activeFrequencyHz,
    selectedSpot?.frequency,
    selectedSpotMatchesTarget(selectedSpot, target),
  );
  const sfi = currentSFI ?? FALLBACK_SFI;
  const kp =
    kIndexData.data?.[kIndexData.data.length - 1]?.kp_index ?? FALLBACK_KP;

  const shortResult = useMemo(() => {
    if (!showRayPath || !station || !target || !needsShort) {
      return null;
    }
    return safeTrace({
      startLat: station.lat,
      startLon: station.lon,
      endLat: target.lat,
      endLon: target.lon,
      frequencyMHz,
      date: displayTime,
      sfi,
      kp,
      pathMode: "short",
    });
  }, [
    showRayPath,
    station,
    target,
    needsShort,
    frequencyMHz,
    displayTime,
    sfi,
    kp,
  ]);

  const longResult = useMemo(() => {
    if (!showRayPath || !station || !target || !needsLong) {
      return null;
    }
    return safeTrace({
      startLat: station.lat,
      startLon: station.lon,
      endLat: target.lat,
      endLon: target.lon,
      frequencyMHz,
      date: displayTime,
      sfi,
      kp,
      pathMode: "long",
    });
  }, [
    showRayPath,
    station,
    target,
    needsLong,
    frequencyMHz,
    displayTime,
    sfi,
    kp,
  ]);

  const resultFor = (leg: PathLeg): RayTraceResult | null =>
    leg === "short" ? shortResult : longResult;

  return {
    pathMode,
    modes,
    isolateTargetPath,
    hideOtherPaths,
    showRayPath,
    frequencyMHz,
    shortResult,
    longResult,
    shortBounces: bounceMarkersFromResult(shortResult),
    longBounces: bounceMarkersFromResult(longResult),
    resultFor,
  };
}
