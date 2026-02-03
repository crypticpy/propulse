/**
 * useDocumentTitle Hook
 *
 * Manages the browser document title (tab title).
 * Provides utilities for setting dynamic titles, including
 * a specialized hook for showing DX spot counts.
 */

import { useEffect } from "react";

/**
 * Hook to set the document title
 * Restores the previous title on unmount
 *
 * @param title - The title to set
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    return () => {
      document.title = prevTitle;
    };
  }, [title]);
}

/**
 * Hook to show DX spot count in the browser tab title
 * Format: "(42) PropSphere" when spots > 0, otherwise just "PropSphere"
 *
 * @param spotCount - Number of active DX spots
 * @param baseTitle - Base title to use (default: "PropSphere")
 */
export function useSpotCountTitle(
  spotCount: number,
  baseTitle = "PropSphere",
): void {
  useDocumentTitle(spotCount > 0 ? `(${spotCount}) ${baseTitle}` : baseTitle);
}
