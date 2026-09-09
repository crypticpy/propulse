// SP-08 module: panel, presets, and saved-view library. Mounted in production
// by `src/components/settings/sections/SpotsPathsSection.tsx`
// (/settings/spots-paths) since #708, now that the consumer chain is complete:
// #603 binds the scoped runtimes in the map hosts, #615 applies the bound
// filters/budget/grouping, #776 made grouping real on the flat map. That
// section edits a non-persisting `preview` slot and commits explicitly into
// the family slot of the map layout the user is on -- never a hard-coded
// `normal` interactive runtime, which would collide with a mounted host on
// the registry key and seed that host's working slot on mere navigation.
export { SpotsPreferencesProvider, type SpotsPreferencesProviderProps } from "./SpotsPreferencesProvider";
export { SpotsPreferencesContext, useSpotsPreferencesContext, type SpotsPreferencesContextValue } from "./SpotsPreferencesContext";
export { SpotsPreferencesPanel, SPOTS_PANEL_SECTIONS, type SpotsPanelSection } from "./SpotsPreferencesPanel";
export { SpotsQuickPopover } from "./SpotsQuickPopover";
export { StatusStrip } from "./StatusStrip";
export { LibraryNoticeBar } from "./LibraryNoticeBar";
export { ViewLibrary } from "./ViewLibrary";
export { PresetPreviewDialog } from "./PresetPreviewDialog";
export { ActivitySection } from "./sections/ActivitySection";
export { GroupingSection } from "./sections/GroupingSection";
export { PathsMotionSection } from "./sections/PathsMotionSection";
export { PresetsSection } from "./sections/PresetsSection";
export { createRepositoryLibraryPort } from "./repositoryPort";
export { useSpotsPreferences, type UseSpotsPreferencesOptions } from "./useSpotsPreferences";
export { useSpotsLibrary, newLibraryId, type SpotsLibraryController, type LibraryNotice } from "./useSpotsLibrary";
export {
  MODE_CATEGORIES, SPOT_FILTER_BANDS, SPOT_SOURCES, categoryState, defaultFilters,
  filtersAreDefault, isModeSelected, modeCatalog, selectAllModes, setIncludeInferred,
  setIncludeUnknown, summarizeFilters, toggleMode, toggleModeCategory,
  type CategoryState, type ModeCategoryKey,
} from "./modeSelection";
export type {
  GroupingPreferences, PathPreferences, PresetCustomization, SpotFilterPreferences,
  SpotsLibraryEntry, SpotsLibraryPort, SpotsPreferencesController, WorkingStatus,
} from "./types";
