/**
 * Hook: NCDXF/IARU International Beacon Network
 *
 * Provides real-time beacon transmission schedule state using the
 * beaconNetwork.ts data module. Updates every second to track the
 * 10-second transmission slots of the 18-beacon, 5-frequency network.
 *
 * No API call needed -- all data is computed locally from UTC time.
 * The 1-second interval only runs when the beacons layer is enabled.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useMapStore } from "@/stores/mapStore";
import {
  type BeaconStation,
  type BeaconTransmission,
  BEACON_STATIONS,
  BEACON_FREQUENCIES,
  getActiveTransmissions,
  getCurrentBeacon,
  getBeaconStates,
} from "@/lib/data/beaconNetwork";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BeaconState extends BeaconStation {
  /** Whether this beacon is currently transmitting */
  isTransmitting: boolean;
  /** Current band in kHz if transmitting, null otherwise */
  currentBandKHz: number | null;
}

export interface BeaconNetworkState {
  /** All 18 beacon stations with current transmission state */
  beacons: BeaconState[];
  /** The beacon currently on the primary band (14.100 MHz) */
  currentBeacon: BeaconTransmission;
  /** All 5 currently active transmissions (one per band) */
  activeTransmissions: BeaconTransmission[];
  /** Available beacon frequencies in kHz */
  frequencies: readonly number[];
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Real-time beacon network state.
 *
 * Updates every 1 second when the beacons layer is enabled.
 * Returns all beacon stations with their current transmission status,
 * the current primary beacon, and all active transmissions.
 *
 * @returns BeaconNetworkState
 */
export function useBeaconNetwork(): BeaconNetworkState {
  const beaconsEnabled = useMapStore((s) => s.layers.beacons);

  const computeState = useCallback((): BeaconNetworkState => {
    const now = new Date();
    return {
      beacons: getBeaconStates(now),
      currentBeacon: getCurrentBeacon(now),
      activeTransmissions: getActiveTransmissions(now),
      frequencies: BEACON_FREQUENCIES,
    };
  }, []);

  const [state, setState] = useState<BeaconNetworkState>(computeState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!beaconsEnabled) {
      // Clear interval when layer is disabled
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial computation
    setState(computeState());

    // Update every second to track 10-second transmission slots
    intervalRef.current = setInterval(() => {
      setState(computeState());
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [beaconsEnabled, computeState]);

  return state;
}

/**
 * Static list of all beacon stations (no reactivity needed).
 * Useful for rendering beacon markers on the globe without a timer.
 */
export function useBeaconStations(): BeaconStation[] {
  return BEACON_STATIONS;
}
