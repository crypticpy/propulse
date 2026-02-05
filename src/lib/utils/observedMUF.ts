/**
 * Observed MUF Engine
 *
 * Calculates observed Maximum Usable Frequency from live spot data.
 * Creates a latitude/longitude grid where each cell represents the highest
 * frequency successfully used for communication through that region.
 *
 * This complements the model-based MUF predictions by showing what is
 * actually working right now based on real QSO and spot data.
 */

import type { LiveSpot } from "@/types/livespot";
import { getBandFromFrequency } from "@/lib/api/dxcluster";

// ============================================================================
// Types
// ============================================================================

/**
 * A single grid cell in the observed MUF grid.
 * Each cell covers a square region of `resolution` degrees.
 */
export interface MUFGridCell {
  /** Center latitude of the cell */
  lat: number;
  /** Center longitude of the cell */
  lon: number;
  /** Highest frequency with spots (MHz) */
  observedMUFMHz: number;
  /** Number of spots contributing to this cell */
  spotCount: number;
  /** Average SNR of spots in this cell, null if no SNR data */
  averageSNR: number | null;
  /** Band name of the highest frequency (e.g., "10m") */
  highestBand: string;
  /** Timestamp of the most recent spot in this cell */
  lastSpotAt: number;
}

/**
 * Complete observed MUF grid covering the globe.
 */
export interface ObservedMUFGrid {
  /** All cells with at least one spot */
  cells: MUFGridCell[];
  /** Grid resolution in degrees */
  resolution: number;
  /** When this grid was last computed */
  updatedAt: number;
  /** Total number of spots used in computation */
  totalSpots: number;
}

/**
 * Comparison between model-predicted MUF and observed MUF for a cell.
 */
export interface MUFDivergence {
  /** Center latitude */
  lat: number;
  /** Center longitude */
  lon: number;
  /** Model-predicted MUF in MHz */
  modelMUFMHz: number;
  /** Observed (actual) MUF in MHz */
  observedMUFMHz: number;
  /** Difference: positive = observed higher than model */
  divergenceMHz: number;
  /** Qualitative assessment of the divergence */
  status: "better" | "worse" | "matches" | "no_data";
}

// ============================================================================
// Internal helpers
// ============================================================================

/** Divergence threshold in MHz for "matches" classification */
const DIVERGENCE_THRESHOLD_MHZ = 5;

/**
 * Compute the midpoint of the great-circle path between two lat/lon points.
 * Uses spherical interpolation for accuracy.
 */
function pathMidpoint(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): { lat: number; lon: number } {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;

  const phi1 = lat1 * toRad;
  const lam1 = lon1 * toRad;
  const phi2 = lat2 * toRad;
  const lam2 = lon2 * toRad;

  const dLam = lam2 - lam1;

  const Bx = Math.cos(phi2) * Math.cos(dLam);
  const By = Math.cos(phi2) * Math.sin(dLam);

  const phi3 = Math.atan2(
    Math.sin(phi1) + Math.sin(phi2),
    Math.sqrt((Math.cos(phi1) + Bx) ** 2 + By ** 2),
  );
  const lam3 = lam1 + Math.atan2(By, Math.cos(phi1) + Bx);

  return {
    lat: phi3 * toDeg,
    lon: ((lam3 * toDeg + 540) % 360) - 180, // Normalize to -180..180
  };
}

/**
 * Snap a coordinate to the grid cell center for a given resolution.
 */
function snapToGrid(
  lat: number,
  lon: number,
  resolution: number,
): { lat: number; lon: number } {
  const gridLat = Math.floor(lat / resolution) * resolution + resolution / 2;
  const gridLon = Math.floor(lon / resolution) * resolution + resolution / 2;
  return {
    lat: Math.max(-90 + resolution / 2, Math.min(90 - resolution / 2, gridLat)),
    lon: ((gridLon + 180 + 360) % 360) - 180,
  };
}

/**
 * Create a unique key for a grid cell.
 */
function cellKey(lat: number, lon: number): string {
  return `${lat.toFixed(1)},${lon.toFixed(1)}`;
}

// ============================================================================
// Accumulator for building grid cells
// ============================================================================

interface CellAccumulator {
  lat: number;
  lon: number;
  maxFreqMHz: number;
  spotCount: number;
  snrSum: number;
  snrCount: number;
  highestBand: string;
  lastSpotAt: number;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Calculate the observed MUF grid from live spot data.
 *
 * For each spot with valid spotter and DX coordinates, the path midpoint
 * is computed and assigned to a grid cell. The cell's MUF is the highest
 * frequency observed through that region.
 *
 * @param spots - Array of live spots with location data
 * @param resolution - Grid cell size in degrees (default 10)
 * @returns ObservedMUFGrid with populated cells
 *
 * @example
 * ```ts
 * const grid = calculateObservedMUF(liveSpots, 10);
 * console.log(`${grid.cells.length} cells from ${grid.totalSpots} spots`);
 * ```
 */
export function calculateObservedMUF(
  spots: LiveSpot[],
  resolution: number = 10,
): ObservedMUFGrid {
  const cellMap = new Map<string, CellAccumulator>();
  let totalSpotsUsed = 0;

  for (const spot of spots) {
    // Need both spotter and DX coordinates for midpoint calculation
    if (
      spot.spotterLat == null ||
      spot.spotterLon == null ||
      spot.dxLat == null ||
      spot.dxLon == null
    ) {
      continue;
    }

    // Compute midpoint of propagation path
    const mid = pathMidpoint(
      spot.spotterLat,
      spot.spotterLon,
      spot.dxLat,
      spot.dxLon,
    );

    // Snap to grid
    const gridPos = snapToGrid(mid.lat, mid.lon, resolution);
    const key = cellKey(gridPos.lat, gridPos.lon);

    // Frequency in MHz (spot.frequency is in kHz)
    const freqMHz = spot.frequency / 1000;
    const band = spot.band || getBandFromFrequency(spot.frequency);
    const spotTime =
      spot.time instanceof Date ? spot.time.getTime() : Number(spot.time);

    // Update or create cell accumulator
    const existing = cellMap.get(key);
    if (existing) {
      if (freqMHz > existing.maxFreqMHz) {
        existing.maxFreqMHz = freqMHz;
        existing.highestBand = band;
      }
      existing.spotCount++;
      if (spot.snr != null) {
        existing.snrSum += spot.snr;
        existing.snrCount++;
      }
      if (spotTime > existing.lastSpotAt) {
        existing.lastSpotAt = spotTime;
      }
    } else {
      cellMap.set(key, {
        lat: gridPos.lat,
        lon: gridPos.lon,
        maxFreqMHz: freqMHz,
        spotCount: 1,
        snrSum: spot.snr != null ? spot.snr : 0,
        snrCount: spot.snr != null ? 1 : 0,
        highestBand: band,
        lastSpotAt: spotTime,
      });
    }

    totalSpotsUsed++;
  }

  // Convert accumulators to MUFGridCell array
  const cells: MUFGridCell[] = [];
  for (const acc of cellMap.values()) {
    cells.push({
      lat: acc.lat,
      lon: acc.lon,
      observedMUFMHz: Math.round(acc.maxFreqMHz * 100) / 100,
      spotCount: acc.spotCount,
      averageSNR:
        acc.snrCount > 0
          ? Math.round((acc.snrSum / acc.snrCount) * 10) / 10
          : null,
      highestBand: acc.highestBand,
      lastSpotAt: acc.lastSpotAt,
    });
  }

  return {
    cells,
    resolution,
    updatedAt: Date.now(),
    totalSpots: totalSpotsUsed,
  };
}

/**
 * Compare model-predicted MUF with observed MUF.
 *
 * For each cell with observed data, compute the divergence from the model.
 * Cells where the observed MUF exceeds the model by more than the threshold
 * are marked "better" (conditions are better than predicted). Cells where
 * observed is lower are marked "worse".
 *
 * @param modelMUFGrid - Map of cell keys to model MUF values in MHz
 * @param observedGrid - Observed MUF grid from calculateObservedMUF
 * @returns Array of divergence records for each observed cell
 *
 * @example
 * ```ts
 * const divergences = compareModelVsObserved(modelData, observedGrid);
 * const betterThanPredicted = divergences.filter(d => d.status === "better");
 * ```
 */
export function compareModelVsObserved(
  modelMUFGrid: Map<string, number>,
  observedGrid: ObservedMUFGrid,
): MUFDivergence[] {
  const divergences: MUFDivergence[] = [];

  for (const cell of observedGrid.cells) {
    const key = cellKey(cell.lat, cell.lon);
    const modelMUF = modelMUFGrid.get(key);

    if (modelMUF == null) {
      divergences.push({
        lat: cell.lat,
        lon: cell.lon,
        modelMUFMHz: 0,
        observedMUFMHz: cell.observedMUFMHz,
        divergenceMHz: 0,
        status: "no_data",
      });
      continue;
    }

    const divergence = cell.observedMUFMHz - modelMUF;
    let status: MUFDivergence["status"];

    if (divergence > DIVERGENCE_THRESHOLD_MHZ) {
      status = "better";
    } else if (divergence < -DIVERGENCE_THRESHOLD_MHZ) {
      status = "worse";
    } else {
      status = "matches";
    }

    divergences.push({
      lat: cell.lat,
      lon: cell.lon,
      modelMUFMHz: modelMUF,
      observedMUFMHz: cell.observedMUFMHz,
      divergenceMHz: Math.round(divergence * 100) / 100,
      status,
    });
  }

  return divergences;
}

/**
 * Get the highest observed frequency from an array of spots.
 *
 * Optionally filter by band before finding the maximum.
 *
 * @param spots - Array of live spots
 * @param band - Optional band filter (e.g., "20m")
 * @returns Highest frequency in MHz, or 0 if no matching spots
 *
 * @example
 * ```ts
 * const maxFreq = getHighestObservedFrequency(spots);       // All bands
 * const max10m = getHighestObservedFrequency(spots, "10m"); // 10m only
 * ```
 */
export function getHighestObservedFrequency(
  spots: LiveSpot[],
  band?: string,
): number {
  let maxKHz = 0;

  for (const spot of spots) {
    if (band) {
      const spotBand = spot.band || getBandFromFrequency(spot.frequency);
      if (spotBand !== band) continue;
    }
    if (spot.frequency > maxKHz) {
      maxKHz = spot.frequency;
    }
  }

  return maxKHz / 1000;
}

/**
 * Count spots per band from an array of spots.
 *
 * @param spots - Array of live spots
 * @returns Record mapping band names to spot counts
 *
 * @example
 * ```ts
 * const density = getSpotDensityByBand(spots);
 * // { "20m": 42, "40m": 18, "10m": 7, ... }
 * ```
 */
export function getSpotDensityByBand(
  spots: LiveSpot[],
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const spot of spots) {
    const band = spot.band || getBandFromFrequency(spot.frequency);
    counts[band] = (counts[band] || 0) + 1;
  }

  return counts;
}
