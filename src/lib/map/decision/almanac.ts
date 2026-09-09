import SunCalc from "suncalc";
import {
  getMutualGreylineWindow,
  GREYLINE_WINDOW_MINUTES,
} from "@/lib/utils/greyline";
import type {
  EndAlmanac,
  EvidenceStamp,
  GreylineSummary,
  PathAlmanac,
} from "./types";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function isValidClock(date: Date): boolean {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

/** HH:MM from the UTC clock of `date`. */
export function formatUtcHm(date: Date): string {
  if (!isValidClock(date)) return "—";
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}

function validSunTime(value: Date | undefined): Date | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  return value;
}

function computedStamp(
  computedAt: Date,
  basis: string,
): EvidenceStamp {
  return {
    basis,
    observedAt: null,
    fetchedAt: isValidClock(computedAt) ? computedAt.toISOString() : null,
  };
}

/**
 * Local mean solar time at `lon`: UTC shifted by lon/15 hours.
 * Used when we have coordinates but no IANA timezone.
 */
export function localMeanDate(date: Date, lon: number): Date {
  return new Date(date.getTime() + (lon / 15) * 3_600_000);
}

export function endAlmanac(
  lat: number,
  lon: number,
  date: Date,
  label: string,
  computedAt: Date = new Date(),
): EndAlmanac {
  if (!isValidClock(date)) {
    return {
      lat,
      lon,
      utcTime: "—",
      localMeanTime: "—",
      offsetHours: lon / 15,
      sunriseUtc: null,
      sunsetUtc: null,
      polar: null,
      evidence: computedStamp(computedAt, `SunCalc ${label}; invalid display time`),
    };
  }
  const times = SunCalc.getTimes(date, lat, lon);
  const sunrise = validSunTime(times.sunrise);
  const sunset = validSunTime(times.sunset);
  const sunPos = SunCalc.getPosition(date, lat, lon);
  const altitudeDeg = sunPos.altitude * (180 / Math.PI);

  let polar: EndAlmanac["polar"] = null;
  if (!sunrise && !sunset) {
    polar = altitudeDeg > 0 ? "day" : "night";
  }

  const lmt = localMeanDate(date, lon);
  return {
    lat,
    lon,
    utcTime: formatUtcHm(date),
    localMeanTime: formatUtcHm(lmt),
    offsetHours: lon / 15,
    sunriseUtc: sunrise ? sunrise.toISOString() : null,
    sunsetUtc: sunset ? sunset.toISOString() : null,
    polar,
    evidence: computedStamp(
      computedAt,
      `SunCalc ${label}; LMT = UTC + lon/15`,
    ),
  };
}

function greylineSummary(
  qthLat: number,
  qthLon: number,
  targetLat: number,
  targetLon: number,
  date: Date,
  computedAt: Date,
): GreylineSummary {
  const evidence = computedStamp(
    computedAt,
    `Mutual ±${GREYLINE_WINDOW_MINUTES} min terminator windows (SunCalc)`,
  );
  if (!isValidClock(date)) {
    return {
      active: false,
      start: null,
      end: null,
      label: "No mutual grey-line in the next day",
      evidence,
    };
  }
  const window = getMutualGreylineWindow(
    qthLat,
    qthLon,
    targetLat,
    targetLon,
    date,
    GREYLINE_WINDOW_MINUTES,
  );
  if (!window) {
    return {
      active: false,
      start: null,
      end: null,
      label: "No mutual grey-line in the next day",
      evidence,
    };
  }
  const startHm = formatUtcHm(window.start);
  const endHm = formatUtcHm(window.end);
  return {
    active: window.active,
    start: window.start.toISOString(),
    end: window.end.toISOString(),
    label: window.active
      ? `Mutual grey-line now until ${endHm}z`
      : `Mutual grey-line ${startHm}–${endHm}z`,
    evidence,
  };
}

export function pathAlmanac(
  qth: { lat: number; lon: number },
  target: { lat: number; lon: number },
  date: Date,
  computedAt: Date = new Date(),
): PathAlmanac {
  return {
    qth: endAlmanac(qth.lat, qth.lon, date, "QTH", computedAt),
    target: endAlmanac(target.lat, target.lon, date, "target", computedAt),
    greyline: greylineSummary(
      qth.lat,
      qth.lon,
      target.lat,
      target.lon,
      date,
      computedAt,
    ),
  };
}
