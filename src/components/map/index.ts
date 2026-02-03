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
export { PathArc } from "./PathArc";
export { LocationMarker } from "./LocationMarker";
export { CompassRose } from "./CompassRose";
export { LiveSpotArcs } from "./LiveSpotArcs";
export { SpotHighlight } from "./SpotHighlight";
export { SpotMarker } from "./SpotMarker";
export { SpotCluster } from "./SpotCluster";
export { GlobeClickHandler } from "./GlobeClickHandler";
export { GlobeTooltip } from "./GlobeTooltip";
export { GlobeFlyout } from "./GlobeFlyout";

// 2D Flat Map components
export { FlatMapView } from "./FlatMapView";

// Azimuthal projection view
export { AzimuthalView } from "./AzimuthalView";

// Control components
export { TimeControl } from "./TimeControl";
export { PathAnalysis } from "./PathAnalysis";
export { PropagationForecast } from "./PropagationForecast";
export { PropagationForecastMini } from "./PropagationForecastMini";
export { BandConditionsPanel } from "./BandConditionsPanel";
export { ViewModeToggle } from "./ViewModeToggle";
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

// Lite Mode toggle
export { LiteModeToggle } from "./LiteModeToggle";

// Pin management components
export { AddPinDialog } from "./AddPinDialog";
export { PinList } from "./PinList";

// Grid research panel
export {
  GridResearchPanel,
  type GridResearchAction,
} from "./GridResearchPanel";

// Watch system components
export { WatchIndicator } from "./WatchIndicator";
export { WatchListPanel } from "./WatchListPanel";

// Feasibility indicator
export { FeasibilityBadge } from "./FeasibilityBadge";
export type { FeasibilityLevel } from "@/hooks/useFeasibility";

// Keyboard shortcuts help overlay
export { KeyboardShortcutsOverlay } from "./KeyboardShortcutsOverlay";

// Quick Grid Input modal
export { QuickGridInput } from "./QuickGridInput";
