/**
 * Hook: Noise Floor Grid for Globe Overlay
 *
 * Generates an ITU-R P.372 external noise floor heatmap grid using the
 * noiseFloor.ts calculation module. Recalculates hourly since the main
 * driver (atmospheric noise) varies with time of day.
 *
 * No API call needed -- all computation is done client-side.
 * Only runs when the noiseFloor layer is enabled in mapStore.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useMapStore } from "@/stores/mapStore";
import {
  type NoiseFloorGrid,
  generateNoiseFloorGrid,
  classifyNoiseFloor,
  getDominantNoiseSource,
  calculateNoiseFloor,
} from "@/lib/utils/noiseFloor";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NoiseFloorState {
  /** Grid of noise floor values (lat x lon) */
  grid: NoiseFloorGrid | null;
  /** Whether the grid is being recalculated */
  isCalculating: boolean;
  /** Last computation timestamp */
  lastUpdated: string | null;
  /** Hour used for this computation */
  computedForHour: number | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const HOUR = 60 * 60 * 1000;

/** Default grid resolution in degrees */
const DEFAULT_RESOLUTION = 10;

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Noise floor heatmap grid for globe overlay.
 *
 * Generates a global noise floor grid at the specified frequency.
 * Recalculates hourly to track atmospheric noise diurnal variation.
 *
 * @param frequencyMHz - Center frequency in MHz for noise calculation
 * @param resolution - Grid resolution in degrees (default 10)
 * @returns { grid, isCalculating, lastUpdated }
 */
export function useNoiseFloor(
  frequencyMHz: number = 7.0,
  resolution: number = DEFAULT_RESOLUTION,
) {
  const noiseFloorEnabled = useMapStore((s) => s.layers.noiseFloor);

  const [state, setState] = useState<NoiseFloorState>({
    grid: null,
    isCalculating: false,
    lastUpdated: null,
    computedForHour: null,
  });

  const lastFreqRef = useRef(frequencyMHz);
  const lastResRef = useRef(resolution);

  const computeGrid = useCallback(() => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const month = now.getUTCMonth() + 1;

    setState((prev) => ({ ...prev, isCalculating: true }));

    // Run computation in a microtask to avoid blocking the UI thread
    // (generateNoiseFloorGrid iterates over ~600+ grid points)
    Promise.resolve().then(() => {
      const grid = generateNoiseFloorGrid(
        frequencyMHz,
        utcHour,
        month,
        resolution,
      );

      setState({
        grid,
        isCalculating: false,
        lastUpdated: now.toISOString(),
        computedForHour: utcHour,
      });
    });
  }, [frequencyMHz, resolution]);

  useEffect(() => {
    if (!noiseFloorEnabled) return;

    // Recompute if frequency or resolution changed
    const freqChanged = lastFreqRef.current !== frequencyMHz;
    const resChanged = lastResRef.current !== resolution;
    lastFreqRef.current = frequencyMHz;
    lastResRef.current = resolution;

    if (freqChanged || resChanged || !state.grid) {
      computeGrid();
    }

    // Recompute every hour (atmospheric noise varies with UTC hour)
    const interval = setInterval(() => {
      const currentHour = new Date().getUTCHours();
      if (currentHour !== state.computedForHour) {
        computeGrid();
      }
    }, 1 * HOUR);

    return () => clearInterval(interval);
  }, [
    noiseFloorEnabled,
    frequencyMHz,
    resolution,
    computeGrid,
    state.grid,
    state.computedForHour,
  ]);

  return {
    grid: state.grid,
    isCalculating: state.isCalculating,
    lastUpdated: state.lastUpdated,
  };
}

/**
 * Get noise floor at a specific point (no grid, single computation).
 * Useful for tooltip/popup display when hovering over the globe.
 *
 * @param frequencyMHz - Frequency in MHz
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @returns Noise floor result with components and classification
 */
export function useNoiseFloorAtPoint(
  frequencyMHz: number,
  lat: number,
  lon: number,
) {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const month = now.getUTCMonth() + 1;

  const result = calculateNoiseFloor(frequencyMHz, lat, lon, utcHour, month);
  const classification = classifyNoiseFloor(result.total);
  const dominantSource = getDominantNoiseSource(result);

  return {
    ...result,
    classification,
    dominantSource,
  };
}
