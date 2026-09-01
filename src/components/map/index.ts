/**
 * Map Components
 *
 * PropSphere map visualization components for 3D globe and 2D flat map views,
 * including terminator, greyline, and path analysis overlays.
 */

// 3D Globe components
export { GlobeView } from "./GlobeView";
export { EarthSphere } from "./EarthSphere";
export { Terminator } from "./Terminator";
export { Greyline } from "./Greyline";
export { NightOverlay } from "./NightOverlay";
export { NightLightsOverlay } from "./NightLightsOverlay";
export { LabelsOverlay } from "./LabelsOverlay";
export { AuroraOverlay } from "./AuroraOverlay";
export { MUFOverlay } from "./MUFOverlay";
export { MUFLegend, MUFLegendCompact } from "./MUFLegend";
export { IonosphereLegend } from "./IonosphereLegend";
export { LayerLegend } from "./LayerLegend";
export { MapStatusChip } from "./MapStatusChip";
export { ModelSourceBadge } from "./ModelSourceBadge";
export { PathArc } from "./PathArc";
export { LocationMarker } from "./LocationMarker";
export { CompassRose } from "./CompassRose";
export { LiveSpotArcs } from "./LiveSpotArcs";
export { SpotHighlight } from "./SpotHighlight";
export { SpotMarker } from "./SpotMarker";
export { PinMarker } from "./PinMarker";
export { SpotCluster } from "./SpotCluster";
export { SpotLabel } from "./SpotLabel";
export { SpotDetailsFlyout, type SpotDetailsData } from "./SpotDetailsFlyout";
export { SelectedSpotCard } from "./SelectedSpotCard";
export { SpotHoverPreview } from "./SpotHoverPreview";
export { SpotCollectionPopover } from "./SpotCollectionPopover";
export { SpotEndpointHitArea } from "./SpotEndpointHitArea";
export { GlobeClickHandler } from "./GlobeClickHandler";
export { MapTooltip } from "./MapTooltip";
export { MapFlyout } from "./MapFlyout";
export { PinFlyout, type PinFlyoutProps } from "./PinFlyout";

// 2D Flat Map components
export { FlatMapView } from "./FlatMapView";
export { useFlatMapClickHandler } from "./FlatMapClickHandler";

// Azimuthal projection view
export { AzimuthalView } from "./AzimuthalView";

// Control components
export { TimeControl } from "./TimeControl";
export { ReachMapControl } from "./ReachMapControl";
export { DateTimePicker } from "./DateTimePicker";
export { MapSizeSliders } from "./MapSizeSliders";
export { PathAnalysis } from "./PathAnalysis";
export { PropagationForecast } from "./PropagationForecast";
export { PropagationForecastMini } from "./PropagationForecastMini";
export { BandConditionsPanel } from "./BandConditionsPanel";
export { QuickTargets } from "./QuickTargets";

// Fullscreen view
export { FullscreenPropSphere } from "./FullscreenPropSphere";

// Recommendations
export { RecommendationsPanel } from "./RecommendationsPanel";
export { RecommendationsBadge } from "./RecommendationsBadge";

// Operator profile widget
export { OperatorProfile } from "./OperatorProfile";

// Solar snapshot (propagation index + solar indicators + optimal band)
export { SolarSnapshot } from "./SolarSnapshot";

// Mobile conditions pill
export { ConditionsPill } from "./ConditionsPill";

// Optimal bands pop-out panel
export { OptimalBandsPanel } from "./OptimalBandsPanel";

// LocationMarker exports (for difficulty utilities)
export {
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS,
  getDifficultyColor,
  type DifficultyLevel,
} from "./LocationMarker";

// Layout mode dropdown
export { LayoutModeDropdown } from "./LayoutModeDropdown";

// Toolbar popovers
export { LayersPopover } from "./LayersPopover";
export { ColorsPopover } from "./ColorsPopover";
export { ProfilePopover } from "./ProfilePopover";
export { ViewsPopover } from "./ViewsPopover";

// Visual style selector (Realistic / High-Viz, Mode / Band coloring)
export { StyleSelector } from "./StyleSelector";

// Layer submenu components (Basemap, SatelliteFilters, SatelliteDetailModal)
export {
  BasemapCategory,
  SatelliteFilters,
  SatelliteDetailModal,
} from "./layers";

// DX News ticker
export { DXNewsTicker } from "./DXNewsTicker";

// Pin management components
export { AddPinDialog } from "./AddPinDialog";
export { PinList } from "./PinList";

// Grid research panel
export {
  GridResearchPanel,
  type GridResearchAction,
} from "./GridResearchPanel";

// Watch system components
export { WatchPopover } from "./WatchPopover";
export { WatchStatusPill } from "./WatchStatusPill";

// Replay system components
export { ReplayIndicator } from "./ReplayIndicator";
export { GridGlowOverlay } from "./GridGlowOverlay";

// Contest integration
export { ContestRatePanel } from "./ContestRatePanel";

// Feasibility indicator
export { FeasibilityBadge } from "./FeasibilityBadge";
export type { FeasibilityLevel } from "@/hooks/useFeasibility";

// Keyboard shortcuts help overlay
export { KeyboardShortcutsOverlay } from "./KeyboardShortcutsOverlay";

// Quick Grid Input modal
export { QuickGridInput } from "./QuickGridInput";

// Mini-map navigator
export {
  MiniMapNavigator,
  type MiniMapNavigatorProps,
  type MiniMapPosition,
} from "./MiniMapNavigator";

// Region preset components
export { RegionPresetSelector } from "./RegionPresetSelector";
export { RegionPresetManager } from "./RegionPresetManager";

// Satellite tracking
export { SatelliteOverlay } from "./SatelliteOverlay";
export { SatellitePanel } from "./SatellitePanel";

// Labels panel (sub-toggles for label layers)
export { LabelsPanel } from "./LabelsPanel";

// Observatory mode components
export { ObservatoryTiltSlider } from "./ObservatoryTiltSlider";
export { AnimatedSpotTraces } from "./AnimatedSpotTraces";

// Selected spot highlight (persistent arc for DX cluster selection)
export { SelectedSpotArc } from "./SelectedSpotArc";

// Hazard overlays
export { EarthquakeOverlay3D } from "./EarthquakeOverlay3D";
export { WeatherAlerts3D } from "./WeatherAlerts3D";
export { LightningOverlay3D } from "./LightningOverlay3D";
export { FireOverlay3D } from "./FireOverlay3D";
export { WeatherRadarOverlay } from "./WeatherRadarOverlay";
export { ImageryAttribution } from "./ImageryAttribution";
export { CloudImageryAttribution } from "./CloudImageryAttribution";
