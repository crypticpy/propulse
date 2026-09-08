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
