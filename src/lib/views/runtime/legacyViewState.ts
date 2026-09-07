/**
 * Canonical ownership for running-view fields (SCOPE-AUDIT). Production writers
 * still live on legacy singletons until SP-09; this module is the SP-03 map,
 * not a global active-view proxy.
 */
export const SHARED_STATION_DOMAINS = [
  "identity", "stationCatalog", "logbook", "observations", "savedViewLibrary",
  "customPresetLibrary", "profile", "shack", "radioSessionData", "operatingObservations",
] as const;

export const WORKING_VIEW_FIELDS = [
  "spots.filters", "spots.grouping", "spots.paths", "presentation.projection",
  "presentation.cameraHomes", "presentation.layers", "presentation.mapStyle",
  "presentation.theme", "presentation.textScale", "presentation.panels",
  "presentation.hamclock", "context.followRadio", "context.followOperatingSession",
  "context.scope", "context.stationId", "context.radioId",
] as const;

export const EPHEMERAL_VIEW_FIELDS = [
  "interaction.selectedReportId", "interaction.selectedPathPointId", "interaction.target",
  "interaction.expandedGroupIds", "popup", "hover", "animationClock", "animationQueue",
  "measuredQuality", "liveRotation", "liveZoom", "replayCursor", "instanceId",
] as const;

export const NEVER_SERIALIZE_WORKING = [
  "instanceId", "target", "selectedReportId", "selectedPathPointId", "expandedGroupIds",
  "popup", "animationQueue", "animationClock", "measuredQuality", "hover",
] as const;

export const LEGACY_VIEW_OWNED_STORES = [
  "mapStore", "settingsStore", "dxStore", "hamclockStore", "hamclockDisplayStore",
] as const;

export const CODEX_PERSISTENCE_SEAM = {
  consume: [
    "ViewRepository.saveView", "ViewRepository.getView", "ViewLibrarySync.dispose",
    "ViewLibrarySync.refresh",
  ],
  doNotEdit: [
    "src/lib/views/persistence/*",
    "src/lib/sync/modules/preferencesSync.ts",
    "src/lib/utils/settingsBackup.ts",
    "src/hooks/useLanSettingsSync.ts",
  ],
} as const;
