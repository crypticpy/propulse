/**
 * useSatellites Hook
 *
 * Manages satellite TLE data fetching (via TanStack Query) and real-time
 * position computation (via setInterval). Provides satellite positions,
 * selection state, and pass predictions for the observer's location.
 *
 * Merges Celestrak TLE data with user-imported custom TLEs from the
 * customTLEStore, and annotates each satellite with TLE age and origin.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAllEnabledTLEGroups,
  calculatePosition,
  categoriseSatellite,
  getSimplePassPrediction,
  getTLEAge,
} from "@/lib/api/satellites";
import { useCustomTLEStore } from "@/stores/customTLEStore";
import { useSatelliteGroupStore } from "@/stores/satelliteGroupStore";
import { useUserStore } from "@/stores/userStore";
import { useMapStore } from "@/stores/mapStore";
import type { SatelliteInfoExtended, PassPrediction } from "@/types/satellite";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** Position update interval — refresh satellite positions every 5 seconds */
const POSITION_UPDATE_INTERVAL = 5 * SECOND;

/** TLE data is considered stale after 1 hour */
const TLE_STALE_TIME = 1 * HOUR;

/** Refetch TLE data every 6 hours */
const TLE_REFETCH_INTERVAL = 6 * HOUR;

// ---------------------------------------------------------------------------
// Hook Interface
// ---------------------------------------------------------------------------

interface UseSatellitesResult {
  /** All tracked satellites with current positions */
  satellites: SatelliteInfoExtended[];
  /** Currently selected satellite (by NORAD ID) */
  selectedSatellite: SatelliteInfoExtended | null;
  /** Select a satellite by NORAD ID, or null to deselect */
  selectSatellite: (noradId: number | null) => void;
  /** TLE data loading state */
  isLoading: boolean;
  /** Error from TLE fetch */
  error: Error | null;
  /** Pass predictions for the selected satellite at observer location */
  nextPasses: PassPrediction[];
  /** Whether satellite data is available (TLE loaded or fallback in use) */
  isAvailable: boolean;
  /** Refetch TLE data manually */
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

export function useSatellites(): UseSatellitesResult {
  const { station } = useUserStore();
  const selectedSatelliteId = useMapStore((s) => s.selectedSatelliteId);
  const setSelectedSatelliteId = useMapStore((s) => s.setSelectedSatelliteId);
  const customTLEs = useCustomTLEStore((s) => s.customTLEs);
  const enabledGroups = useSatelliteGroupStore((s) => s.enabledGroups);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  // -------------------------------------------------------------------------
  // TLE Data Query (multi-group)
  // -------------------------------------------------------------------------

  const {
    data: tleData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["satellites", "tle", enabledGroups],
    queryFn: () => fetchAllEnabledTLEGroups(enabledGroups),
    staleTime: TLE_STALE_TIME,
    refetchInterval: TLE_REFETCH_INTERVAL,
    retry: 2,
    placeholderData: (previousData) => previousData,
  });

  // -------------------------------------------------------------------------
  // Position Update Timer
  // -------------------------------------------------------------------------

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, POSITION_UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  // -------------------------------------------------------------------------
  // Compute Satellite Positions (Celestrak + Custom TLEs)
  // -------------------------------------------------------------------------

  const satellites = useMemo((): SatelliteInfoExtended[] => {
    const celestrakData = tleData && tleData.length > 0 ? tleData : [];
    const now = currentTime;

    // Merge: Celestrak TLEs + custom TLEs (custom override duplicates)
    const customOverrideIds = new Set(customTLEs.map((t) => t.noradId));
    const mergedCelestrak = celestrakData.filter(
      (t) => !customOverrideIds.has(t.noradId),
    );

    // Helper: build SatelliteInfoExtended from TLE + computed fields
    const buildSatInfo = (
      tle: { name: string; line1: string; line2: string; noradId: number },
      isCustom: boolean,
    ): SatelliteInfoExtended | null => {
      const position = calculatePosition(tle, now);
      if (!position) return null;

      const category = categoriseSatellite(tle.name, tle.noradId);
      const tleAge = getTLEAge(tle);

      let isVisible = false;
      if (station) {
        const el = computeSimpleElevation(
          position.lat,
          position.lon,
          position.alt,
          station.lat,
          station.lon,
        );
        isVisible = el > 0;
      }

      return {
        name: tle.name,
        line1: tle.line1,
        line2: tle.line2,
        noradId: tle.noradId,
        position,
        isVisible,
        category,
        tleAge,
        isCustom,
      };
    };

    // Process Celestrak satellites
    const celestrakSats: SatelliteInfoExtended[] = [];
    for (const tle of mergedCelestrak) {
      const info = buildSatInfo(tle, false);
      if (info) celestrakSats.push(info);
    }

    // Process custom TLEs
    const customSatResults: SatelliteInfoExtended[] = [];
    for (const tle of customTLEs) {
      const info = buildSatInfo(tle, true);
      if (info) customSatResults.push(info);
    }

    return [...celestrakSats, ...customSatResults];
  }, [tleData, customTLEs, currentTime, station]);

  // -------------------------------------------------------------------------
  // Selected Satellite
  // -------------------------------------------------------------------------

  const selectedSatellite = useMemo((): SatelliteInfoExtended | null => {
    if (selectedSatelliteId === null) {
      return null;
    }
    return satellites.find((s) => s.noradId === selectedSatelliteId) ?? null;
  }, [satellites, selectedSatelliteId]);

  const selectSatellite = useCallback(
    (noradId: number | null) => {
      setSelectedSatelliteId(noradId);
    },
    [setSelectedSatelliteId],
  );

  // -------------------------------------------------------------------------
  // Pass Predictions for Selected Satellite
  // -------------------------------------------------------------------------

  const nextPasses = useMemo((): PassPrediction[] => {
    if (!selectedSatellite || !station) {
      return [];
    }

    try {
      return getSimplePassPrediction(
        selectedSatellite,
        station.lat,
        station.lon,
        new Date(),
        24, // Next 24 hours
      );
    } catch {
      return [];
    }
  }, [selectedSatellite, station]);

  // -------------------------------------------------------------------------
  // Result
  // -------------------------------------------------------------------------

  return {
    satellites,
    selectedSatellite,
    selectSatellite,
    isLoading,
    error: error as Error | null,
    nextPasses,
    isAvailable: satellites.length > 0,
    refetch: () => refetch(),
  };
}

// ---------------------------------------------------------------------------
// Helper — simplified elevation check (duplicated from satellites.ts to
// avoid circular dependency; kept lightweight for per-frame use)
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371.0;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function computeSimpleElevation(
  satLat: number,
  satLon: number,
  satAlt: number,
  obsLat: number,
  obsLon: number,
): number {
  const obsLatRad = obsLat * DEG_TO_RAD;
  const obsLonRad = obsLon * DEG_TO_RAD;
  const satLatRad = satLat * DEG_TO_RAD;
  const satLonRad = satLon * DEG_TO_RAD;

  // Observer position on Earth surface
  const obsR = EARTH_RADIUS_KM;
  const oxe = obsR * Math.cos(obsLatRad) * Math.cos(obsLonRad);
  const oye = obsR * Math.cos(obsLatRad) * Math.sin(obsLonRad);
  const oze = obsR * Math.sin(obsLatRad);

  // Satellite position
  const satR = EARTH_RADIUS_KM + satAlt;
  const sxe = satR * Math.cos(satLatRad) * Math.cos(satLonRad);
  const sye = satR * Math.cos(satLatRad) * Math.sin(satLonRad);
  const sze = satR * Math.sin(satLatRad);

  // Range vector
  const rx = sxe - oxe;
  const ry = sye - oye;
  const rz = sze - oze;
  const rangeMag = Math.sqrt(rx * rx + ry * ry + rz * rz);

  // Up direction at observer
  const upX = Math.cos(obsLatRad) * Math.cos(obsLonRad);
  const upY = Math.cos(obsLatRad) * Math.sin(obsLonRad);
  const upZ = Math.sin(obsLatRad);

  const sinEl = (rx * upX + ry * upY + rz * upZ) / rangeMag;
  return Math.asin(Math.max(-1, Math.min(1, sinEl))) * RAD_TO_DEG;
}

export default useSatellites;
