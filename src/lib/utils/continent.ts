/**
 * Approximate continent classifier (BH2) — TS twin of the SQL
 * continent_for_latlon in supabase/migrations/20260830100000_band_health_ladder.sql
 * (keep the two in sync). Used to derive the operator's Regional scope from
 * the station coordinates; the server derives spot continents with the same
 * boxes, so scope membership matches on both sides.
 *
 * Deliberately coarse: known misses sit on borders (Panama→SA, Turkey→EU,
 * Israel→AF). Hawaii and the east-of-dateline Pacific classify OC before
 * the Americas box, matching DXCC.
 */

export type ContinentCode = "NA" | "SA" | "EU" | "AF" | "AS" | "OC" | "AN";

export const CONTINENT_CODES: readonly ContinentCode[] = [
  "NA",
  "SA",
  "EU",
  "AF",
  "AS",
  "OC",
  "AN",
];

export const CONTINENT_LABEL: Record<ContinentCode, string> = {
  NA: "North America",
  SA: "South America",
  EU: "Europe",
  AF: "Africa",
  AS: "Asia",
  OC: "Oceania",
  AN: "Antarctica",
};

export function continentForLatLon(
  lat: number,
  lon: number,
): ContinentCode | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (lat < -60) return "AN";
  // Pacific east of the dateline (Hawaii, Polynesia) before the Americas
  if (lon < -140 && lat < 30) return "OC";
  // The Americas: split SA off below 13°N east of 82°W
  if (lon >= -170 && lon < -30) {
    return lat < 13 && lon >= -82 ? "SA" : "NA";
  }
  if (lon <= -140) return "NA"; // far-west Aleutians
  // Oceania proper
  if (lon >= 110 && lat < 10) return "OC";
  if (lon >= 150 && lat < 25) return "OC";
  // Europe / Africa / Asia by the usual rough lines
  if (lon >= -30 && lon < 45 && lat >= 36) return "EU";
  if (lon >= 45 && lon < 60 && lat >= 50) return "EU"; // Russia west of Urals
  if (lon >= -30 && lon < 35 && lat < 36) return "AF";
  if (lon >= 35 && lon < 52 && lat < 12) return "AF"; // Horn + Madagascar
  if (lon >= 25) return "AS";
  return null;
}
