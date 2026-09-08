/**
 * Color Blind Mode Hook
 *
 * Sets data-color-blind attribute on document.documentElement,
 * which triggers CSS custom property changes for condition/status colors.
 *
 * The Tailwind condition colours (excellent/good/fair/poor) alias the station
 * tone tokens (--su-success/-warning/-danger) in tailwind.config.js, so they
 * swap wherever those tone tokens do — see the note below.
 *
 * The station tone tokens (--su-success/-warning/-danger, which now back
 * signal-green/caution-amber/alert-red too — see tailwind.config.js) are
 * inline styles on <html>, so no attribute-selector rule could outrank them.
 * They are swapped inside applyThemeToDocument() instead, which reads the mode
 * from the settings store; re-applying the theme is therefore the whole
 * update here, and it cannot be undone by a later theme or accent change.
 *
 * Call this hook once at the app root level.
 */

import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { reapplyTheme } from "@/stores/themeStore";

export function useColorBlindMode() {
  const mode = useSettingsStore((s) => s.colorBlindMode ?? "none");

  useEffect(() => {
    if (mode === "none") {
      document.documentElement.removeAttribute("data-color-blind");
    } else {
      document.documentElement.setAttribute("data-color-blind", mode);
    }
    // No cleanup: the branch above already restores the "none" state, and a
    // cleanup that stripped the attribute would flicker the palette on every
    // re-run before the effect re-applied it.
    reapplyTheme();
  }, [mode]);
}
