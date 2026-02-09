/**
 * useColorBlindMode Hook
 *
 * Syncs the user's color blind mode preference to the DOM.
 * Sets data-color-blind attribute on document.documentElement,
 * which triggers CSS custom property changes for condition/status colors.
 *
 * The condition colors (excellent, good, fair, poor, caution-amber, alert-red)
 * are defined as CSS variables in design-tokens.css and consumed by Tailwind.
 * Changing the attribute swaps the entire palette globally.
 *
 * Call this hook once at the app root level.
 */

import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";

export function useColorBlindMode() {
  const mode = useSettingsStore((s) => s.colorBlindMode ?? "none");

  useEffect(() => {
    if (mode === "none") {
      document.documentElement.removeAttribute("data-color-blind");
    } else {
      document.documentElement.setAttribute("data-color-blind", mode);
    }

    return () => {
      document.documentElement.removeAttribute("data-color-blind");
    };
  }, [mode]);
}
