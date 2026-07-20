/**
 * Multi-Hop Ionospheric Ray Trace Engine
 *
 * Evaluates HF propagation viability by tracing a signal path through
 * multiple ionospheric reflection points along a great circle. At each
 * hop, the engine calculates the local f0F2, MUF, D-layer absorption,
 * and overall hop quality.
 *
 * Key physics models:
 * - f0F2 estimation via simplified Chapman model
 * - MUF via Martyn's secant law
 * - D-layer absorption via the shared ITU-R P.533 model (calculateDLayerAbsorption)
 * - Free-space path loss: FSPL = 32.45 + 20*log10(f) + 20*log10(d)
 * - Hop quality scoring combining MUF margin, absorption, and Kp effects
 */

import { classifyTerrain, getPathTerrainLoss } from "./terrain";
import type { TerrainType } from "./terrain";
import {
  calculateDLayerAbsorption,
  calculateZenithAngle,
  estimateFoF2,
  obliqueIncidenceAngle,
} from "./ionosphere";
import { getGeomagneticLatitude } from "./geomagnetic";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371;
const TYPICAL_F2_HOP_KM = 3000;
const MAX_HOPS = 7;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RayTraceInput {
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  frequencyMHz: number;
  date: Date;
  sfi: number;
  kp: number;
  txPowerWatts?: number;
}

export interface ReflectionPoint {
  lat: number;
  lon: number;
  distanceFromStartKm: number;
  fractionAlongPath: number;
  isDaytime: boolean;
  solarZenithAngle: number;
}

export interface HopQuality {
  reflectionPoint: ReflectionPoint;
  f0F2: number;
  hmF2: number;
  muf: number;
  absorptionDb: number;
  isFrequencySupported: boolean;
  qualityScore: number;
}

export interface RayTraceResult {
  hops: HopQuality[];
  totalAbsorptionDb: number;
  totalPathLossDb: number;
  isPathViable: boolean;
  limitingHop: number;
  overallScore: number;
  summary: string;
  terrainTypes?: TerrainType[];
  terrainLoss?: number;
}

export type PathViability =
  | "excellent"
  | "good"
  | "marginal"
  | "unlikely"
  | "impossible";

// ---------------------------------------------------------------------------
// Great-circle geometry
// ---------------------------------------------------------------------------

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const deltaPhi = (lat2 - lat1) * DEG_TO_RAD;
  const deltaLambda = (lon2 - lon1) * DEG_TO_RAD;

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function slerp(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  t: number,
): { lat: number; lon: number } {
  const phi1 = lat1 * DEG_TO_RAD;
  const lambda1 = lon1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const lambda2 = lon2 * DEG_TO_RAD;

  const d = haversineDistance(lat1, lon1, lat2, lon2) / EARTH_RADIUS_KM;
  if (d < 1e-10) return { lat: lat1, lon: lon1 };

  const sinD = Math.sin(d);
  const a = Math.sin((1 - t) * d) / sinD;
  const b = Math.sin(t * d) / sinD;

  const x =
    a * Math.cos(phi1) * Math.cos(lambda1) +
    b * Math.cos(phi2) * Math.cos(lambda2);
  const y =
    a * Math.cos(phi1) * Math.sin(lambda1) +
    b * Math.cos(phi2) * Math.sin(lambda2);
  const z = a * Math.sin(phi1) + b * Math.sin(phi2);

  return {
    lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD_TO_DEG,
    lon: Math.atan2(y, x) * RAD_TO_DEG,
  };
}

// ---------------------------------------------------------------------------
// Solar geometry
// ---------------------------------------------------------------------------

// Solar zenith angle is delegated to the shared calculateZenithAngle in
// ionosphere.ts, which derives it from the SunCalc-based subsolar point
// (equation-of-time corrected) instead of the previous mean-sun approximation
// that could be off by up to ~4 deg of hour angle (~16 min).

// ---------------------------------------------------------------------------
// Ionospheric parameter estimation
// ---------------------------------------------------------------------------

// foF2 estimation is delegated to the shared, CCIR/URSI-calibrated
// estimateFoF2 in ionosphere.ts so the ray-trace engine and the ionosphere
// model no longer disagree (the previous local (1.2 + 0.016*SFI)*sqrt(cos chi)
// heuristic produced ~3.6 MHz at SFI 150 noon, far below observed magnitudes).

function estimateHmF2(zenithDeg: number): number {
  const clampedZenith = Math.min(zenithDeg, 90);
  const cosZ = Math.cos(clampedZenith * DEG_TO_RAD);
  const hmF2 = 250 + 100 * (1 - cosZ);

  if (zenithDeg > 90) {
    const nightLift = Math.min((zenithDeg - 90) / 90, 1) * 50;
    return Math.min(400, hmF2 + nightLift);
  }
  return Math.max(200, Math.min(400, hmF2));
}

/**
 * Ray take-off elevation angle for a symmetric single hop over a spherical
 * earth (ITU-R P.533 geometry). For a ground distance D and reflection height
 * h, with half-hop central angle psi = D / (2 * Re):
 *   tan(elevation) = [cos(psi) - Re/(Re + h)] / sin(psi)
 *
 * The previous flat-earth atan(h / (D/2)) overestimated the elevation (~11.3
 * deg vs ~4.3 deg on a 3000 km / 300 km hop) and so mis-stated the oblique MUF.
 */
export function hopElevationAngle(
  hopDistanceKm: number,
  reflectionHeightKm: number,
): number {
  if (hopDistanceKm <= 0) return 90;
  const psi = hopDistanceKm / (2 * EARTH_RADIUS_KM);
  const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + reflectionHeightKm);
  const tanElev = (Math.cos(psi) - ratio) / Math.sin(psi);
  const elevationDeg = Math.atan(tanElev) * RAD_TO_DEG;
  return Math.max(1, elevationDeg);
}

/**
 * Oblique MUF via the secant law with proper spherical incidence geometry:
 * MUF = foF2 * sec(i), where i is the angle of incidence at the reflection
 * height (obliqueIncidenceAngle). For a 3000 km / ~300 km hop this gives a
 * secant factor of ~3.0-3.6, consistent with M(3000)F2.
 */
export function calculateMUF(
  f0F2: number,
  elevationDeg: number,
  reflectionHeightKm: number,
): number {
  const incidenceDeg = obliqueIncidenceAngle(elevationDeg, reflectionHeightKm);
  const secantFactor = 1 / Math.max(0.05, Math.cos(incidenceDeg * DEG_TO_RAD));
  return f0F2 * secantFactor;
}

function freeSpacePathLoss(frequencyMHz: number, distanceKm: number): number {
  if (frequencyMHz <= 0 || distanceKm <= 0) return 0;
  return 32.45 + 20 * Math.log10(frequencyMHz) + 20 * Math.log10(distanceKm);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreHop(
  frequencyMHz: number,
  muf: number,
  absorptionDb: number,
  kp: number,
  reflectionLat: number,
  reflectionLon: number,
): number {
  const mufRatio = muf > 0 ? frequencyMHz / muf : 999;

  let mufScore: number;
  if (mufRatio > 1.0) mufScore = 0;
  else if (mufRatio > 0.95) mufScore = 15 * ((1.0 - mufRatio) / 0.05);
  else if (mufRatio > 0.85) mufScore = 15 + 45 * ((0.95 - mufRatio) / 0.1);
  else if (mufRatio > 0.5) mufScore = 60 + 40 * ((0.85 - mufRatio) / 0.35);
  else mufScore = 100;

  const absorptionPenalty = Math.min(40, absorptionDb * 1.3);

  // Auroral-zone degradation keys off geomagnetic latitude (IGRF-13 dipole),
  // not geographic latitude: the auroral oval follows the geomagnetic pole,
  // so a ~60 deg geomagnetic threshold is the physically correct trigger.
  let kpPenalty = 0;
  const geomagLat = Math.abs(
    getGeomagneticLatitude(reflectionLat, reflectionLon),
  );
  if (geomagLat > 60) {
    const latFactor = Math.min(1, (geomagLat - 60) / 20);
    kpPenalty = latFactor * kp * 3;
  }

  return Math.max(
    0,
    Math.min(100, Math.round(mufScore - absorptionPenalty - kpPenalty)),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate equally-spaced ionospheric reflection points along a great-circle path.
 */
export function calculateReflectionPoints(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  numHops: number,
  date: Date,
): ReflectionPoint[] {
  const totalDistanceKm = haversineDistance(startLat, startLon, endLat, endLon);
  const points: ReflectionPoint[] = [];

  for (let i = 0; i < numHops; i++) {
    const fraction = (2 * i + 1) / (2 * numHops);
    const { lat, lon } = slerp(startLat, startLon, endLat, endLon, fraction);
    const zenith = calculateZenithAngle(lat, lon, date);

    points.push({
      lat,
      lon,
      distanceFromStartKm: totalDistanceKm * fraction,
      fractionAlongPath: fraction,
      isDaytime: zenith < 90,
      solarZenithAngle: zenith,
    });
  }
  return points;
}

/**
 * Evaluate ionospheric quality at a single reflection point.
 */
export function evaluateHopQuality(
  reflectionLat: number,
  reflectionLon: number,
  frequencyMHz: number,
  date: Date,
  sfi: number,
  kp: number,
  hopDistanceKm: number,
): HopQuality {
  const zenith = calculateZenithAngle(reflectionLat, reflectionLon, date);
  const f0F2 = estimateFoF2(zenith, sfi);
  const hmF2 = estimateHmF2(zenith);
  const elevDeg = hopElevationAngle(hopDistanceKm, hmF2);
  const muf = calculateMUF(f0F2, elevDeg, hmF2);
  const absorptionDb = calculateDLayerAbsorption(
    frequencyMHz,
    zenith,
    sfi,
    elevDeg,
  );
  const isFrequencySupported = frequencyMHz <= muf;
  const qualityScore = scoreHop(
    frequencyMHz,
    muf,
    absorptionDb,
    kp,
    reflectionLat,
    reflectionLon,
  );

  return {
    reflectionPoint: {
      lat: reflectionLat,
      lon: reflectionLon,
      distanceFromStartKm: 0,
      fractionAlongPath: 0,
      isDaytime: zenith < 90,
      solarZenithAngle: zenith,
    },
    f0F2: Math.round(f0F2 * 100) / 100,
    hmF2: Math.round(hmF2),
    muf: Math.round(muf * 100) / 100,
    absorptionDb: Math.round(absorptionDb * 10) / 10,
    isFrequencySupported,
    qualityScore,
  };
}

/**
 * Perform a complete multi-hop ray-trace along a great-circle path.
 */
export function traceRayPath(params: RayTraceInput): RayTraceResult {
  const { startLat, startLon, endLat, endLon, frequencyMHz, date, sfi, kp } =
    params;

  const totalDistanceKm = haversineDistance(startLat, startLon, endLat, endLon);
  const numHops = Math.max(
    1,
    Math.min(MAX_HOPS, Math.ceil(totalDistanceKm / TYPICAL_F2_HOP_KM)),
  );
  const hopDistanceKm = totalDistanceKm / numHops;

  const reflectionPoints = calculateReflectionPoints(
    startLat,
    startLon,
    endLat,
    endLon,
    numHops,
    date,
  );

  const hops: HopQuality[] = reflectionPoints.map((rp) => {
    const hop = evaluateHopQuality(
      rp.lat,
      rp.lon,
      frequencyMHz,
      date,
      sfi,
      kp,
      hopDistanceKm,
    );
    hop.reflectionPoint = rp;
    return hop;
  });

  const totalAbsorptionDb = hops.reduce((sum, h) => sum + h.absorptionDb, 0);
  const isPathViable = hops.every((h) => h.isFrequencySupported);

  let limitingHop = 0;
  let lowestScore = Infinity;
  for (let i = 0; i < hops.length; i++) {
    if (hops[i].qualityScore < lowestScore) {
      lowestScore = hops[i].qualityScore;
      limitingHop = i;
    }
  }

  const fspl = freeSpacePathLoss(frequencyMHz, totalDistanceKm);
  const polarisationLossDb = 1.5;

  // Classify terrain at each ground-bounce point (between hops)
  const bouncePoints: Array<{ lat: number; lon: number }> = [];
  for (let i = 1; i < numHops; i++) {
    const fraction = i / numHops;
    const pt = slerp(startLat, startLon, endLat, endLon, fraction);
    bouncePoints.push(pt);
  }
  const terrainTypes = bouncePoints.map((p) => classifyTerrain(p.lat, p.lon));
  const terrainLoss =
    terrainTypes.length > 0
      ? getPathTerrainLoss(terrainTypes, frequencyMHz)
      : 0;

  const totalPathLossDb =
    Math.round(
      (fspl + totalAbsorptionDb + terrainLoss + polarisationLossDb) * 10,
    ) / 10;

  let overallScore: number;
  if (!isPathViable) {
    overallScore = Math.min(lowestScore, 10);
  } else if (hops.length === 1) {
    overallScore = hops[0].qualityScore;
  } else {
    const sumScores = hops.reduce((s, h) => s + h.qualityScore, 0);
    const weightedSum = sumScores + hops[limitingHop].qualityScore;
    overallScore = Math.round(weightedSum / (hops.length + 1));
  }

  if (kp >= 5) {
    overallScore = Math.round(overallScore * (1 - (kp - 4) * 0.08));
  }
  overallScore = Math.max(0, Math.min(100, overallScore));

  const viability = getPathViability({
    overallScore,
    isPathViable,
  } as RayTraceResult);
  const freqStr = frequencyMHz.toFixed(1);
  const absStr = totalAbsorptionDb.toFixed(1);
  const hopWord = numHops === 1 ? "hop" : "hops";
  const viableStr = isPathViable
    ? `all ${hopWord} viable`
    : `hop ${limitingHop + 1} exceeds MUF`;

  const summary =
    `${numHops}-hop path, ${freqStr} MHz, score ${overallScore}/100 (${viability}) -- ` +
    `${viableStr}, ${absStr} dB total absorption`;

  return {
    hops,
    totalAbsorptionDb: Math.round(totalAbsorptionDb * 10) / 10,
    totalPathLossDb,
    isPathViable,
    limitingHop,
    overallScore,
    summary,
    terrainTypes,
    terrainLoss,
  };
}

/**
 * Classify the overall path viability from a ray-trace result.
 */
export function getPathViability(result: RayTraceResult): PathViability {
  if (!result.isPathViable || result.overallScore < 10) return "impossible";
  if (result.overallScore >= 80) return "excellent";
  if (result.overallScore >= 60) return "good";
  if (result.overallScore >= 35) return "marginal";
  return "unlikely";
}
