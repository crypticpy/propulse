/**
 * Custom TLE Store
 *
 * Zustand store persisted to localStorage for user-imported custom TLE sets.
 * Supports pasting TLE text, importing from files, and managing custom
 * satellites not in the Celestrak amateur radio group.
 *
 * Use cases: new launches, classified objects, personal experiments.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CustomTLE } from "@/types/satellite";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "propulse-custom-tle";

/** Maximum number of custom TLEs allowed */
const MAX_CUSTOM_TLES = 100;

// ---------------------------------------------------------------------------
// TLE Validation
// ---------------------------------------------------------------------------

/**
 * Validate a TLE line checksum (modulo 10 checksum, columns 1-68).
 * Each digit adds its value, '-' adds 1, all other chars add 0.
 * The checksum digit is in column 69 (index 68).
 */
function validateTLEChecksum(line: string): boolean {
  if (line.length < 69) return false;

  let sum = 0;
  for (let i = 0; i < 68; i++) {
    const ch = line[i];
    if (ch >= "0" && ch <= "9") {
      sum += parseInt(ch, 10);
    } else if (ch === "-") {
      sum += 1;
    }
    // letters, spaces, '+', '.' all contribute 0
  }

  const checkDigit = parseInt(line[68], 10);
  return sum % 10 === checkDigit;
}

/**
 * Validate that a TLE line pair is structurally correct.
 */
function isValidTLEPair(line1: string, line2: string): boolean {
  // Line 1 must start with "1 " and line 2 with "2 "
  if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) return false;

  // Both lines should be 69 characters
  if (line1.length < 69 || line2.length < 69) return false;

  // Validate checksums
  if (!validateTLEChecksum(line1) || !validateTLEChecksum(line2)) return false;

  // NORAD IDs should match (columns 3-7)
  const norad1 = line1.substring(2, 7).trim();
  const norad2 = line2.substring(2, 7).trim();
  if (norad1 !== norad2) return false;

  return true;
}

/**
 * Parse NORAD ID from TLE line 1 (columns 3-7).
 */
function parseNoradId(line1: string): number {
  return parseInt(line1.substring(2, 7).trim(), 10);
}

// ---------------------------------------------------------------------------
// Store Interface
// ---------------------------------------------------------------------------

interface CustomTLEState {
  /** Array of user-imported custom TLEs */
  customTLEs: CustomTLE[];

  /**
   * Add a single custom TLE.
   * Validates checksum and structure before accepting.
   * @returns true if the TLE was accepted, false if invalid or duplicate
   */
  addCustomTLE: (
    name: string,
    line1: string,
    line2: string,
    source?: string,
  ) => boolean;

  /**
   * Remove a custom TLE by NORAD ID.
   */
  removeCustomTLE: (noradId: number) => void;

  /**
   * Remove all custom TLEs.
   */
  clearAllCustom: () => void;

  /**
   * Import multiple TLEs from a block of 3-line TLE text.
   * @returns Number of TLEs successfully imported
   */
  importFromText: (text: string, source?: string) => number;
}

// ---------------------------------------------------------------------------
// Store Implementation
// ---------------------------------------------------------------------------

export const useCustomTLEStore = create<CustomTLEState>()(
  persist(
    (set, get) => ({
      customTLEs: [],

      addCustomTLE: (
        name: string,
        line1: string,
        line2: string,
        source?: string,
      ): boolean => {
        const trimmedLine1 = line1.trim();
        const trimmedLine2 = line2.trim();

        // Validate TLE structure and checksum
        if (!isValidTLEPair(trimmedLine1, trimmedLine2)) {
          return false;
        }

        const noradId = parseNoradId(trimmedLine1);
        if (isNaN(noradId)) return false;

        const state = get();

        // Enforce maximum limit
        if (state.customTLEs.length >= MAX_CUSTOM_TLES) {
          return false;
        }

        // Check for duplicate — update if exists, add if new
        const existingIndex = state.customTLEs.findIndex(
          (t) => t.noradId === noradId,
        );

        const entry: CustomTLE = {
          name: name.trim(),
          line1: trimmedLine1,
          line2: trimmedLine2,
          noradId,
          addedAt: new Date().toISOString(),
          source: source?.trim() || "Custom",
        };

        if (existingIndex >= 0) {
          // Update existing TLE
          set((state) => ({
            customTLEs: state.customTLEs.map((t, i) =>
              i === existingIndex ? entry : t,
            ),
          }));
        } else {
          // Add new TLE
          set((state) => ({
            customTLEs: [...state.customTLEs, entry],
          }));
        }

        return true;
      },

      removeCustomTLE: (noradId: number) => {
        set((state) => ({
          customTLEs: state.customTLEs.filter((t) => t.noradId !== noradId),
        }));
      },

      clearAllCustom: () => {
        set({ customTLEs: [] });
      },

      importFromText: (text: string, source?: string): number => {
        const lines = text
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        let imported = 0;

        for (let i = 0; i <= lines.length - 3; i += 3) {
          const name = lines[i];
          const line1 = lines[i + 1];
          const line2 = lines[i + 2];

          // Skip if lines don't look like TLE line identifiers
          if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) {
            continue;
          }

          const success = get().addCustomTLE(name, line1, line2, source);
          if (success) {
            imported++;
          }
        }

        return imported;
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        customTLEs: state.customTLEs,
      }),
    },
  ),
);
