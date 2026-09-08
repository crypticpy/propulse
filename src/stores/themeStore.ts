/**
 * Theme Store
 *
 * Zustand store for managing application theme state.
 * Persists to localStorage and syncs across tabs.
 */

import { create } from "zustand";
import {
  type ThemeId,
  type AccentColor,
  getTheme,
  getAccentPreset,
  applyThemeToDocument,
} from "@/lib/themes";
import { useSettingsStore } from "@/stores/settingsStore";

interface ThemeState {
  themeId: ThemeId;
  accentId: string;
  customPrimary: string | null;

  setTheme: (themeId: ThemeId) => void;
  setAccent: (accentId: string) => void;
  setCustomColors: (primary: string | null) => void;
}

const STORAGE_KEY = "propulse-theme";

// This store hand-rolls its localStorage persistence (predates the versioned
// zustand/persist + migrate pattern used elsewhere — see CLAUDE.md), so there
// is no version field to bump. `customSecondary` (Settings' now-removed
// "Secondary Color" control) is simply never read from the parsed blob below,
// so a stale key left over in an old visitor's localStorage is inert — the
// equivalent of a migration step dropping it, without needing one.
function loadPersistedTheme(): Partial<ThemeState> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

function persistTheme(state: Partial<ThemeState>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

function applyCurrentTheme(state: ThemeState) {
  const theme = getTheme(state.themeId);
  let accent: AccentColor | undefined;

  if (state.customPrimary) {
    accent = { id: "custom", name: "Custom", primary: state.customPrimary };
  } else {
    accent = getAccentPreset(state.accentId);
  }

  // Colour-blind mode is part of every theme write, not a later overlay: the
  // tone tokens it swaps are inline styles on <html>, so re-applying the theme
  // without it would silently undo the swap.
  applyThemeToDocument(
    theme,
    accent,
    useSettingsStore.getState().colorBlindMode ?? "none",
  );
}

const persisted = loadPersistedTheme();

export const useThemeStore = create<ThemeState>((set, get) => {
  const initialState: ThemeState = {
    themeId: (persisted.themeId as ThemeId) || "dark",
    accentId: persisted.accentId || "plasma",
    customPrimary: persisted.customPrimary || null,
    setTheme: () => {},
    setAccent: () => {},
    setCustomColors: () => {},
  };

  return {
    ...initialState,

    setTheme: (themeId) => {
      set({ themeId });
      const state = get();
      persistTheme({
        themeId,
        accentId: state.accentId,
        customPrimary: state.customPrimary,
      });
      applyCurrentTheme(state);
    },

    setAccent: (accentId) => {
      set({ accentId, customPrimary: null });
      const state = get();
      persistTheme({
        themeId: state.themeId,
        accentId,
        customPrimary: null,
      });
      applyCurrentTheme(state);
    },

    setCustomColors: (primary) => {
      set({ customPrimary: primary });
      const state = get();
      persistTheme({
        themeId: state.themeId,
        accentId: state.accentId,
        customPrimary: primary,
      });
      applyCurrentTheme(state);
    },
  };
});

// Apply the persisted theme synchronously at module scope. Deferring this to a
// setTimeout used to race anything that reads or re-writes the --su-* tokens on
// first paint (useColorBlindMode's effect, most visibly), and left one frame of
// the globals.css fallback palette on screen.
if (typeof document !== "undefined") {
  applyCurrentTheme(useThemeStore.getState());
}

// Listen for storage changes to sync across tabs
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const newState = JSON.parse(e.newValue);
        useThemeStore.setState({
          themeId: newState.themeId,
          accentId: newState.accentId,
          customPrimary: newState.customPrimary,
        });
        applyCurrentTheme(useThemeStore.getState());
      } catch {
        // Ignore
      }
    }
  });
}

// Selectors
export const selectThemeId = (state: ThemeState) => state.themeId;
export const selectAccentId = (state: ThemeState) => state.accentId;

/**
 * Re-run applyThemeToDocument for the current theme/accent without changing
 * theme state. Used by useColorBlindMode when the mode changes: the swapped
 * tone tokens are emitted by applyThemeToDocument itself, so one re-apply is
 * the whole update.
 */
export function reapplyTheme() {
  applyCurrentTheme(useThemeStore.getState());
}
