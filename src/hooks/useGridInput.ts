/**
 * useGridInput Hook
 *
 * Provides grid square validation, coordinate conversion, and recent grids management
 * for the Quick Grid Input feature.
 */

import { useState, useCallback } from "react";
import { gridToLatLon } from "@/lib/utils/grid";

const RECENT_GRIDS_KEY = "propulse-recent-grids";
const MAX_RECENT_GRIDS = 10;

/**
 * Validate Maidenhead grid format: 2 letters (A-R) + 2 digits + optional 2 letters (a-x)
 * This is a stricter check for UI feedback during typing.
 */
export function isValidGridFormat(grid: string): boolean {
  if (!grid || grid.length < 4) return false;
  return /^[A-Ra-r]{2}[0-9]{2}([A-Xa-x]{2})?$/i.test(grid);
}

/**
 * Convert grid to coordinates (center of grid square)
 * Returns null if grid is invalid.
 */
export function gridToCoordinates(
  grid: string,
): { lat: number; lon: number } | null {
  try {
    // Use the existing utility from the codebase
    const result = gridToLatLon(grid);
    return result;
  } catch {
    return null;
  }
}

export interface UseGridInputReturn {
  /** Current input value */
  value: string;
  /** Set the input value (auto-uppercased and limited to 6 chars) */
  setValue: (value: string) => void;
  /** Validation state: true = valid, false = invalid, null = incomplete (< 4 chars) */
  isValid: boolean | null;
  /** List of recently used grids */
  recentGrids: string[];
  /** Submit the current value if valid, returns grid and coordinates or null */
  submit: () => { grid: string; lat: number; lon: number } | null;
  /** Clear the input value */
  clear: () => void;
  /** Apply a grid value directly (e.g., from recent grids list) */
  applyGrid: (
    grid: string,
  ) => { grid: string; lat: number; lon: number } | null;
  /** Remove a grid from recent list */
  removeFromRecent: (grid: string) => void;
}

/**
 * Hook for managing Quick Grid Input state
 *
 * @example
 * ```tsx
 * const { value, setValue, isValid, recentGrids, submit, clear } = useGridInput();
 *
 * // In your component
 * <input
 *   value={value}
 *   onChange={(e) => setValue(e.target.value)}
 *   className={isValid === true ? 'border-green-500' : isValid === false ? 'border-red-500' : ''}
 * />
 * ```
 */
export function useGridInput(): UseGridInputReturn {
  const [value, setValue] = useState("");
  const [recentGrids, setRecentGrids] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(RECENT_GRIDS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Determine validation state
  // null = incomplete (< 4 chars), true = valid, false = invalid
  const isValid: boolean | null =
    value.length < 4 ? null : isValidGridFormat(value);

  /**
   * Handle input changes - auto-uppercase and limit to 6 characters
   */
  const handleChange = useCallback((newValue: string) => {
    // Remove any non-alphanumeric characters and uppercase
    const sanitized = newValue.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    // Limit to 6 characters (max grid length we support)
    setValue(sanitized.slice(0, 6));
  }, []);

  /**
   * Add a grid to the recent list (persisted to localStorage)
   */
  const addToRecent = useCallback((grid: string) => {
    const normalizedGrid = grid.toUpperCase();
    setRecentGrids((prev) => {
      // Remove if already exists, add to front
      const filtered = prev.filter((g) => g.toUpperCase() !== normalizedGrid);
      const updated = [normalizedGrid, ...filtered].slice(0, MAX_RECENT_GRIDS);
      try {
        localStorage.setItem(RECENT_GRIDS_KEY, JSON.stringify(updated));
      } catch {
        // Ignore localStorage errors
      }
      return updated;
    });
  }, []);

  /**
   * Remove a grid from the recent list
   */
  const removeFromRecent = useCallback((grid: string) => {
    const normalizedGrid = grid.toUpperCase();
    setRecentGrids((prev) => {
      const filtered = prev.filter((g) => g.toUpperCase() !== normalizedGrid);
      try {
        localStorage.setItem(RECENT_GRIDS_KEY, JSON.stringify(filtered));
      } catch {
        // Ignore localStorage errors
      }
      return filtered;
    });
  }, []);

  /**
   * Submit the current value if valid
   * Returns { grid, lat, lon } or null if invalid
   */
  const submit = useCallback(() => {
    if (!isValidGridFormat(value)) {
      return null;
    }

    const coords = gridToCoordinates(value);
    if (!coords) {
      return null;
    }

    addToRecent(value);
    return { grid: value.toUpperCase(), lat: coords.lat, lon: coords.lon };
  }, [value, addToRecent]);

  /**
   * Apply a grid value directly (e.g., from clicking a recent grid)
   */
  const applyGrid = useCallback(
    (grid: string) => {
      const normalized = grid.toUpperCase();
      if (!isValidGridFormat(normalized)) {
        return null;
      }

      const coords = gridToCoordinates(normalized);
      if (!coords) {
        return null;
      }

      addToRecent(normalized);
      setValue(normalized);
      return { grid: normalized, lat: coords.lat, lon: coords.lon };
    },
    [addToRecent],
  );

  /**
   * Clear the input value
   */
  const clear = useCallback(() => {
    setValue("");
  }, []);

  return {
    value,
    setValue: handleChange,
    isValid,
    recentGrids,
    submit,
    clear,
    applyGrid,
    removeFromRecent,
  };
}
