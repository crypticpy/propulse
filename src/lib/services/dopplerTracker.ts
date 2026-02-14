/**
 * Auto-Doppler Tuning Service
 *
 * Continuously tracks a satellite and computes real-time Doppler-corrected
 * frequencies. Designed to drive auto-tuning via the bridge/CAT interface
 * or display live-corrected frequencies in the satellite panel.
 *
 * Uses satellite.js SGP4 propagation and the existing Doppler calculator.
 */

import { calculatePosition, computeElevation } from "@/lib/api/satellites";
import { calculateRangeRate, calculateDopplerShift } from "@/lib/utils/doppler";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Update interval in milliseconds */
const UPDATE_INTERVAL_MS = 2_000;

/** Maximum allowed frequency change per update (Hz) — safety clamp */
const MAX_DELTA_HZ = 50_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DopplerTrackerState {
  isTracking: boolean;
  satellite: string | null;
  correctedFrequencyHz: number | null;
  dopplerShiftHz: number;
  rangeRateKmS: number;
  elevationDeg: number | null;
}

export interface DopplerTrackerParams {
  tleLine1: string;
  tleLine2: string;
  satelliteName: string;
  baseFrequencyHz: number;
  observerLat: number;
  observerLon: number;
  onUpdate: (state: DopplerTrackerState) => void;
}

// ---------------------------------------------------------------------------
// Service Class
// ---------------------------------------------------------------------------

/**
 * Real-time Doppler tracking service.
 *
 * Call `start()` to begin tracking. The service computes satellite position
 * every 2 seconds, calculates range-rate and Doppler shift, applies a
 * safety clamp of +/-50 kHz per update, and invokes the onUpdate callback.
 *
 * Automatically stops when the satellite drops below the horizon.
 */
export class DopplerTracker {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private state: DopplerTrackerState;
  private lastCorrectedHz: number | null = null;

  constructor() {
    this.state = {
      isTracking: false,
      satellite: null,
      correctedFrequencyHz: null,
      dopplerShiftHz: 0,
      rangeRateKmS: 0,
      elevationDeg: null,
    };
  }

  /**
   * Start tracking a satellite.
   *
   * Every 2 seconds:
   * 1. Calculate current satellite position via SGP4
   * 2. Calculate range-rate from consecutive positions
   * 3. Apply Doppler correction to base frequency
   * 4. Safety: limit change to +/-50 kHz per update
   * 5. Call onUpdate with new state
   *
   * Auto-stops when satellite drops below horizon.
   */
  start(params: DopplerTrackerParams): void {
    // Stop any existing tracking
    this.stop();

    const tle = {
      name: params.satelliteName,
      line1: params.tleLine1,
      line2: params.tleLine2,
      noradId: parseInt(params.tleLine1.substring(2, 7).trim(), 10) || 0,
    };

    this.lastCorrectedHz = null;

    this.state = {
      isTracking: true,
      satellite: params.satelliteName,
      correctedFrequencyHz: params.baseFrequencyHz,
      dopplerShiftHz: 0,
      rangeRateKmS: 0,
      elevationDeg: null,
    };

    const tick = () => {
      const now = new Date();
      const pos = calculatePosition(tle, now);

      if (!pos) {
        // SGP4 propagation failed — stop tracking
        this.stop();
        params.onUpdate(this.state);
        return;
      }

      // Check elevation — auto-stop when below horizon
      const elevation = computeElevation(
        pos.lat,
        pos.lon,
        pos.alt,
        params.observerLat,
        params.observerLon,
      );

      if (elevation <= 0) {
        this.state = {
          ...this.state,
          isTracking: false,
          elevationDeg: elevation,
          correctedFrequencyHz: null,
          dopplerShiftHz: 0,
          rangeRateKmS: 0,
        };
        this.stop();
        params.onUpdate(this.state);
        return;
      }

      // Calculate range rate from positions 1 second apart
      const prevTime = new Date(now.getTime() - 1000);
      const prevPos = calculatePosition(tle, prevTime);

      if (!prevPos) {
        params.onUpdate(this.state);
        return;
      }

      const observer = {
        lat: params.observerLat,
        lon: params.observerLon,
        alt: 0,
      };

      const rangeRateKmS = calculateRangeRate(
        prevPos,
        pos,
        observer,
        1, // 1 second delta
      );

      // Compute Doppler shift on the downlink (what we receive)
      const dopplerShiftHz = calculateDopplerShift(
        rangeRateKmS,
        params.baseFrequencyHz,
      );

      // Compute corrected frequency
      let correctedHz = Math.round(params.baseFrequencyHz + dopplerShiftHz);

      // Safety clamp: limit change to +/-50 kHz per update
      if (this.lastCorrectedHz !== null) {
        const delta = correctedHz - this.lastCorrectedHz;
        if (Math.abs(delta) > MAX_DELTA_HZ) {
          correctedHz = this.lastCorrectedHz + Math.sign(delta) * MAX_DELTA_HZ;
        }
      }

      this.lastCorrectedHz = correctedHz;

      this.state = {
        isTracking: true,
        satellite: params.satelliteName,
        correctedFrequencyHz: correctedHz,
        dopplerShiftHz: Math.round(dopplerShiftHz),
        rangeRateKmS,
        elevationDeg: elevation,
      };

      params.onUpdate(this.state);
    };

    // Run immediately, then on interval
    tick();
    this.intervalId = setInterval(tick, UPDATE_INTERVAL_MS);
  }

  /**
   * Stop tracking and clean up the interval.
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.state = {
      ...this.state,
      isTracking: false,
    };
    this.lastCorrectedHz = null;
  }

  /**
   * Get the current tracker state.
   */
  getState(): DopplerTrackerState {
    return { ...this.state };
  }
}
