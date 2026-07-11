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
export {
  MUFOverlay,
  MUFDataSourceBadge,
  MUFComparisonDisplay,
} from "./MUFOverlay";
export { IonosondeMarkers, IonosondeLegend } from "./IonosondeMarkers";
export { SporadicEOverlay, SporadicELegend } from "./SporadicEOverlay";
export { MUFLegend, MUFLegendCompact } from "./MUFLegend";
export { PathArc } from "./PathArc";
export { LocationMarker } from "./LocationMarker";
export { LiveSpotArcs } from "./LiveSpotArcs";

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

// Optimal bands pop-out panel
export { OptimalBandsPanel } from "./OptimalBandsPanel";

// Beginner mode components
export { WhatsOpenNow } from "./WhatsOpenNow";

// LocationMarker exports (for difficulty utilities)
export {
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS,
  getDifficultyColor,
  type DifficultyLevel,
} from "./LocationMarker";
