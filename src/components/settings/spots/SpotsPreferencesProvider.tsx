import { useMemo, type ReactNode } from "react";
import type { SavedView } from "@/lib/views/contracts";
import type { FeedAvailability } from "@/lib/views/presets";
import type { RadioObservation, ViewScopedStoreHandle } from "@/lib/views/runtime";
import { SpotsPreferencesContext } from "./SpotsPreferencesContext";
import type { SpotsLibraryPort } from "./types";
import { useSpotsLibrary } from "./useSpotsLibrary";
import { useSpotsPreferences } from "./useSpotsPreferences";

export interface SpotsPreferencesProviderProps {
  /** Scoped store handle for the running view being edited. */
  view: ViewScopedStoreHandle;
  /** Named-view and custom-preset storage port. */
  library: SpotsLibraryPort;
  radio?: RadioObservation | null;
  feedAvailability?: readonly FeedAvailability[];
  savedView?: SavedView | null;
  viewName?: string;
  children: ReactNode;
}

/**
 * Binds one running view and one library port to the Spots & Paths surfaces.
 * Every dependency is an explicit prop; nothing is resolved from module state.
 */
export function SpotsPreferencesProvider({
  view,
  library,
  radio = null,
  feedAvailability,
  savedView = null,
  viewName,
  children,
}: SpotsPreferencesProviderProps) {
  const controller = useSpotsPreferences({ view, radio, feedAvailability, savedView, viewName });
  const libraryController = useSpotsLibrary(library);
  const value = useMemo(
    () => ({ controller, library: libraryController }),
    [controller, libraryController],
  );
  return (
    <SpotsPreferencesContext.Provider value={value}>
      {children}
    </SpotsPreferencesContext.Provider>
  );
}
