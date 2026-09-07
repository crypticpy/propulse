import { CANADA_PROVINCES } from "@/lib/data/canadaProvinces.generated";
import { US_STATES } from "@/lib/data/usStates.generated";
import { WORLD_COUNTRIES } from "@/lib/data/worldCountries.generated";
import type { ClusterGroup } from "@/lib/views/spotContracts";
import { pointInRings } from "./pointInPolygon";

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

export interface GeographyMatch {
  region: Region;
  anchor: { lat: number; lon: number };
}

function countryAnchor(iso: string): { lat: number; lon: number } | null {
  const country = WORLD_COUNTRIES.find((entry) => entry.iso === iso);
  return country ? { lat: country.centroidLat, lon: country.centroidLon } : null;
}

function stateAnchor(borders: readonly (readonly (readonly [number, number])[])[]): { lat: number; lon: number } {
  const ring = borders.reduce((best, current) => current.length > best.length ? current : best, borders[0] ?? []);
  let lat = 0;
  let lonX = 0;
  let lonY = 0;
  for (const [y, x] of ring) {
    lat += y;
    const radians = (x * Math.PI) / 180;
    lonX += Math.cos(radians);
    lonY += Math.sin(radians);
  }
  const n = Math.max(1, ring.length);
  return { lat: lat / n, lon: Math.atan2(lonY, lonX) * 180 / Math.PI };
}

export function lookupCountry(lat: number, lon: number): GeographyMatch | null {
  for (const country of WORLD_COUNTRIES) {
    if (pointInRings(lat, lon, country.borders)) {
      return {
        region: {
          id: `country:${country.iso}`,
          name: country.name,
          kind: "country",
          countryCode: country.iso,
        },
        anchor: { lat: country.centroidLat, lon: country.centroidLon },
      };
    }
  }
  return null;
}

export function lookupUsSubdivision(lat: number, lon: number): GeographyMatch | null {
  for (const state of US_STATES) {
    if (!pointInRings(lat, lon, state.borders)) continue;
    const usps = FIPS_TO_USPS[state.fips];
    if (!usps) continue;
    return {
      region: {
        id: `subdivision:US-${usps}`,
        name: state.name,
        kind: "subdivision",
        countryCode: "US",
      },
      anchor: stateAnchor(state.borders),
    };
  }
  return null;
}

export function lookupCaSubdivision(lat: number, lon: number): GeographyMatch | null {
  for (const province of CANADA_PROVINCES) {
    if (!pointInRings(lat, lon, province.borders)) continue;
    return {
      region: {
        id: `subdivision:CA-${province.iso}`,
        name: province.name,
        kind: "subdivision",
        countryCode: "CA",
      },
      anchor: { lat: province.centroidLat, lon: province.centroidLon },
    };
  }
  return null;
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
  const anchor = countryAnchor(countryCode);
  if (!anchor) return null;
  return {
    region: {
      id: `country:${countryCode}`,
      name: name ?? country?.name ?? countryCode,
      kind: "country",
      countryCode,
    },
    anchor,
  };
}
