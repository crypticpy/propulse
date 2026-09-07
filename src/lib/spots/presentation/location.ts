import {
  extractPrefixFromCallsign,
  getLocationFromPrefix,
  type PrefixLocation,
} from "@/lib/data/prefixLocations";
import {
  coordinatesSchema,
  maidenheadSchema,
  type SpotLocation,
  type StationEndpoint,
} from "@/lib/views/spotContracts";
import type { z } from "zod";

type Coordinates = z.infer<typeof coordinatesSchema>;
type ApproximateLocation = Extract<SpotLocation, { kind: "approximate" }>;

const PREFIX_CENTROID_EPSILON = 0.051;
const US_CENTROID: Coordinates = { lat: 39.8, lon: -98.6 };

const PREFIX_NAME_TO_COUNTRY: Record<string, { code: string; name: string }> = {
  USA: { code: "US", name: "United States" },
  Alaska: { code: "US", name: "United States" },
  Hawaii: { code: "US", name: "United States" },
  Guam: { code: "GU", name: "Guam" },
  "Puerto Rico": { code: "PR", name: "Puerto Rico" },
  "US Virgin Islands": { code: "VI", name: "US Virgin Islands" },
  Canada: { code: "CA", name: "Canada" },
  "Canada (Newfoundland)": { code: "CA", name: "Canada" },
  "Canada (Sable Island)": { code: "CA", name: "Canada" },
  Spain: { code: "ES", name: "Spain" },
  "Balearic Islands": { code: "ES", name: "Spain" },
  "Canary Islands": { code: "ES", name: "Spain" },
  "Ceuta & Melilla": { code: "ES", name: "Spain" },
  Norway: { code: "NO", name: "Norway" },
  England: { code: "GB", name: "United Kingdom" },
  Scotland: { code: "GB", name: "United Kingdom" },
  Wales: { code: "GB", name: "United Kingdom" },
  "Northern Ireland": { code: "GB", name: "United Kingdom" },
  Germany: { code: "DE", name: "Germany" },
  France: { code: "FR", name: "France" },
  Japan: { code: "JP", name: "Japan" },
  Australia: { code: "AU", name: "Australia" },
  Brazil: { code: "BR", name: "Brazil" },
  Mexico: { code: "MX", name: "Mexico" },
  Italy: { code: "IT", name: "Italy" },
  Poland: { code: "PL", name: "Poland" },
  Sweden: { code: "SE", name: "Sweden" },
  Finland: { code: "FI", name: "Finland" },
  Denmark: { code: "DK", name: "Denmark" },
  Netherlands: { code: "NL", name: "Netherlands" },
  Belgium: { code: "BE", name: "Belgium" },
  Portugal: { code: "PT", name: "Portugal" },
  Ireland: { code: "IE", name: "Ireland" },
  "Czech Republic": { code: "CZ", name: "Czechia" },
  Ukraine: { code: "UA", name: "Ukraine" },
  Russia: { code: "RU", name: "Russia" },
  "Russia (Asiatic)": { code: "RU", name: "Russia" },
  China: { code: "CN", name: "China" },
  India: { code: "IN", name: "India" },
  "South Africa": { code: "ZA", name: "South Africa" },
  Argentina: { code: "AR", name: "Argentina" },
  Chile: { code: "CL", name: "Chile" },
  "New Zealand": { code: "NZ", name: "New Zealand" },
  Switzerland: { code: "CH", name: "Switzerland" },
  Austria: { code: "AT", name: "Austria" },
  Hungary: { code: "HU", name: "Hungary" },
  Greece: { code: "GR", name: "Greece" },
  Turkey: { code: "TR", name: "Turkey" },
  Israel: { code: "IL", name: "Israel" },
  "South Korea": { code: "KR", name: "South Korea" },
  Taiwan: { code: "TW", name: "Taiwan" },
  Thailand: { code: "TH", name: "Thailand" },
  Indonesia: { code: "ID", name: "Indonesia" },
  Philippines: { code: "PH", name: "Philippines" },
  Malaysia: { code: "MY", name: "Malaysia" },
  Singapore: { code: "SG", name: "Singapore" },
};

export function finiteCoordinates(lat: unknown, lon: unknown): Coordinates | null {
  if (
    typeof lat !== "number" ||
    typeof lon !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }
  return { lat, lon };
}

export function coordinatesNear(
  a: Coordinates,
  b: Coordinates,
  epsilon = PREFIX_CENTROID_EPSILON,
): boolean {
  return Math.abs(a.lat - b.lat) <= epsilon && Math.abs(a.lon - b.lon) <= epsilon;
}

function countryRegion(prefix: PrefixLocation): ApproximateLocation["region"] {
  const mapped = PREFIX_NAME_TO_COUNTRY[prefix.name];
  if (!mapped) return null;
  return {
    id: `country:${mapped.code}`,
    name: mapped.name,
    kind: "country",
    countryCode: mapped.code,
  };
}

function approximateFromPrefix(
  callsign: string,
  coordinates: Coordinates | null,
  reason: string,
): ApproximateLocation | Extract<SpotLocation, { kind: "unavailable" }> {
  const prefix = extractPrefixFromCallsign(callsign);
  const lookup = prefix ? getLocationFromPrefix(prefix) : null;
  if (!lookup && !coordinates) {
    return { kind: "unavailable", reason };
  }
  const coords = coordinates ?? (lookup ? { lat: lookup.lat, lon: lookup.lon } : null);
  if (!coords) return { kind: "unavailable", reason };
  const region = lookup ? countryRegion(lookup) : null;
  return {
    kind: "approximate",
    coordinates: coords,
    source: lookup ? "prefix" : "legacy",
    region,
    precision: region ? "country" : "unknown",
    reason: lookup
      ? `${reason}; prefix ${prefix || callsign} maps to ${lookup.name}`
      : reason,
  };
}

function maidenheadSpan(grid: string): { south: number; west: number; latSpan: number; lonSpan: number } | null {
  const parsed = maidenheadSchema.safeParse(grid);
  if (!parsed.success) return null;
  const normalized = parsed.data;
  let west = -180;
  let south = -90;
  let lonSpan = 360;
  let latSpan = 180;
  west += (normalized.charCodeAt(0) - 65) * 20;
  south += (normalized.charCodeAt(1) - 65) * 10;
  lonSpan = 20;
  latSpan = 10;
  if (normalized.length === 2) return { south, west, latSpan, lonSpan };
  west += Number(normalized[2]) * 2;
  south += Number(normalized[3]);
  lonSpan = 2;
  latSpan = 1;
  if (normalized.length === 4) return { south, west, latSpan, lonSpan };
  west += (normalized.charCodeAt(4) - 65) * (2 / 24);
  south += (normalized.charCodeAt(5) - 65) * (1 / 24);
  lonSpan = 2 / 24;
  latSpan = 1 / 24;
  if (normalized.length === 6) return { south, west, latSpan, lonSpan };
  west += Number(normalized[6]) * (2 / 240);
  south += Number(normalized[7]) * (1 / 240);
  lonSpan = 2 / 240;
  latSpan = 1 / 240;
  return { south, west, latSpan, lonSpan };
}

function maidenheadCenter(grid: string): Coordinates | null {
  const span = maidenheadSpan(grid);
  if (!span) return null;
  return {
    lat: Math.round((span.south + span.latSpan / 2) * 10000) / 10000,
    lon: Math.round((span.west + span.lonSpan / 2) * 10000) / 10000,
  };
}

function coordinateInMaidenhead(coordinates: Coordinates, grid: string): boolean {
  const span = maidenheadSpan(grid);
  if (!span) return false;
  const north = span.south + span.latSpan;
  const east = span.west + span.lonSpan;
  return coordinates.lat >= span.south && coordinates.lat < north
    && coordinates.lon >= span.west && coordinates.lon < east;
}

export interface LocationInput {
  callsign: string;
  lat?: number;
  lon?: number;
  grid?: string;
  locApprox?: boolean;
}

/**
 * Preserve provenance. Prefix centroids and dxLocApprox coordinates stay
 * approximate; they must not become reported Kansas (or any other) stations.
 */
export function resolveSpotLocation(input: LocationInput): SpotLocation {
  const callsign = input.callsign.trim();
  const prefix = extractPrefixFromCallsign(callsign);
  const prefixLocation = prefix ? getLocationFromPrefix(prefix) : null;
  const supplied = finiteCoordinates(input.lat, input.lon);
  const matchesPrefixCentroid = Boolean(
    supplied &&
    prefixLocation &&
    coordinatesNear(supplied, { lat: prefixLocation.lat, lon: prefixLocation.lon }),
  );

  const grid = input.grid?.trim();
  const parsedGrid = grid ? maidenheadSchema.safeParse(grid) : null;
  const normalizedGrid = parsedGrid?.success ? parsedGrid.data : null;
  const gridCoordinates = normalizedGrid ? maidenheadCenter(normalizedGrid) : null;
  const independentCoordinate = Boolean(
    supplied && !input.locApprox && !matchesPrefixCentroid,
  );

  if (independentCoordinate && supplied && normalizedGrid && !coordinateInMaidenhead(supplied, normalizedGrid)) {
    return { kind: "reported-coordinate", coordinates: supplied };
  }

  if (normalizedGrid && gridCoordinates) {
    return {
      kind: "reported-grid",
      grid: normalizedGrid,
      coordinates: gridCoordinates,
    };
  }

  if (supplied && !input.locApprox && !matchesPrefixCentroid) {
    return { kind: "reported-coordinate", coordinates: supplied };
  }

  if (supplied && (input.locApprox || matchesPrefixCentroid)) {
    return approximateFromPrefix(
      callsign,
      supplied,
      input.locApprox
        ? "Upstream marked this coordinate as approximate"
        : "Coordinate matches a callsign-prefix centroid",
    );
  }

  if (prefixLocation) {
    return approximateFromPrefix(
      callsign,
      { lat: prefixLocation.lat, lon: prefixLocation.lon },
      "No reported coordinate or Maidenhead locator",
    );
  }

  if (!callsign || callsign === "?") {
    return { kind: "unavailable", reason: "No usable callsign, grid, or coordinate" };
  }
  return { kind: "unavailable", reason: "Location is not available from this report" };
}

export function locationPrecisionRank(location: SpotLocation): number {
  if (location.kind === "reported-coordinate") return 50;
  if (location.kind === "reported-grid") return 30 + Math.min(location.grid.length, 8);
  if (location.kind === "approximate") {
    if (location.precision === "subdivision") return 20;
    if (location.precision === "country") return 15;
    return 10;
  }
  return 0;
}

export function isMappedLocation(location: SpotLocation): boolean {
  return location.kind !== "unavailable";
}

export function isApproximateLocation(location: SpotLocation): boolean {
  return location.kind === "approximate";
}

export function usPrefixCentroid(): Coordinates {
  return { ...US_CENTROID };
}

export function resolveStationEndpoint(
  callsign: string,
  role: StationEndpoint["role"],
  input: Omit<LocationInput, "callsign">,
): StationEndpoint {
  return {
    callsign: callsign.trim().slice(0, 32) || "UNKNOWN",
    role,
    location: resolveSpotLocation({ callsign, ...input }),
  };
}
