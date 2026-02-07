import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";

/**
 * Subscribes to settingsStore.highContrast and toggles
 * the .contrast-more class on document.documentElement.
 * Call from a layout-level component.
 */
export function useHighContrast(): void {
  const highContrast = useSettingsStore((s) => s.highContrast);

  useEffect(() => {
    if (highContrast) {
      document.documentElement.classList.add("contrast-more");
    } else {
      document.documentElement.classList.remove("contrast-more");
    }
  }, [highContrast]);
}
