import { createContext, useContext } from "react";
import type { SpotsLibraryController } from "./useSpotsLibrary";
import type { SpotsPreferencesController } from "./types";

export interface SpotsPreferencesContextValue {
  controller: SpotsPreferencesController;
  library: SpotsLibraryController;
}

/**
 * Scoped to one provider subtree, so the quick popover and the detailed panel
 * share exactly one working copy and one revert state (UX-02). This is not an
 * app-wide singleton: mounting two providers gives two independent views.
 */
export const SpotsPreferencesContext = createContext<SpotsPreferencesContextValue | null>(null);

export function useSpotsPreferencesContext(): SpotsPreferencesContextValue {
  const value = useContext(SpotsPreferencesContext);
  if (!value) {
    throw new Error("Spots & Paths controls must be rendered inside a SpotsPreferencesProvider");
  }
  return value;
}
