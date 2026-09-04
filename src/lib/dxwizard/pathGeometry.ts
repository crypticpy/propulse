import {
  getPathMetrics,
  formatBearing,
  formatDistance,
  getMidpoint,
  getPathIllumination,
} from "@/lib/utils/path";
import { classifyPropagationMode } from "@/lib/utils/propagationModes";
import type { Season } from "@/lib/utils/propagationModes";
import { isPointInDaylight, getSolarAngle } from "@/lib/utils/sun";
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
  const month = date.getUTCMonth(); // 0-11
  // Meteorological seasons; flip for southern hemisphere
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

export function buildPathSummary(params: {
  homeLat: number;
  homeLon: number;
  targetLat: number;
  targetLon: number;
  pathMode: WizardPathMode;
  mode: WizardMode;
  sfi: number;
  kp: number;
  date?: Date;
}): WizardPathSummary {
  const date = params.date ?? new Date();
  const metrics = getPathMetrics(
    params.homeLat,
    params.homeLon,
    params.targetLat,
    params.targetLon,
  );
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

  const mid = getMidpoint(
    params.homeLat,
    params.homeLon,
    params.targetLat,
    params.targetLon,
  );
  const isDaytime = isPointInDaylight(mid.lat, mid.lon, date);
  const solarAngle = getSolarAngle(mid.lat, mid.lon, date);
  // Near-terminator: solar elevation roughly -6°..+6° → grayline band
  const isGrayLine = Math.abs(90 - solarAngle) <= 6;
  const illumination = getPathIllumination(
    params.homeLat,
    params.homeLon,
    params.targetLat,
    params.targetLon,
    date,
  );
  const grayFromPath = illumination > 15 && illumination < 85;

  const propagation = classifyPropagationMode({
    frequencyMHz: MODE_FREQ_MHZ[params.mode],
    distanceKm: active.distanceKm,
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
