/**
 * useMetar -- TanStack Query hook for nearby METAR aviation weather stations
 * (E6 parity)
 *
 * Builds a small bounding box around the operator's station and fetches
 * area-mode METAR observations via the /api/atmos/metar edge proxy, then
 * sorts the result by great-circle distance from QTH.
 *
 * @module hooks/useMetar
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUserStore } from "@/stores/userStore";

const MINUTE = 60 * 1000;

/** Half-width (degrees) of the bbox requested around the station -- a 2x2 box. */
const HALF_DEG = 1;
/** Number of nearest stations surfaced in the card. */
const NEAREST_COUNT = 5;

export interface MetarBbox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/**
 * Builds a `halfDeg * 2` square bounding box centered on (lat, lon). The
 * center latitude is clamped to +/-88 so the box never crosses a pole and
 * stays within the valid -90..90 latitude range accepted by the server.
 */
export function bboxAround(lat: number, lon: number, halfDeg: number): MetarBbox {
  const clampedLat = Math.max(-88, Math.min(88, lat));
  return {
    minLat: clampedLat - halfDeg,
    minLon: lon - halfDeg,
    maxLat: clampedLat + halfDeg,
    maxLon: lon + halfDeg,
  };
}

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;

/** Great-circle distance between two lat/lon points, in kilometers. */
export function haversineKm(
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

export interface MetarStation {
  icaoId: string | null;
  name: string | null;
  lat: number | null;
  lon: number | null;
  obsTime: number | null;
  temp: number | null;
  dewp: number | null;
  wdir: number | string | null;
  wspd: number | null;
  wgst: number | null;
  visib: number | string | null;
  altim: number | null;
  wxString: string | null;
  fltCat: string | null;
  rawOb: string | null;
}

/**
 * Sorts stations by great-circle distance from (lat, lon), ascending.
 * Stations missing coordinates are pushed to the end.
 */
export function sortStationsByDistance(
  stations: MetarStation[],
  lat: number,
  lon: number,
): MetarStation[] {
  return [...stations].sort((a, b) => {
    const distA =
      a.lat == null || a.lon == null
        ? Number.POSITIVE_INFINITY
        : haversineKm(lat, lon, a.lat, a.lon);
    const distB =
      b.lat == null || b.lon == null
        ? Number.POSITIVE_INFINITY
        : haversineKm(lat, lon, b.lat, b.lon);
    return distA - distB;
  });
}

interface MetarResponse {
  stations?: MetarStation[];
}

async function fetchMetarStations(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<MetarStation[]> {
  const bbox = bboxAround(lat, lon, HALF_DEG);
  const url = `/api/atmos/metar?bbox=${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`;

  const res = await fetch(url, { signal });
  if (!res.ok) return [];

  const data: MetarResponse = await res.json();
  return Array.isArray(data.stations) ? data.stations : [];
}

export interface UseMetarResult {
  stations: MetarStation[];
  isLoading: boolean;
  error: Error | null;
  hasLocation: boolean;
}

export function useMetar(enabled = true): UseMetarResult {
  const station = useUserStore((s) => s.station);
  const lat = station?.lat ?? null;
  const lon = station?.lon ?? null;
  const hasLocation = lat != null && lon != null;

  const { data, isLoading, error } = useQuery<MetarStation[]>({
    queryKey: ["metar", lat, lon],
    queryFn: ({ signal }) => fetchMetarStations(lat!, lon!, signal),
    enabled: enabled && hasLocation,
    staleTime: 5 * MINUTE,
    gcTime: 15 * MINUTE,
    refetchInterval: enabled && hasLocation ? 10 * MINUTE : false,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const stations = useMemo(() => {
    if (!data || lat == null || lon == null) return [];
    return sortStationsByDistance(data, lat, lon).slice(0, NEAREST_COUNT);
  }, [data, lat, lon]);

  return {
    stations,
    isLoading,
    error: error as Error | null,
    hasLocation,
  };
}
