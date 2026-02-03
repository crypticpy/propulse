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

interface ThemeState {
  themeId: ThemeId;
  accentId: string;
  customPrimary: string | null;
  customSecondary: string | null;

  setTheme: (themeId: ThemeId) => void;
  setAccent: (accentId: string) => void;
  setCustomColors: (primary: string | null, secondary: string | null) => void;
}

const STORAGE_KEY = "propulse-theme";

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

  if (state.customPrimary && state.customSecondary) {
    accent = {
      id: "custom",
      name: "Custom",
      primary: state.customPrimary,
      secondary: state.customSecondary,
    };
  } else if (state.accentId !== "plasma") {
    accent = getAccentPreset(state.accentId);
  }

  applyThemeToDocument(theme, accent);
}

const persisted = loadPersistedTheme();

export const useThemeStore = create<ThemeState>((set, get) => {
  // Apply initial theme on store creation
  const initialState: ThemeState = {
    themeId: (persisted.themeId as ThemeId) || "dark",
    accentId: persisted.accentId || "plasma",
    customPrimary: persisted.customPrimary || null,
    customSecondary: persisted.customSecondary || null,
    setTheme: () => {},
    setAccent: () => {},
    setCustomColors: () => {},
  };

  // Schedule initial theme application
  if (typeof window !== "undefined") {
    setTimeout(() => applyCurrentTheme(get()), 0);
  }

  return {
    ...initialState,

    setTheme: (themeId) => {
      set({ themeId });
      const state = get();
      persistTheme({
        themeId,
        accentId: state.accentId,
        customPrimary: state.customPrimary,
        customSecondary: state.customSecondary,
      });
      applyCurrentTheme(state);
    },

    setAccent: (accentId) => {
      set({ accentId, customPrimary: null, customSecondary: null });
      const state = get();
      persistTheme({
        themeId: state.themeId,
        accentId,
        customPrimary: null,
        customSecondary: null,
      });
      applyCurrentTheme(state);
    },

    setCustomColors: (primary, secondary) => {
      set({ customPrimary: primary, customSecondary: secondary });
      const state = get();
      persistTheme({
        themeId: state.themeId,
        accentId: state.accentId,
        customPrimary: primary,
        customSecondary: secondary,
      });
      applyCurrentTheme(state);
    },
  };
});

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
          customSecondary: newState.customSecondary,
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
