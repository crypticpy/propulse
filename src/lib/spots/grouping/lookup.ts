import { CANADA_PROVINCES, type ProvinceData } from "@/lib/data/canadaProvinces.generated";
import { US_STATES, type StateData } from "@/lib/data/usStates.generated";
import { WORLD_COUNTRIES, type CountryData } from "@/lib/data/worldCountries.generated";
import type { ClusterGroup } from "@/lib/views/spotContracts";
import { ATLAS_GAP_COUNTRIES } from "./atlasGaps";
import {
  closestPointOnRing,
  minDistanceToRing,
  pointInPolygonWithHoles,
  pointInRings,
  ringArea,
} from "./pointInPolygon";
import { representativePoint, representativePointFromRings } from "./representativePoint";

type Region = NonNullable<ClusterGroup["region"]>;

const FIPS_TO_USPS: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT",
  "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL",
  "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD",
  "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE",
  "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
  "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV",
  "55": "WI", "56": "WY", "60": "AS", "66": "GU", "69": "MP", "72": "PR", "78": "VI",
};

/** Harbor-city snap only; never applied to administrative interiors. */
export const CA_COAST_SNAP_DEG = 0.03;
const CA_INTERNAL_EDGE_DEG = 0.02;
const CA_COAST_UNIQUE_MARGIN_DEG = 0.005;

export interface GeographyMatch {
  region: Region;
  anchor: { lat: number; lon: number };
  provenance: "atlas-centroid" | "atlas-gap-prefix";
}

const countryAnchors = new Map<string, { lat: number; lon: number }>();
const usAnchors = new Map<string, { lat: number; lon: number }>();
const caAnchors = new Map<string, { lat: number; lon: number }>();

function countryAnchor(country: CountryData): { lat: number; lon: number } {
  const cached = countryAnchors.get(country.iso);
  if (cached) return cached;
  const anchor = representativePointFromRings(country.borders)
    ?? { lat: country.centroidLat, lon: country.centroidLon };
  countryAnchors.set(country.iso, anchor);
  return anchor;
}

function usAnchor(state: StateData): { lat: number; lon: number } {
  const cached = usAnchors.get(state.fips);
  if (cached) return cached;
  const anchor = representativePointFromRings(state.borders)
    ?? { lat: state.borders[0]?.[0]?.[0] ?? 0, lon: state.borders[0]?.[0]?.[1] ?? 0 };
  usAnchors.set(state.fips, anchor);
  return anchor;
}

function caAnchor(province: ProvinceData): { lat: number; lon: number } {
  const cached = caAnchors.get(province.iso);
  if (cached) return cached;
  const anchor = representativePoint(province.polygons)
    ?? { lat: province.centroidLat, lon: province.centroidLon };
  caAnchors.set(province.iso, anchor);
  return anchor;
}

function ringsArea(rings: readonly (readonly (readonly [number, number])[])[]): number {
  return rings.reduce((sum, ring) => sum + ringArea(ring), 0);
}

function provinceArea(province: ProvinceData): number {
  return province.polygons.reduce((sum, polygon) => sum + ringArea(polygon.exterior), 0);
}

function pickSmallest<T>(hits: readonly { item: T; area: number; key: string }[]): T | null {
  if (hits.length === 0) return null;
  const ranked = [...hits].sort((a, b) => a.area - b.area || a.key.localeCompare(b.key));
  return ranked[0]!.item;
}

function provinceContains(province: ProvinceData, lat: number, lon: number): boolean {
  return province.polygons.some((polygon) =>
    pointInPolygonWithHoles(lat, lon, polygon.exterior, polygon.holes),
  );
}

function closestOnProvince(province: ProvinceData, lat: number, lon: number): {
  lat: number;
  lon: number;
  dist: number;
} {
  let best = { lat, lon, dist: Number.POSITIVE_INFINITY };
  for (const polygon of province.polygons) {
    const candidate = closestPointOnRing(lat, lon, polygon.exterior);
    if (candidate.dist < best.dist) best = candidate;
  }
  return best;
}

function nearOtherProvince(
  point: { lat: number; lon: number },
  exceptIso: string,
): boolean {
  return CANADA_PROVINCES.some((other) => {
    if (other.iso === exceptIso) return false;
    return other.polygons.some((polygon) =>
      minDistanceToRing(point.lat, point.lon, polygon.exterior) < CA_INTERNAL_EDGE_DEG,
    );
  });
}

function nearUsBoundary(point: { lat: number; lon: number }): boolean {
  return US_STATES.some((state) =>
    state.borders.some((ring) =>
      pointInRings(point.lat, point.lon, [ring])
      || minDistanceToRing(point.lat, point.lon, ring) < CA_INTERNAL_EDGE_DEG,
    ),
  );
}

function coastalSnapProvince(lat: number, lon: number): ProvinceData | null {
  const candidates: { province: ProvinceData; dist: number }[] = [];
  for (const province of CANADA_PROVINCES) {
    const closest = closestOnProvince(province, lat, lon);
    if (closest.dist > CA_COAST_SNAP_DEG) continue;
    if (nearOtherProvince(closest, province.iso)) continue;
    if (nearUsBoundary(closest)) continue;
    candidates.push({ province, dist: closest.dist });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.dist - b.dist || a.province.iso.localeCompare(b.province.iso));
  if (candidates.length === 1) return candidates[0]!.province;
  if (candidates[1]!.dist - candidates[0]!.dist >= CA_COAST_UNIQUE_MARGIN_DEG) {
    return candidates[0]!.province;
  }
  return null;
}

function caMatch(province: ProvinceData): GeographyMatch {
  return {
    region: {
      id: `subdivision:CA-${province.iso}`,
      name: province.name,
      kind: "subdivision",
      countryCode: "CA",
    },
    anchor: caAnchor(province),
    provenance: "atlas-centroid",
  };
}

export function lookupCountry(lat: number, lon: number): GeographyMatch | null {
  const hits: { item: CountryData; area: number; key: string }[] = [];
  for (const country of WORLD_COUNTRIES) {
    if (!pointInRings(lat, lon, country.borders)) continue;
    hits.push({ item: country, area: ringsArea(country.borders), key: country.iso });
  }
  const country = pickSmallest(hits);
  if (!country) return null;
  return {
    region: {
      id: `country:${country.iso}`,
      name: country.name,
      kind: "country",
      countryCode: country.iso,
    },
    anchor: countryAnchor(country),
    provenance: "atlas-centroid",
  };
}

export function lookupUsSubdivision(lat: number, lon: number): GeographyMatch | null {
  const hits: { item: StateData; area: number; key: string }[] = [];
  for (const state of US_STATES) {
    if (!pointInRings(lat, lon, state.borders)) continue;
    hits.push({ item: state, area: ringsArea(state.borders), key: state.fips });
  }
  const state = pickSmallest(hits);
  if (!state) return null;
  const usps = FIPS_TO_USPS[state.fips];
  if (!usps) return null;
  return {
    region: {
      id: `subdivision:US-${usps}`,
      name: state.name,
      kind: "subdivision",
      countryCode: "US",
    },
    anchor: usAnchor(state),
    provenance: "atlas-centroid",
  };
}

export function lookupCaSubdivision(lat: number, lon: number): GeographyMatch | null {
  const hits: { item: ProvinceData; area: number; key: string }[] = [];
  for (const province of CANADA_PROVINCES) {
    if (!provinceContains(province, lat, lon)) continue;
    hits.push({ item: province, area: provinceArea(province), key: province.iso });
  }
  const inside = pickSmallest(hits);
  if (inside) return caMatch(inside);
  if (lookupUsSubdivision(lat, lon)) return null;
  const coastal = coastalSnapProvince(lat, lon);
  return coastal ? caMatch(coastal) : null;
}

/**
 * Honest precision: US/Canada subdivisions only when coordinates support it.
 * Country-only / prefix-approximate callers must not use this for states.
 */
export function lookupRegion(
  lat: number,
  lon: number,
  allowSubdivision: boolean,
): GeographyMatch | null {
  if (allowSubdivision) {
    const subdivision = lookupUsSubdivision(lat, lon) ?? lookupCaSubdivision(lat, lon);
    if (subdivision) return subdivision;
  }
  return lookupCountry(lat, lon);
}

export function countryMatchFromCode(countryCode: string, name?: string): GeographyMatch | null {
  const country = WORLD_COUNTRIES.find((entry) => entry.iso === countryCode);
  if (country) {
    return {
      region: {
        id: `country:${countryCode}`,
        name: name ?? country.name,
        kind: "country",
        countryCode,
      },
      anchor: countryAnchor(country),
      provenance: "atlas-centroid",
    };
  }
  const gap = ATLAS_GAP_COUNTRIES[countryCode];
  if (!gap) return null;
  return {
    region: {
      id: `country:${countryCode}`,
      name: name ?? gap.name,
      kind: "country",
      countryCode,
    },
    anchor: { ...gap.anchor },
    provenance: gap.provenance,
  };
}
