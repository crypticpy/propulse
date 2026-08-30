/**
 * Solar elevation and lit-fractions for the physics arm (Band Health P1).
 *
 * The v1 physics arm scored every band as the plain mean of its day-word and
 * night-word scores — no sun position at all — so a band wide open over the
 * daylit half of the planet read "closed" and fired false surprises all
 * night. P1 replaces that fixed 0.5 blend with a lit fraction computed from
 * real solar elevation at fixed anchor points per continent.
 *
 * The solar position here is the standard low-precision algorithm
 * (Meeus/NOAA): declination + hour angle from days since J2000. Accuracy is
 * well under a degree — far more than a day/night blend needs. This is
 * deliberately NOT the propagation engine (which the collector's Docker
 * context cannot import); it is ~40 lines of astronomy.
 */

const DEG = Math.PI / 180;

/** Milliseconds at the J2000.0 epoch (2000-01-01T12:00:00Z). */
const J2000_MS = Date.UTC(2000, 0, 1, 12);

/** Solar elevation in degrees at (lat, lon) at the given UTC time. */
export function solarElevationDeg(
  latDeg: number,
  lonDeg: number,
  atMs: number,
): number {
  const d = (atMs - J2000_MS) / 86_400_000;

  const meanLon = (280.46 + 0.9856474 * d) % 360;
  const meanAnomaly = (357.528 + 0.9856003 * d) * DEG;
  const eclipticLon =
    (meanLon + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) *
    DEG;
  const obliquity = (23.439 - 0.0000004 * d) * DEG;

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLon));
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLon),
    Math.cos(eclipticLon),
  );

  const gmstDeg = (280.46061837 + 360.98564736629 * d) % 360;
  const hourAngle = (gmstDeg + lonDeg) * DEG - rightAscension;

  const lat = latDeg * DEG;
  const sinElev =
    Math.sin(lat) * Math.sin(declination) +
    Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, sinElev))) / DEG;
}

/**
 * Daylight weight for one point, ramping 0→1 through twilight (−6°…+6°
 * elevation). HF day/night behavior transitions around the terminator, not
 * at a hard sunrise edge, and the ramp also keeps a continent's lit
 * fraction from stepping when one anchor crosses the horizon.
 */
export function daylightWeight(elevationDeg: number): number {
  return Math.max(0, Math.min(1, (elevationDeg + 6) / 12));
}

export interface AnchorPoint {
  lat: number;
  lon: number;
}

/**
 * Fixed anchors per continent, placed in ham-dense population centers so
 * the lit fraction tracks where the reporters actually are (equal weights;
 * density is expressed through placement).
 */
export const CONTINENT_ANCHORS: Record<string, AnchorPoint[]> = {
  NA: [
    { lat: 42.4, lon: -71.1 }, // Boston
    { lat: 41.9, lon: -87.6 }, // Chicago
    { lat: 32.8, lon: -96.8 }, // Dallas
    { lat: 39.7, lon: -105.0 }, // Denver
    { lat: 34.1, lon: -118.2 }, // Los Angeles
  ],
  SA: [
    { lat: -23.5, lon: -46.6 }, // São Paulo
    { lat: -34.6, lon: -58.4 }, // Buenos Aires
    { lat: -12.0, lon: -77.0 }, // Lima
    { lat: 4.7, lon: -74.1 }, // Bogotá
  ],
  EU: [
    { lat: 51.5, lon: -0.1 }, // London
    { lat: 52.5, lon: 13.4 }, // Berlin
    { lat: 41.9, lon: 12.5 }, // Rome
    { lat: 40.4, lon: -3.7 }, // Madrid
    { lat: 55.8, lon: 37.6 }, // Moscow
  ],
  AF: [
    { lat: 30.0, lon: 31.2 }, // Cairo
    { lat: 6.5, lon: 3.4 }, // Lagos
    { lat: -1.3, lon: 36.8 }, // Nairobi
    { lat: -26.2, lon: 28.0 }, // Johannesburg
  ],
  AS: [
    { lat: 35.7, lon: 139.7 }, // Tokyo
    { lat: 37.6, lon: 127.0 }, // Seoul
    { lat: 39.9, lon: 116.4 }, // Beijing
    { lat: 28.6, lon: 77.2 }, // Delhi
    { lat: 13.8, lon: 100.5 }, // Bangkok
    { lat: 55.0, lon: 82.9 }, // Novosibirsk
  ],
  OC: [
    { lat: -33.9, lon: 151.2 }, // Sydney
    { lat: -37.8, lon: 145.0 }, // Melbourne
    { lat: -36.8, lon: 174.8 }, // Auckland
    { lat: -31.9, lon: 115.9 }, // Perth
  ],
};

const ALL_ANCHORS: AnchorPoint[] = Object.values(CONTINENT_ANCHORS).flat();

/** Mean daylight weight over a set of anchors, [0, 1]. */
export function litFraction(anchors: AnchorPoint[], atMs: number): number {
  if (anchors.length === 0) return 0.5;
  let sum = 0;
  for (const a of anchors) {
    sum += daylightWeight(solarElevationDeg(a.lat, a.lon, atMs));
  }
  return sum / anchors.length;
}

/**
 * Ham-weighted planetary lit fraction: mean over every continent anchor.
 * Unlike the geometric half-lit planet, this oscillates diurnally because
 * the anchors (like the hams) cluster in NA/EU/AS.
 */
export function globalLitFraction(atMs: number): number {
  return litFraction(ALL_ANCHORS, atMs);
}
