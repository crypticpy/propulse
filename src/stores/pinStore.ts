/**
 * Zustand store for pin/bookmark management
 *
 * Persists pins to localStorage with key 'propulse-pins'.
 * Supports max 20 pins per user.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { MapPin, PinUpdate, PinCategory } from "../types/pin";
import { getCategoryMeta } from "../types/pin";

/** Maximum number of pins allowed per user */
export const MAX_PINS = 20;

/** localStorage key for pin persistence */
const STORAGE_KEY = "propulse-pins";

/**
 * Generate a unique ID for a new pin
 * Uses crypto.randomUUID() with timestamp fallback for older browsers
 */
function generatePinId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `pin-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Options for creating a new pin
 */
export interface AddPinOptions {
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lon: number;
  /** Maidenhead grid locator */
  grid: string;
  /** Optional user-provided label */
  name?: string;
  /** Optional custom color */
  color?: string;
  /** Optional category */
  category?: PinCategory;
  /** Optional notes */
  notes?: string;
  /** Optional expiration date (ISO string) for DXpeditions */
  expiresAt?: string;
}

/**
 * Pin store state and actions
 */
interface PinStore {
  /** Array of saved pins */
  pins: MapPin[];

  /**
   * Add a new pin to the collection
   * Supports both object-based options and legacy positional arguments
   * @param optionsOrLat - Pin creation options object, or latitude for legacy usage
   * @param lon - Longitude (legacy positional argument)
   * @param grid - Grid locator (legacy positional argument)
   * @param name - Optional name (legacy positional argument)
   * @returns The newly created pin, or null if max limit reached
   */
  addPin: (
    optionsOrLat: AddPinOptions | number,
    lon?: number,
    grid?: string,
    name?: string,
  ) => MapPin | null;

  /**
   * Remove a pin by its ID
   * @param id - The pin ID to remove
   */
  removePin: (id: string) => void;

  /**
   * Update a pin's properties
   * @param id - The pin ID to update
   * @param updates - Partial pin data to merge
   * @returns true if pin was found and updated, false otherwise
   */
  updatePin: (id: string, updates: PinUpdate) => boolean;

  /**
   * Remove all pins
   */
  clearPins: () => void;

  /**
   * Find a pin by its grid locator
   * @param grid - Maidenhead grid locator to search for
   * @returns The matching pin or undefined
   */
  getPinByGrid: (grid: string) => MapPin | undefined;

  /**
   * Find a pin by its ID
   * @param id - Pin ID to search for
   * @returns The matching pin or undefined
   */
  getPinById: (id: string) => MapPin | undefined;

  /**
   * Get all pins filtered by category
   * @param category - Category to filter by, or undefined for all
   * @returns Array of matching pins
   */
  getPinsByCategory: (category: PinCategory | undefined) => MapPin[];
}

/**
 * Pin store with localStorage persistence
 *
 * @example
 * ```tsx
 * const { pins, addPin, removePin, getPinsByCategory } = usePinStore();
 *
 * // Add a new pin (legacy positional args)
 * const pin = addPin(45.5231, -122.6765, "CN85", "Portland");
 *
 * // Add a new pin with full options
 * const dxPin = addPin({
 *   lat: 45.5231,
 *   lon: -122.6765,
 *   grid: "CN85",
 *   name: "DXpedition",
 *   category: "dxpedition",
 *   notes: "Active until Feb 15",
 *   expiresAt: "2026-02-15T00:00:00Z"
 * });
 *
 * // Remove a pin
 * if (pin) removePin(pin.id);
 *
 * // Find by grid
 * const portlandPin = getPinByGrid("CN85");
 *
 * // Get pins by category
 * const dxpeditions = getPinsByCategory("dxpedition");
 * ```
 */
export const usePinStore = create<PinStore>()(
  persist(
    (set, get) => ({
      pins: [],

      addPin: (optionsOrLat, lon?, grid?, name?) => {
        const state = get();

        // Enforce max pin limit
        if (state.pins.length >= MAX_PINS) {
          return null;
        }

        // Normalize arguments: support both object-based and legacy positional args
        let options: AddPinOptions;
        if (typeof optionsOrLat === "number") {
          // Legacy positional arguments: addPin(lat, lon, grid, name?)
          options = {
            lat: optionsOrLat,
            lon: lon!,
            grid: grid!,
            name,
          };
        } else {
          // Object-based options
          options = optionsOrLat;
        }

        // Get default color from category if not provided
        const categoryMeta = getCategoryMeta(options.category);
        const color = options.color || categoryMeta.color;

        const newPin: MapPin = {
          id: generatePinId(),
          lat: options.lat,
          lon: options.lon,
          grid: options.grid.toUpperCase(),
          name: options.name,
          color,
          category: options.category || "custom",
          notes: options.notes,
          expiresAt: options.expiresAt,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          pins: [...state.pins, newPin],
        }));

        return newPin;
      },

      removePin: (id) => {
        set((state) => ({
          pins: state.pins.filter((pin) => pin.id !== id),
        }));
      },

      updatePin: (id, updates) => {
        const state = get();
        const pinIndex = state.pins.findIndex((pin) => pin.id === id);

        if (pinIndex === -1) {
          return false;
        }

        set((state) => ({
          pins: state.pins.map((pin) =>
            pin.id === id ? { ...pin, ...updates } : pin,
          ),
        }));

        return true;
      },

      clearPins: () => {
        set({ pins: [] });
      },

      getPinByGrid: (grid) => {
        const normalizedGrid = grid.toUpperCase();
        return get().pins.find((pin) => pin.grid === normalizedGrid);
      },

      getPinById: (id) => {
        return get().pins.find((pin) => pin.id === id);
      },

      getPinsByCategory: (category) => {
        const { pins } = get();
        if (!category) {
          return pins;
        }
        return pins.filter((pin) => pin.category === category);
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        pins: state.pins,
      }),
    },
  ),
);
