/**
 * Decision-layer report for a QTH → target path.
 *
 * #660's phone contact screen consumes this object at phone density.
 * Physics (ITU-R P.533 ray-trace) + NowCast + observed spots only — never VOACAP.
 */

export interface EvidenceStamp {
  /** What produced the value (engine, feed, or computation). */
  basis: string;
  /** When the underlying observation happened, ISO-8601, or null if computed. */
  observedAt: string | null;
  /** When we fetched or computed it, ISO-8601. */
  fetchedAt: string | null;
}

export interface EndAlmanac {
  lat: number;
  lon: number;
  /** HH:MM at the end, UTC. */
  utcTime: string;
  /** HH:MM local mean solar time (lon / 15). */
  localMeanTime: string;
  /** Hours east of UTC (lon / 15). */
  offsetHours: number;
  sunriseUtc: string | null;
  sunsetUtc: string | null;
  /** Polar day/night when SunCalc has no sunrise or sunset. */
  polar: "day" | "night" | null;
  evidence: EvidenceStamp;
}

export interface GreylineSummary {
  active: boolean;
  start: string | null;
  end: string | null;
  label: string;
  evidence: EvidenceStamp;
}

export interface PathAlmanac {
  qth: EndAlmanac;
  target: EndAlmanac;
  greyline: GreylineSummary;
}

export interface PathMufHop {
  lat: number;
  lon: number;
  muf: number;
  f0F2: number;
}

export interface PathMufSample {
  muf: number;
  fot: number;
  luf: number;
  hpf: number;
  hopCount: number;
  limitingHop: number;
  limitingLat: number;
  limitingLon: number;
  hops: PathMufHop[];
  evidence: EvidenceStamp;
}

/**
 * Why a circuit has no path MUF, when it has none.
 *
 * `null` used to stand for all of these at once, which meant a circuit that
 * simply has no path was reported as "need solar flux" even when the flux was
 * supplied. The reason travels with the absence so the verdict can say what is
 * actually missing.
 */
export type PathMufUnavailable =
  | "no_solar_flux"
  | "invalid_clock"
  | "coincident_endpoints"
  | "antipodal_endpoints"
  | "no_control_points";

export type PathMufOutcome =
  | { kind: "sampled"; sample: PathMufSample }
  | { kind: "unavailable"; reason: PathMufUnavailable };

export interface NearbySpotHit {
  id: string;
  dx: string;
  band: string | null;
  frequencyKHz: number;
  distanceKm: number;
  observedAt: string | null;
}

export interface NearbySpotsResult {
  radiusKm: number;
  count: number;
  byBand: Record<string, number>;
  hits: NearbySpotHit[];
  evidence: EvidenceStamp;
}

export type DecisionTone = "open" | "window" | "closed" | "unknown";

export interface DecisionVerdict {
  line: string;
  tone: DecisionTone;
  bestBand: string | null;
  wizardHref: string;
  plannerHref: string;
  evidence: EvidenceStamp;
}

export interface DecisionReport {
  generatedAt: string;
  almanac: PathAlmanac;
  pathMuf: PathMufSample | null;
  nearby: NearbySpotsResult;
  verdict: DecisionVerdict;
}

export const DEFAULT_NEARBY_RADIUS_KM = 500;

export const NEARBY_RADIUS_KM_OPTIONS = [250, 500, 1000, 2000] as const;
