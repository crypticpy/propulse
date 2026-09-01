import { create } from "zustand";

export type DisplayQuality = "data-saver" | "auto" | "uhd" | "extreme";

interface DisplayQualityState {
  displayQuality: DisplayQuality;
  setDisplayQuality: (quality: DisplayQuality) => void;
}

const STORAGE_KEY = "propulse-display-quality";
const VALID_QUALITIES: readonly DisplayQuality[] = [
  "data-saver",
  "auto",
  "uhd",
  "extreme",
];

function loadDisplayQuality(): DisplayQuality {
  try {
    const value = localStorage.getItem(STORAGE_KEY) as DisplayQuality | null;
    if (value !== null && VALID_QUALITIES.includes(value)) return value;
  } catch {
    // Storage is optional; Auto is the safe default.
  }
  return "auto";
}

export const useDisplayQualityStore = create<DisplayQualityState>((set) => ({
  displayQuality: loadDisplayQuality(),
  setDisplayQuality: (displayQuality) => {
    try {
      localStorage.setItem(STORAGE_KEY, displayQuality);
    } catch {
      // Keep the in-memory preference when storage is unavailable.
    }
    set({ displayQuality });
  },
}));
