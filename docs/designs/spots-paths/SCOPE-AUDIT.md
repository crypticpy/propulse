# Field and mutation audit at SP-01 baseline

Baseline fd57fd525fd2857034e1badbd6018be6e4806c02. Every data property and action
in the inspected store interfaces is enumerated below; nested feature structures
are discussed after the inventory. Classification is the destination architecture,
not a claim that these globals are already removed.

Saved configuration = complete reusable intent; Working = per-instance editable
copy persisted to its tab slot; Ephemeral = selection/runtime state cleared on scene
entry; Shared domain = existing data/library/device ownership, not permission to
sync it indiscriminately across accounts or issue radio commands.

## mapStore

Readers use exported hooks/selectors/getState; actions below are global writers
on the baseline. Direct setState writers are called out separately.

| Field | Destination |
| --- | --- |
| `viewMode` | Saved configuration / Working |
| `timeOffset` | Saved configuration / Working |
| `absoluteTime` | Saved configuration / Working |
| `timeScenarios` | Shared domain (library/history) |
| `target` | Ephemeral |
| `recentTargets` | Shared domain (library/history) |
| `rotation` | Ephemeral |
| `zoom` | Ephemeral |
| `autoRotate` | Saved configuration / Working |
| `autoRotateSpeed` | Saved configuration / Working |
| `globeOrientation` | Saved configuration / Working |
| `displayFit` | Saved configuration / Working |
| `observatoryMode` | Ephemeral |
| `observatoryPreviousState` | Ephemeral |
| `layers` | Saved configuration / Working |
| `nvisEnabled` | Saved configuration / Working |
| `activePreset` | Saved configuration / Working |
| `activeProfile` | Saved configuration / Working |
| `spotFilters` | Saved configuration / Working |
| `customProfiles` | Shared domain (library/history) |
| `isFullscreen` | Ephemeral |
| `isLiteMode` | Saved configuration / Working |
| `layoutMode` | Saved configuration / Working |
| `isDXConsoleExpanded` | Saved configuration / Working |
| `interactionMode` | Ephemeral |
| `overlayLayers` | Ephemeral |
| `tooltipPosition` | Ephemeral |
| `flyoutPosition` | Ephemeral |
| `justLogged` | Ephemeral |
| `pathMode` | Saved configuration / Working |
| `isolateTargetPath` | Ephemeral |
| `panelStates` | Saved configuration / Working |
| `mapStyle` | Saved configuration / Working |
| `tileProviderId` | Saved configuration / Working |
| `nightDarkness` | Saved configuration / Working |
| `labelOptions` | Saved configuration / Working |
| `centerLocation` | Ephemeral |
| `flashPoint` | Ephemeral |
| `regionPresets` | Shared domain (library/history) |
| `activePresetId` | Saved configuration / Working |
| `displayDensity` | Saved configuration / Working |
| `gridLabelDetail` | Saved configuration / Working |
| `gridActivityEndpoint` | Saved configuration / Working |
| `replayEnabled` | Ephemeral |
| `showEsLayer` | Saved configuration / Working |
| `showObservedMUF` | Saved configuration / Working |
| `observedMUFMode` | Saved configuration / Working |
| `showCorrelation` | Saved configuration / Working |
| `proRibbonExpanded` | Saved configuration / Working |
| `proPanelLayout` | Saved configuration / Working |
| `dockGroups` | Saved configuration / Working |
| `selectedSatelliteId` | Ephemeral |
| `satelliteModalId` | Ephemeral |
| `satelliteCategoryFilter` | Saved configuration / Working |
| `satelliteShowAll` | Saved configuration / Working |
| `beaconInactiveOpacity` | Saved configuration / Working |
| `nvisOpacity` | Saved configuration / Working |

Actions: `setViewMode`, `setTimeOffset`, `setAbsoluteTime`, `addTimeScenario`, `removeTimeScenario`, `applyTimeScenario`, `setTarget`, `clearRecentTargets`, `setRotation`, `setZoom`, `setAutoRotate`, `setAutoRotateSpeed`, `setGlobeOrientation`, `setDisplayFit`, `enterObservatory`, `exitObservatory`, `toggleLayer`, `applySharedLayers`, `toggleNVIS`, `setNVISEnabled`, `applyPreset`, `clearPreset`, `applyProfile`, `clearProfile`, `setSpotFilters`, `clearSpotFilters`, `saveCustomProfile`, `deleteCustomProfile`, `setFullscreen`, `toggleFullscreen`, `setLiteMode`, `toggleLiteMode`, `setLayoutMode`, `setDXConsoleExpanded`, `toggleDXConsoleExpanded`, `setInteractionMode`, `addOverlayLayer`, `updateOverlayLayer`, `removeOverlayLayer`, `clearOverlayLayers`, `setTooltipPosition`, `setFlyoutPosition`, `setJustLogged`, `setPathMode`, `togglePathMode`, `setIsolateTargetPath`, `toggleIsolateTargetPath`, `togglePanel`, `setPanelCollapsed`, `resetPanelStates`, `setMapStyle`, `setTileProviderId`, `setNightDarkness`, `setLabelOption`, `setCenterLocation`, `clearCenterLocation`, `setFlashPoint`, `clearFlashPoint`, `setActivePreset`, `clearActivePreset`, `addRegionPreset`, `updateRegionPreset`, `deleteRegionPreset`, `reorderRegionPresets`, `saveCurrentAsPreset`, `exportRegionPresets`, `importRegionPresets`, `setDisplayDensity`, `setGridLabelDetail`, `setGridActivityEndpoint`, `setReplayEnabled`, `setShowEsLayer`, `toggleEsLayer`, `setObservedMUFMode`, `setShowCorrelation`, `toggleCorrelation`, `setProRibbonExpanded`, `toggleProRibbon`, `updateProPanelLayout`, `toggleProPanelCollapse`, `resetProPanelLayout`, `setDockGroups`, `addDockGroup`, `removeDockGroup`, `updateDockGroup`, `removePanelFromDockGroup`, `setSelectedSatelliteId`, `setSatelliteModalId`, `setSatelliteCategoryFilter`, `setSatelliteShowAll`, `setBeaconInactiveOpacity`, `setNvisOpacity`, `reset`.

## settingsStore

Readers use exported hooks/selectors/getState; actions below are global writers
on the baseline. Direct setState writers are called out separately.

| Field | Destination |
| --- | --- |
| `units` | Shared domain (existing device/station/feature scope) |
| `timeFormat` | Saved configuration / Working |
| `theme` | Saved configuration / Working |
| `ituRegion` | Shared domain (existing device/station/feature scope) |
| `licenseClass` | Shared domain (existing device/station/feature scope) |
| `textScale` | Saved configuration / Working |
| `colorBlindMode` | Shared domain (existing device/station/feature scope) |
| `highContrast` | Shared domain (existing device/station/feature scope) |
| `noiseEnvironment` | Shared domain (existing device/station/feature scope) |
| `antennaType` | Shared domain (existing device/station/feature scope) |
| `bridgeEnabled` | Shared domain (existing device/station/feature scope) |
| `preferTestedSpecs` | Shared domain (existing device/station/feature scope) |
| `favoredBands` | Shared domain (existing device/station/feature scope) |
| `bandPresets` | Shared domain (existing device/station/feature scope) |
| `notifications` | Shared domain (existing device/station/feature scope) |
| `spotClustering` | Saved configuration / Working |
| `compassRose` | Saved configuration / Working |
| `spotAge` | Saved configuration / Working |
| `watchAlerts` | Shared domain (existing device/station/feature scope) |
| `uiInteraction` | Saved configuration / Working |
| `forecastDisplay` | Saved configuration / Working |
| `sdrWaterfallPalette` | Shared domain (existing device/station/feature scope) |
| `sdrWaterfallMinDb` | Shared domain (existing device/station/feature scope) |
| `sdrWaterfallMaxDb` | Shared domain (existing device/station/feature scope) |
| `sdrWaterfallSpeed` | Shared domain (existing device/station/feature scope) |
| `sdrSpectrumPeakHold` | Shared domain (existing device/station/feature scope) |
| `sdrSpectrumGradientFill` | Shared domain (existing device/station/feature scope) |
| `sdrSpectrumBgColor` | Shared domain (existing device/station/feature scope) |
| `sdrSpectrumGridLines` | Shared domain (existing device/station/feature scope) |
| `sdrSpectrumVerticalGridLines` | Shared domain (existing device/station/feature scope) |
| `sdrSpectrumGridOpacity` | Shared domain (existing device/station/feature scope) |
| `sdrSpectrumSmoothing` | Shared domain (existing device/station/feature scope) |
| `sdrSpectrumLineColor` | Shared domain (existing device/station/feature scope) |
| `sdrSpectrumLineWidth` | Shared domain (existing device/station/feature scope) |
| `sdrSpectrumFillOpacity` | Shared domain (existing device/station/feature scope) |
| `sdrSpectrumLineShadow` | Shared domain (existing device/station/feature scope) |
| `sdrSpectrumLineShadowBlur` | Shared domain (existing device/station/feature scope) |
| `sdrPassbandBlendMode` | Shared domain (existing device/station/feature scope) |
| `sdrPassbandOpacity` | Shared domain (existing device/station/feature scope) |
| `sdrSkinName` | Shared domain (existing device/station/feature scope) |
| `sdrSliceBgColor` | Shared domain (existing device/station/feature scope) |
| `sdrTuningStepHz` | Shared domain (existing device/station/feature scope) |
| `sdrWaterfallInterpolation` | Shared domain (existing device/station/feature scope) |
| `sdrWaterfallGamma` | Shared domain (existing device/station/feature scope) |
| `sdrWaterfallRowHeight` | Shared domain (existing device/station/feature scope) |
| `tickerPosition` | Saved configuration / Working |
| `tickerCoverageArea` | Saved configuration / Working |
| `contestWeatherFirstTimeSeen` | Shared domain (existing device/station/feature scope) |
| `showQuietBandNav` | Shared domain (existing device/station/feature scope) |
| `contestWeatherDismissedUntil` | Shared domain (existing device/station/feature scope) |
| `alertSoundEnabled` | Shared domain (existing device/station/feature scope) |
| `alertSoundVolume` | Shared domain (existing device/station/feature scope) |
| `alertBrowserNotifications` | Shared domain (existing device/station/feature scope) |
| `contestAlertProfileId` | Shared domain (existing device/station/feature scope) |
| `autoSwitchContestProfile` | Shared domain (existing device/station/feature scope) |
| `contestAlertThrottleMultiplier` | Shared domain (existing device/station/feature scope) |
| `sdrEqBands` | Shared domain (existing device/station/feature scope) |
| `sdrNoiseGateEnabled` | Shared domain (existing device/station/feature scope) |
| `sdrNoiseGateThreshold` | Shared domain (existing device/station/feature scope) |
| `sdrNrEnabled` | Shared domain (existing device/station/feature scope) |
| `sdrNrLevel` | Shared domain (existing device/station/feature scope) |
| `sdrSweetenEnabled` | Shared domain (existing device/station/feature scope) |
| `sdrSweetenAmount` | Shared domain (existing device/station/feature scope) |
| `sdrExpanderEnabled` | Shared domain (existing device/station/feature scope) |
| `sdrExpanderThreshold` | Shared domain (existing device/station/feature scope) |
| `sdrExpanderRatio` | Shared domain (existing device/station/feature scope) |
| `sdrExpanderAttackMs` | Shared domain (existing device/station/feature scope) |
| `sdrExpanderReleaseMs` | Shared domain (existing device/station/feature scope) |
| `sdrExpanderRangeDb` | Shared domain (existing device/station/feature scope) |
| `sdrCompressorEnabled` | Shared domain (existing device/station/feature scope) |
| `sdrCompressorThreshold` | Shared domain (existing device/station/feature scope) |
| `sdrCompressorRatio` | Shared domain (existing device/station/feature scope) |
| `sdrCompressorAttackMs` | Shared domain (existing device/station/feature scope) |
| `sdrCompressorReleaseMs` | Shared domain (existing device/station/feature scope) |
| `sdrCompressorKnee` | Shared domain (existing device/station/feature scope) |
| `sdrCompressorMakeupDb` | Shared domain (existing device/station/feature scope) |
| `sdrSpectralTamingEnabled` | Shared domain (existing device/station/feature scope) |
| `sdrSpectralTamingTameAmount` | Shared domain (existing device/station/feature scope) |
| `sdrSpectralTamingRecoverAmount` | Shared domain (existing device/station/feature scope) |
| `sdrSpectralTamingSpeed` | Shared domain (existing device/station/feature scope) |
| `sdrLevelerEnabled` | Shared domain (existing device/station/feature scope) |
| `sdrLevelerTargetLevel` | Shared domain (existing device/station/feature scope) |
| `sdrLevelerSpeed` | Shared domain (existing device/station/feature scope) |
| `sdrLevelerMaxGainDb` | Shared domain (existing device/station/feature scope) |
| `sdrTuningLineColor` | Shared domain (existing device/station/feature scope) |
| `sdrTuningArrowColor` | Shared domain (existing device/station/feature scope) |
| `sdrFt8DecoderEnabled` | Shared domain (existing device/station/feature scope) |
| `sdrFt8AudioSource` | Shared domain (existing device/station/feature scope) |
| `sdrFt8AudioDeviceId` | Shared domain (existing device/station/feature scope) |
| `sdrFt8Mode` | Shared domain (existing device/station/feature scope) |
| `sdrFt8WsjtxEmitEnabled` | Shared domain (existing device/station/feature scope) |
| `sdrFt8WsjtxEmitPort` | Shared domain (existing device/station/feature scope) |
| `sdrFt8PskReporterEnabled` | Shared domain (existing device/station/feature scope) |
| `sdrFt8ShowFlags` | Shared domain (existing device/station/feature scope) |
| `sdrFt8ShowDistance` | Shared domain (existing device/station/feature scope) |
| `sdrFt8HighlightNeeded` | Shared domain (existing device/station/feature scope) |
| `sdrFt8HighlightCQ` | Shared domain (existing device/station/feature scope) |
| `sdrFt8AutoLogEnabled` | Shared domain (existing device/station/feature scope) |
| `sdrFt8QslAutoUpload` | Shared domain (existing device/station/feature scope) |
| `sdrFt8FoxHoundMode` | Shared domain (existing device/station/feature scope) |
| `sdrFt8ContestMode` | Shared domain (existing device/station/feature scope) |
| `sdrFt8ContestTemplateId` | Shared domain (existing device/station/feature scope) |
| `sdrFt8DecodeDepth` | Shared domain (existing device/station/feature scope) |
| `radioSetupCompleted` | Shared domain (existing device/station/feature scope) |
| `radioDaemonAuthToken` | Shared domain (existing device/station/feature scope) |
| `catBackend` | Shared domain (existing device/station/feature scope) |
| `catHamlibHost` | Shared domain (existing device/station/feature scope) |
| `catHamlibPort` | Shared domain (existing device/station/feature scope) |
| `catCivPort` | Shared domain (existing device/station/feature scope) |
| `catFlrigHost` | Shared domain (existing device/station/feature scope) |
| `catFlrigPort` | Shared domain (existing device/station/feature scope) |
| `catIcomSerialPort` | Shared domain (existing device/station/feature scope) |
| `catIcomBaudRate` | Shared domain (existing device/station/feature scope) |
| `catIcomRadioAddress` | Shared domain (existing device/station/feature scope) |
| `catPttLockout` | Shared domain (existing device/station/feature scope) |
| `catIcomNetworkHost` | Shared domain (existing device/station/feature scope) |
| `catIcomNetworkUsername` | Shared domain (existing device/station/feature scope) |
| `catIcomNetworkPassword` | Shared domain (existing device/station/feature scope) |
| `audioDevice` | Shared domain (existing device/station/feature scope) |
| `tileQuality` | Shared domain (existing device/station/feature scope) |
| `tileMaxCacheMB` | Shared domain (existing device/station/feature scope) |
| `tileFadeEnabled` | Shared domain (existing device/station/feature scope) |
| `globeHiResTextures` | Shared domain (existing device/station/feature scope) |

Actions: `updatePreferences`, `resetPreferences`, `setITURegion`, `setLicenseClass`, `setFavoredBands`, `toggleFavoredBand`, `toggleHiddenBand`, `updateNotifications`, `updateSpotClustering`, `toggleSpotClustering`, `updateCompassRose`, `toggleCompassRose`, `updateSpotAge`, `toggleSpotAge`, `addBandPreset`, `removeBandPreset`, `updateBandPreset`, `updateForecastDisplay`, `setColorBlindMode`, `setAntennaType`, `setNoiseEnvironment`, `setHighContrast`, `updateUIInteraction`, `setSdrSliceBgColor`.

## dxStore

Readers use exported hooks/selectors/getState; actions below are global writers
on the baseline. Direct setState writers are called out separately.

| Field | Destination |
| --- | --- |
| `spots` | Shared domain (ingestion) |
| `spotSource` | Shared domain (ingestion) |
| `clusterStatus` | Shared domain (ingestion) |
| `clusterStatusSeq` | Shared domain (ingestion) |
| `hiddenSpotIds` | Ephemeral |
| `filters` | Saved configuration / Working |
| `selectedSpot` | Ephemeral |
| `hoveredSpot` | Ephemeral |
| `maxSpots` | Saved configuration / Working |
| `showPaths` | Saved configuration / Working |
| `isPanelOpen` | Ephemeral |

Actions: `setSpots`, `addSpot`, `clearSpots`, `setSpotSource`, `setClusterStatus`, `hideSpot`, `unhideSpot`, `clearHiddenSpots`, `setFilters`, `updateFilter`, `clearFilters`, `setSelectedSpot`, `setHoveredSpot`, `setMaxSpots`, `setShowPaths`, `togglePanel`, `setPanelOpen`.

## hamclockStore

Readers use exported hooks/selectors/getState; actions below are global writers
on the baseline. Direct setState writers are called out separately.

| Field | Destination |
| --- | --- |
| `spotsSide` | Saved configuration / Working |
| `panelCollapsed` | Saved configuration / Working |
| `spotsSidebarCollapsed` | Saved configuration / Working |
| `infoSidebarCollapsed` | Saved configuration / Working |
| `reliability` | Saved configuration / Working |
| `hamclockMode` | Saved configuration / Working |
| `preferredViewMode` | Saved configuration / Working |
| `bandFocus` | Saved configuration / Working |
| `crawlHamNews` | Saved configuration / Working |
| `crawlWorldNews` | Saved configuration / Working |
| `filtersBeforeBands` | Ephemeral |
| `enterSnapshot` | Ephemeral |

Actions: `setSpotsSide`, `togglePanel`, `toggleSpotsSidebar`, `toggleInfoSidebar`, `setReliability`, `setHamclockMode`, `setPreferredViewMode`, `setBandFocus`, `toggleBandFocus`, `setCrawlHamNews`, `setCrawlWorldNews`, `setFiltersBeforeBands`, `setEnterSnapshot`.

## hamclockDisplayStore

Readers use exported hooks/selectors/getState; actions below are global writers
on the baseline. Direct setState writers are called out separately.

| Field | Destination |
| --- | --- |
| `textSize` | Saved configuration / Working |
| `density` | Saved configuration / Working |
| `theme` | Saved configuration / Working |
| `units` | Saved configuration / Working |
| `pageIndex` | Ephemeral |
| `smartScaling` | Saved configuration / Working |
| `hiddenPanels` | Saved configuration / Working |
| `mapContent` | Saved configuration / Working |
| `followRadio` | Saved configuration / Working |
| `panelCollapsed` | Saved configuration / Working |
| `spotsSide` | Saved configuration / Working |
| `spotsSidebarCollapsed` | Saved configuration / Working |
| `infoSidebarCollapsed` | Saved configuration / Working |
| `homeRequest` | Ephemeral |
| `railLayout` | Saved configuration / Working |
| `pinnedTile` | Saved configuration / Working |
| `presets` | Shared domain (library) |
| `autoPage` | Saved configuration / Working |

Actions: `setDensity`, `setTheme`, `setUnits`, `setPage`, `stepPage`, `togglePanelExpansion`, `setSpotsSide`, `toggleSpotsSidebar`, `toggleInfoSidebar`, `setTextSize`, `setSmartScaling`, `togglePanel`, `setMapContent`, `setFollowRadio`, `frameHome`, `resetDisplay`, `setRailLayout`, `resetRailLayout`, `setPinnedTile`, `setAutoPage`, `savePreset`, `deletePreset`, `applyLayoutPreset`.

## hamclockWidgetConfigStore

Readers use exported hooks/selectors/getState; actions below are global writers
on the baseline. Direct setState writers are called out separately.

| Field | Destination |
| --- | --- |
| `widgets` | Saved configuration / Working |

Actions: `setWidgetConfig`, `resetWidgetConfig`.

## kioskStore

Readers use exported hooks/selectors/getState; actions below are global writers
on the baseline. Direct setState writers are called out separately.

| Field | Destination |
| --- | --- |
| `scenes` | Saved configuration / Working |
| `rotation` | Saved configuration / Working |
| `breakInLevel` | Saved configuration / Working |
| `presentation` | Saved configuration / Working |
| `active` | Ephemeral |
| `activeSceneId` | Ephemeral |

Actions: `addScene`, `updateScene`, `replaceScenes`, `duplicateScene`, `moveScene`, `removeScene`, `setRotation`, `setBreakInLevel`, `setPresentation`, `start`, `stop`, `advance`, `getActiveScene`.

## displayStore

Readers use exported hooks/selectors/getState; actions below are global writers
on the baseline. Direct setState writers are called out separately.

| Field | Destination |
| --- | --- |
| `displayId` | Shared domain (device identity; partition by launch) |
| `deviceToken` | Shared domain (device identity; partition by launch) |
| `pairedName` | Shared domain (device identity; partition by launch) |
| `syncActive` | Shared domain (device identity; partition by launch) |

Actions: `setIdentity`, `setPairedName`, `setSyncActive`, `clearIdentity`.

## themeStore

Readers use exported hooks/selectors/getState; actions below are global writers
on the baseline. Direct setState writers are called out separately.

| Field | Destination |
| --- | --- |
| `themeId` | Saved configuration / Working |
| `accentId` | Saved configuration / Working |
| `customPrimary` | Saved configuration / Working |
| `customSecondary` | Saved configuration / Working |

Actions: `setTheme`, `setAccent`, `setCustomColors`.

## operatingStore

Readers use exported hooks/selectors/getState; actions below are global writers
on the baseline. Direct setState writers are called out separately.

| Field | Destination |
| --- | --- |
| `activeBand` | Shared domain (existing ownership retained) |
| `activeMode` | Shared domain (existing ownership retained) |
| `activeSource` | Shared domain (existing ownership retained) |
| `activeFrequency` | Shared domain (existing ownership retained) |
| `subBandSegment` | Shared domain (existing ownership retained) |
| `manualBand` | Shared domain (existing ownership retained) |
| `manualMode` | Shared domain (existing ownership retained) |
| `catOverridden` | Shared domain (existing ownership retained) |
| `bandModeHistory` | Shared domain (existing ownership retained) |
| `presets` | Shared domain (existing ownership retained) |
| `watchedBands` | Shared domain (existing ownership retained) |
| `bandSessionStart` | Shared domain (existing ownership retained) |
| `contestLocked` | Shared domain (existing ownership retained) |
| `_catBand` | Shared domain (existing ownership retained) |
| `_catMode` | Shared domain (existing ownership retained) |
| `_catFrequency` | Shared domain (existing ownership retained) |
| `_catConnected` | Shared domain (existing ownership retained) |
| `_wsjtxBand` | Shared domain (existing ownership retained) |
| `_wsjtxMode` | Shared domain (existing ownership retained) |
| `_wsjtxFrequency` | Shared domain (existing ownership retained) |
| `_wsjtxConnected` | Shared domain (existing ownership retained) |
| `contestSessionId` | Shared domain (existing ownership retained) |
| `_contestBand` | Shared domain (existing ownership retained) |
| `_contestMode` | Shared domain (existing ownership retained) |

Actions: `setManualBand`, `setManualMode`, `setManualBandMode`, `resumeCATFollow`, `updateFromCAT`, `updateFromWSJTX`, `setContestSession`, `updateFromContest`, `_setCATConnected`, `_setWSJTXConnected`, `addPreset`, `removePreset`, `applyPreset`, `addWatchedBand`, `removeWatchedBand`, `clearWatchedBands`, `setContestLocked`.

## profileStore

Readers use exported hooks/selectors/getState; actions below are global writers
on the baseline. Direct setState writers are called out separately.

| Field | Destination |
| --- | --- |
| `station` | Shared domain (existing ownership retained) |
| `savedTargets` | Shared domain (existing ownership retained) |
| `serviceCredentials` | Shared domain (existing ownership retained) |
| `license` | Shared domain (existing ownership retained) |
| `licenseHistory` | Shared domain (existing ownership retained) |
| `bio` | Shared domain (existing ownership retained) |
| `profileImageUrl` | Shared domain (existing ownership retained) |
| `profileImageId` | Shared domain (existing ownership retained) |
| `lastIngestedCallsign` | Shared domain (existing ownership retained) |
| `socialLinks` | Shared domain (existing ownership retained) |
| `visibilitySettings` | Shared domain (existing ownership retained) |
| `credentialStoreSetup` | Shared domain (existing ownership retained) |
| `lastCredentialUnlock` | Ephemeral |
| `interests` | Shared domain (existing ownership retained) |
| `onAirStatus` | Shared domain (existing ownership retained) |
| `skedAvailability` | Shared domain (existing ownership retained) |
| `favoriteFreqs` | Shared domain (existing ownership retained) |
| `subscriptionTier` | Shared domain (existing ownership retained) |
| `subscriptionStatus` | Shared domain (existing ownership retained) |
| `subscriptionPeriodEnd` | Shared domain (existing ownership retained) |
| `operatorRank` | Shared domain (existing ownership retained) |
| `lastLoginDate` | Shared domain (existing ownership retained) |
| `loginStreakDays` | Shared domain (existing ownership retained) |
| `rankCelebrationSeen` | Shared domain (existing ownership retained) |
| `lastQsoSyncAt` | Shared domain (existing ownership retained) |
| `syncDeviceId` | Shared domain (existing ownership retained) |

Actions: `setStation`, `setBio`, `setProfileImageUrl`, `setProfileImageId`, `setLastIngestedCallsign`, `setSocialLinks`, `addLocation`, `updateLocation`, `removeLocation`, `setActiveLocation`, `setTemporaryLocation`, `setCurrentLocation`, `clearTemporaryLocation`, `addTarget`, `removeTarget`, `clearTargets`, `setServiceCredentials`, `setCredentialStoreSetup`, `setLastCredentialUnlock`, `clearPlaintextCredentials`, `setLicense`, `setVisibilitySettings`, `setInterests`, `setOnAirStatus`, `setSkedAvailability`, `setFavoriteFreqs`, `addFavoriteFreq`, `removeFavoriteFreq`, `addLicenseHistoryEntry`, `removeLicenseHistoryEntry`, `setSubscriptionTier`, `setSubscriptionStatus`, `setSubscriptionPeriodEnd`, `updateRankData`, `setCardSignature`, `setRankPreferences`, `setRankOverride`, `recordLogin`, `markCelebrationSeen`, `setLastQsoSyncAt`, `setSyncDeviceId`.

## displayQualityStore

Readers use exported hooks/selectors/getState; actions below are global writers
on the baseline. Direct setState writers are called out separately.

| Field | Destination |
| --- | --- |
| `displayQuality` | Saved configuration / Working |

Actions: `setDisplayQuality`.

## Persistence, sync and direct mutator paths

| Baseline path | Current reads/writes/persistence | Required handoff |
| --- | --- | --- |
| mapStore | Individual localStorage keys; all listed actions write singleton state | SP-03 scopes actions/readers; saved camera homes are distinct from live rotation/zoom. PanelStates/proPanelLayout merge into explicit panel records. Legacy activePreset/Profile IDs are provenance, not live inheritance. |
| settingsStore | `propulse-settings`, versioned localStorage; nearly all state except CAT password persisted; preferencesSync spreads it | SP-02 partitions migrated presentation fields out of cloud/LAN live apply. SP-03 uses view commands. Unrelated SDR/CAT/notification behavior remains in its existing domain. |
| dxStore | `propulse-dx-cluster`, only selected filter fields persisted; source data and UI share one singleton | SP-04 retains ingestion; SP-03 moves filters/selection/display settings to runtime. SearchText/neededOnly/sortByNeeded are scoped list state, never map report identities. |
| hamclockStore | `propulse-hamclock-layout` localStorage; enter/leave snapshots imperatively restore map state | SP-03 replaces shared-state swapping with separate runtime binding. Reliability inputs/crawl/band focus are saved HamClock intent; temporary pre-band filter snapshot is ephemeral. |
| hamclockDisplayStore | `propulse-hamclock-display` sessionStorage; each tab still has one singleton | SP-03 scopes by instance/slot. Resolve textSize=inherit once when seeding; never subscribe to another view's text scale. Page index is runtime; saved initialPageId is stable. |
| hamclockWidgetConfigStore | `propulse-hamclock-widget-config` localStorage stores unknown JSON; registered leaf schemas validate readers | SP-02 imports only validated catalog payloads; SP-03 per-view widget writer. #207 dialogs keep their existing centered chrome. |
| kioskStore | `propulse-kiosk` localStorage persists scenes/rotation/breakIn/presentation/active/activeSceneId | SP-10 assignment library separate from launch-local active scene, timers, transition and return snapshot. Complete scene entry replaces settings; it must not apply partial map patches. |
| displayStore/useDisplaySync | `propulse-display-device` localStorage contains one displayId/deviceToken/name/syncActive; remote scene response updates kiosk singleton | SP-10 launch-specific identity and request epoch; drop delayed responses for other owner/display/revision. Token is device identity, never saved config or backup. |
| themeStore | `propulse-theme` localStorage, cross-tab storage listener, document-root CSS mutation | SP-03 scopes view root tokens; account theme changes cannot repaint another view. PropSphere station tokens and HamClock wall themes remain distinct. |
| displayQualityStore | `propulse-display-quality`, localStorage singleton and cross-tab reads | SP-03 quality is saved view intent, capped by device capability; display copy may choose another quality. |
| visualEffectsStore | `propulse-visual-effects` device-local comfort choice, cross-tab storage listener | Retain device maximum/OS reduced-motion restriction; per-view paths can reduce it further. Device restrictions never write another view's configuration. |
| operatingStore/useOperatingMonitor | Radio/WSJT-X/contest observations and manual active operating state resolve globally | Shared operational truth stays shared. SP-03 follow subscription is opt-in per view and read-only; missing radio gives paused status. Preferences/presets do not call tune/PTT actions. |
| useHamClockRadioFollow | reads shared radio and writes mapStore.spotFilters; map subscription disables global wall follow | SP-03 targets only bound runtime filters/follow flag; manual filter change disables only that runtime's follow. |
| HamClockView | Direct mapStore.setState replaces layers/activePreset; enter/product-mode effects write spot filters and restore prior snapshot | SP-03 scopes mode application to HamClock runtime; eliminate global enter/leave swapping. SP-09 checks mounted production consumers after integration. |
| useOperationalWorkspaceSync (useMapOperationalContext.ts) | Cross-window snapshot receiver directly applies map target and DX selectedSpot, plus operating session context | SP-03 preserves shared operational observations but rejects active target/selection writes into unrelated view IDs. A secondary workspace needs an explicit binding; same account alone is not authority to change its selection. |
| preferencesSync pull/push | settings spread, `_mapPrefs`, `_dxFilters`, theme; direct setState on map/DX/settings/theme plus shared profile/shack | SP-02 saved library/revisions sync separately; remove migrated visual live writes, preserve domain profile/shack sync. Older clients cannot overwrite new active views. |
| settingsBackup export/import | profile/shack/preferences, maps/recent targets, DX filters, watches/pins/alerts; import calls global setters | SP-02 treats imported visual settings as validated new saved records, explicit apply only. Domain imports keep existing semantics. Never restore target just to import recent history. |
| useLanSettingsSync | 30s automatic pull from `/api/bridge/settings` invokes importSettings; publish is explicit | SP-02 shared library import only for view fields; SP-10 display publication separate. Late response/account switch must not activate a view. |
| operatingProfile/applyProfile | metadata/id/name/icon/description + layers/spotFilters/panels/layout | Shared recipe library; application copies into current runtime. None of the profile's fields grant radio control. |
| profileStore | `propulse-profile` localStorage, cloud profile sync, credential vault delegation | Preserve profile/station/license/logbook-related ownership. Saved target library is shared; selecting one creates only a local target. Never put credentials in snapshots. |
| clusterPrefs | connection host/port/node/callsign and server band/mode filters persisted; password omitted | Connection filters affect feed availability and remain connection settings. Spots & Paths filters are view-only; preset application must not reconnect or issue server filter commands. |

## Nested presentation mapping and exclusions

- map.layers: all 42 booleans are explicit in `viewLayersSchema`; type-level parity
  assertion fails if MapState adds/removes a layer. Overlay tuning fields map to
  `presentation.overlays`; no camera value influences grouping.
- map labelOptions map to `presentation.labels`; gridLabelDetail → gridDetail.
  UIInteraction callsign/spotter labels → callsigns/endpoints; labelScale → scale;
  spotColorMode/visualStyle are explicit presentation fields. Hold/dismiss/hit/dot/
  pin/aspect/tooltip/band-height options map to `presentation.controls`.
- UIInteraction.spotClickTunesRadio and qsyWipeOnBandChange remain explicit station
  interaction policies. They are excluded from presets/scene snapshots: saving or
  loading view intent never tunes. SP-09 must still honor the existing explicit
  Work/T action without allowing passive selection/follow to issue commands.
- spotAge.maxAgeMinutes → filters.maxAgeMinutes; enabled/showAgeColumn → controls.
  spotClustering.enabled/minClusterSize → grouping; legacy angular radius/gridSize
  has no equivalent in deterministic region grouping. Migration records that loss
  visibly rather than pretending degrees equal a geographic detail choice.
- CompassRose enabled/beamWidth/showBeamWidth → controls.compassRose. Forecast
  bandMode/customBands/showSnrValues/detailedFooter/hoursToShow and ticker position/
  coverage map to presentation.forecast/ticker through scoped adapters in SP-03; retain validated
  values in migration rather than copying global reads into the new runtime.
- Settings colorBlindMode/highContrast and global visualEffects are device comfort
  restrictions. They may restrict rendering without rewriting a saved view. SDR
  decoder/audio/CAT settings, notifications, watch-alert policy and operating
  equipment are not view configuration; retain current domain validation.
- HamClock old spotsSide/panelCollapsed/sidebar settings exist in two stores. SP-02
  resolves precedence once from the currently consumed display store, using old
  HamClock store only when the newer field is absent; no two-way mirror.
- Observatory pre-state, HamClock enterSnapshot, filtersBeforeBands, current target,
  point selection, tooltip/flyout/flash, animation queue, replay cursor and fullscreen
  are ephemeral. Browser refresh may restore working preferences, not stale timers.

SP-02/SP-03 exit checks must search production consumers for these global writes,
not merely add an unused scoped store. Until SP-09 wiring is accepted, the old
renderer consumers remain intentionally active and the independence feature is not
advertised as shipped.
