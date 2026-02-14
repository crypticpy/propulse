/**
 * useISSTracker Hook
 *
 * Extracts ISS-specific data from the existing useSatellites() hook and
 * computes observer-relative sky position data including elevation, azimuth,
 * pass predictions, sky track for polar charts, and orbit track for 3D views.
 */

import { useMemo } from "react";
import {
  computeElevation,
  computeAzimuth,
  calculatePosition,
  calculateGroundTrack,
  getSimplePassPrediction,
} from "@/lib/api/satellites";
import { useSatellites } from "@/hooks/useSatellites";
import { useUserStore } from "@/stores/userStore";
import type { SatelliteInfo, PassPrediction } from "@/types/satellite";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ISS_NORAD_ID = 25544;
const EARTH_RADIUS_KM = 6371.0;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ISSPassInfo {
  pass: PassPrediction;
  isActive: boolean; // currently happening
  timeToAos: number | null; // seconds until AOS (null if active)
  timeToLos: number | null; // seconds until LOS (null if not active)
  maxEl: number;
  direction: string; // e.g. "SW -> NE" from aosAz/losAz
}

export interface ISSSkyPoint {
  el: number; // elevation degrees
  az: number; // azimuth degrees
  time: Date;
}

export interface UseISSTrackerResult {
  iss: SatelliteInfo | null;
  isAvailable: boolean;
  // Observer-relative (null if no station)
  elevation: number | null;
  azimuth: number | null;
  isAboveHorizon: boolean;
  // Pass info
  currentPass: ISSPassInfo | null;
  nextPass: ISSPassInfo | null;
  // Sky track for polar chart (el/az pairs for the current or next pass)
  skyTrack: ISSSkyPoint[] | null;
  // Footprint radius in km
  footprintRadiusKm: number;
  // Orbit track (+-45 min, with altitude for 3D ring)
  orbitTrack: Array<{
    lat: number;
    lon: number;
    alt: number;
    minutesFromNow: number;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function azimuthToCompass(az: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(az / 45) % 8;
  return dirs[idx];
}

function formatDirection(aosAz: number, losAz: number): string {
  return `${azimuthToCompass(aosAz)} \u2192 ${azimuthToCompass(losAz)}`;
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

export function useISSTracker(): UseISSTrackerResult {
  const { satellites } = useSatellites();
  const { station } = useUserStore();

  // Extract ISS from satellite list
  const iss = useMemo(() => {
    return satellites.find((s) => s.noradId === ISS_NORAD_ID) ?? null;
  }, [satellites]);

  // Compute elevation and azimuth from observer
  const { elevation, azimuth } = useMemo(() => {
    if (!iss || !station) return { elevation: null, azimuth: null };
    const el = computeElevation(
      iss.position.lat,
      iss.position.lon,
      iss.position.alt,
      station.lat,
      station.lon,
    );
    const az = computeAzimuth(
      iss.position.lat,
      iss.position.lon,
      station.lat,
      station.lon,
    );
    return { elevation: el, azimuth: az };
  }, [iss, station]);

  const isAboveHorizon = elevation !== null && elevation > 0;

  // Footprint radius: arccos(R / (R + h)) * R
  const footprintRadiusKm = useMemo(() => {
    if (!iss) return 0;
    const h = iss.position.alt;
    const angle = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + h));
    return angle * EARTH_RADIUS_KM;
  }, [iss]);

  // Compute pass predictions directly from ISS TLE data (no selectSatellite)
  const passes = useMemo(() => {
    if (!iss || !station) return [];
    try {
      return getSimplePassPrediction(
        iss,
        station.lat,
        station.lon,
        new Date(),
        24,
      );
    } catch {
      return [];
    }
  }, [iss, station]);

  // Pass info -- find current and next pass
  const { currentPass, nextPass } = useMemo(() => {
    const now = new Date();
    let current: ISSPassInfo | null = null;
    let next: ISSPassInfo | null = null;

    for (const pass of passes) {
      const aosTime = pass.aos.getTime();
      const losTime = pass.los.getTime();
      const nowTime = now.getTime();

      if (nowTime >= aosTime && nowTime <= losTime) {
        // Active pass
        current = {
          pass,
          isActive: true,
          timeToAos: null,
          timeToLos: Math.round((losTime - nowTime) / 1000),
          maxEl: pass.maxEl,
          direction: formatDirection(pass.aosAz, pass.losAz),
        };
      } else if (nowTime < aosTime && !next) {
        next = {
          pass,
          isActive: false,
          timeToAos: Math.round((aosTime - nowTime) / 1000),
          timeToLos: null,
          maxEl: pass.maxEl,
          direction: formatDirection(pass.aosAz, pass.losAz),
        };
      }
    }

    return { currentPass: current, nextPass: next };
  }, [passes]);

  // Sky track for the relevant pass (current or next)
  const skyTrack = useMemo(() => {
    const relevantPass = currentPass?.pass ?? nextPass?.pass;
    if (!relevantPass || !iss || !station) return null;

    const points: ISSSkyPoint[] = [];
    const startTime = relevantPass.aos.getTime();
    const endTime = relevantPass.los.getTime();
    const step = 30000; // 30 seconds

    for (let t = startTime; t <= endTime; t += step) {
      const time = new Date(t);
      const pos = calculatePosition(iss, time);
      if (!pos) continue;
      const el = computeElevation(
        pos.lat,
        pos.lon,
        pos.alt,
        station.lat,
        station.lon,
      );
      const az = computeAzimuth(pos.lat, pos.lon, station.lat, station.lon);
      points.push({ el, az, time });
    }

    return points;
  }, [currentPass, nextPass, iss, station]);

  // Orbit track +-45 min
  const orbitTrack = useMemo(() => {
    if (!iss) return [];
    const now = new Date();
    const startTime = new Date(now.getTime() - 45 * 60000);
    const track = calculateGroundTrack(iss, startTime, 90, 1);
    return track.map((p, i) => ({
      lat: p.lat,
      lon: p.lon,
      alt: iss.position.alt, // approximate - altitude doesn't change much in 90 min for ISS
      minutesFromNow: i - 45,
    }));
  }, [iss]);

  return {
    iss,
    isAvailable: iss !== null,
    elevation,
    azimuth,
    isAboveHorizon,
    currentPass,
    nextPass,
    skyTrack,
    footprintRadiusKm,
    orbitTrack,
  };
}

export default useISSTracker;
