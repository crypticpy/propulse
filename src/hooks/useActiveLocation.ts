/**
 * useActiveLocation Hook
 *
 * Provides hooks for working with the user's active operating location
 * and license status information.
 */

import { useMemo } from "react";
import { useUserStore } from "@/stores/userStore";
import type { OperatingLocation } from "@/types/user";

/**
 * Hook to get the currently active operating location
 * Returns the active location, or the home location if no active location is set
 * Returns null if no station is configured
 */
export function useActiveLocation(): OperatingLocation | null {
  const station = useUserStore((state) => state.station);

  return useMemo(() => {
    if (!station) return null;

    const targetId = station.activeLocationId ?? station.homeLocationId;
    return station.savedLocations.find((loc) => loc.id === targetId) ?? null;
  }, [station]);
}

/**
 * Hook to check if the user is currently operating from a temporary location
 * Returns true if activeLocationId is set (not using home)
 */
export function useIsTemporaryActive(): boolean {
  const station = useUserStore((state) => state.station);

  return useMemo(() => {
    if (!station) return false;
    return station.activeLocationId !== null;
  }, [station]);
}

/**
 * License status information
 */
export interface LicenseStatus {
  /** Whether the license is currently valid (not expired) */
  isValid: boolean;
  /** Days until expiration, null if no expiration date set */
  daysUntilExpiration: number | null;
  /** Whether the license is expiring within 90 days */
  isExpiringSoon: boolean;
}

/**
 * Hook to get the user's license status
 * Calculates expiration information based on the current date
 */
export function useLicenseStatus(): LicenseStatus {
  const license = useUserStore((state) => state.preferences.license);

  return useMemo(() => {
    if (!license) {
      return {
        isValid: false,
        daysUntilExpiration: null,
        isExpiringSoon: false,
      };
    }

    // No expiration date means perpetual license (e.g., CB)
    if (!license.expirationDate) {
      return {
        isValid: true,
        daysUntilExpiration: null,
        isExpiringSoon: false,
      };
    }

    const now = new Date();
    const expiration = new Date(license.expirationDate);
    const diffMs = expiration.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    return {
      isValid: diffDays > 0,
      daysUntilExpiration: diffDays,
      isExpiringSoon: diffDays > 0 && diffDays <= 90,
    };
  }, [license]);
}

/**
 * Hook to get all saved locations
 * Returns an empty array if no station is configured
 */
export function useSavedLocations(): OperatingLocation[] {
  const station = useUserStore((state) => state.station);
  return station?.savedLocations ?? [];
}

/**
 * Hook to get the home location
 * Returns null if no station is configured
 */
export function useHomeLocation(): OperatingLocation | null {
  const station = useUserStore((state) => state.station);

  return useMemo(() => {
    if (!station) return null;
    return (
      station.savedLocations.find((loc) => loc.id === station.homeLocationId) ??
      null
    );
  }, [station]);
}
