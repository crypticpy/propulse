// SP-08 module: panel, presets, and saved-view library. No production entry
// point mounts this yet -- nothing renders a ViewConfiguration produced here,
// since the map hosts still read the legacy dxStore/mapStore-backed
// useSpotFocus/useMapSpotSelection. #603 (bind runtimes) and #615 (apply
// bound filters/budget/grouping) are the consumer chain; #708 tracks wiring
// a real entry point once #615 lands. Do not mount this from Settings again
// until then -- a visible control that changes nothing is worse than dead
// code.
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
