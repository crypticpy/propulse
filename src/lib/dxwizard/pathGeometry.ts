import {
  getPathMetrics,
  formatBearing,
  formatDistance,
  getMidpoint,
  getLongPathPoints,
  getPathPoints,
  getDistance,
} from "@/lib/utils/path";
import { classifyPropagationMode } from "@/lib/utils/propagationModes";
import type { Season } from "@/lib/utils/propagationModes";
import {
  isPointInDaylight,
  getSolarAngle,
  getSubsolarPoint,
} from "@/lib/utils/sun";
import type { WizardPathMode, WizardPathSummary, WizardMode } from "./types";
import { MODE_SNR_TARGET_DB } from "./types";

const MODE_FREQ_MHZ: Record<WizardMode, number> = {
  SSB: 14.2,
  CW: 14.025,
  FT8: 14.074,
  FT4: 14.08,
  RTTY: 14.08,
};

function seasonForDate(date: Date, lat: number): Season {
  const month = date.getUTCMonth();
  const northern: Season[] = [
    "winter",
    "winter",
    "spring",
    "spring",
    "spring",
    "summer",
    "summer",
    "summer",
    "autumn",
    "autumn",
    "autumn",
    "winter",
  ];
  const season = northern[month];
  if (lat < 0) {
    const flip: Record<Season, Season> = {
      spring: "autumn",
      summer: "winter",
      autumn: "spring",
      winter: "summer",
    };
    return flip[season];
  }
  return season;
}

function pathIlluminationFromPoints(
  points: Array<{ lat: number; lon: number }>,
  date: Date,
): number {
  if (points.length === 0) return 0;
  const subsolar = getSubsolarPoint(date);
  let daylightCount = 0;
  for (const point of points) {
    const angle = getDistance(point.lat, point.lon, subsolar.lat, subsolar.lon);
    if (angle < 10018) daylightCount++;
  }
  return (daylightCount / points.length) * 100;
}

export function buildPathSummary(params: {
  homeLat: number;
  homeLon: number;
  targetLat: number;
  targetLon: number;
  pathMode: WizardPathMode;
  mode: WizardMode;
  sfi: number;
  kp: number;
  /** RF frequency for mode classification — prefer recommended band. */
  frequencyMHz?: number;
  date?: Date;
}): WizardPathSummary {
  const date = params.date ?? new Date();
  const metrics = getPathMetrics(
    params.homeLat,
    params.homeLon,
    params.targetLat,
    params.targetLon,
  );
  const shortDistanceKm = metrics.shortPath.distance;
  const active =
    params.pathMode === "long"
      ? {
          distanceKm: metrics.longPath.distance,
          bearing: metrics.longPath.bearing,
          reciprocal: metrics.longPath.reciprocal,
        }
      : {
          distanceKm: metrics.shortPath.distance,
          bearing: metrics.shortPath.bearing,
          reciprocal: metrics.shortPath.reciprocal,
        };

  const pathPoints =
    params.pathMode === "long"
      ? getLongPathPoints(
          params.homeLat,
          params.homeLon,
          params.targetLat,
          params.targetLon,
          40,
        )
      : getPathPoints(
          params.homeLat,
          params.homeLon,
          params.targetLat,
          params.targetLon,
          20,
        );

  const mid =
    pathPoints.length > 0
      ? pathPoints[Math.floor(pathPoints.length / 2)]
      : getMidpoint(
          params.homeLat,
          params.homeLon,
          params.targetLat,
          params.targetLon,
        );

  const isDaytime = isPointInDaylight(mid.lat, mid.lon, date);
  const solarAngle = getSolarAngle(mid.lat, mid.lon, date);
  const isGrayLine = Math.abs(solarAngle - 90) <= 6;
  const illumination = pathIlluminationFromPoints(pathPoints, date);
  const grayFromPath = illumination > 15 && illumination < 85;

  // scoreLongPath expects short-path distance; always pass SP km.
  const propagation = classifyPropagationMode({
    frequencyMHz: params.frequencyMHz ?? MODE_FREQ_MHZ[params.mode],
    distanceKm: shortDistanceKm,
    homeLat: params.homeLat,
    homeLon: params.homeLon,
    targetLat: params.targetLat,
    targetLon: params.targetLon,
    sfi: params.sfi,
    kp: params.kp,
    isDaytime,
    isGrayLine: isGrayLine || grayFromPath,
    season: seasonForDate(date, mid.lat),
  });

  return {
    metrics,
    active: {
      ...active,
      distanceMi: active.distanceKm * 0.621371,
    },
    pathMode: params.pathMode,
    propagation,
  };
}

export function formatPathBearing(bearing: number): string {
  return `${Math.round(bearing)}° ${formatBearing(bearing)}`;
}

export function formatPathDistanceKm(km: number): string {
  return formatDistance(km);
}

export function snrMarginDb(snrEstimate: number, mode: WizardMode): number {
  return snrEstimate - MODE_SNR_TARGET_DB[mode];
}
