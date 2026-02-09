/**
 * useTextScale Hook
 *
 * Syncs the user's text scale preference to the DOM.
 * Applies data-text-scale attribute to document.documentElement,
 * which triggers root font-size changes that scale all rem-based sizes.
 *
 * Call this hook once at the app root level.
 */

import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import type { TextScale } from "@/types/user";

/**
 * Hook that syncs text scale preference to DOM
 * Should be called once in App.tsx or similar root component
 */
export function useTextScale(): TextScale {
  const textScale = useSettingsStore((s) => s.textScale ?? "md");

  useEffect(() => {
    // Apply the data attribute to the root element
    document.documentElement.setAttribute("data-text-scale", textScale);

    // Cleanup on unmount (reset to default)
    return () => {
      document.documentElement.removeAttribute("data-text-scale");
    };
  }, [textScale]);

  return textScale;
}

/**
 * Hook to get and set text scale preference
 * Returns current scale and setter function
 */
export function useTextScalePreference(): {
  textScale: TextScale;
  setTextScale: (scale: TextScale) => void;
} {
  const textScale = useSettingsStore((s) => s.textScale ?? "md");
  const updatePreferences = useSettingsStore((s) => s.updatePreferences);

  const setTextScale = (scale: TextScale) => {
    updatePreferences({ textScale: scale });
  };

  return { textScale, setTextScale };
}
