/**
 * Solar Components - Barrel Export
 * Components for displaying solar weather and band condition data
 *
 * Import components from this file for cleaner imports:
 * ```tsx
 * import { BandConditions, KIndexChart, PrimaryMetrics } from '@/components/solar';
 * ```
 */

// Primary Metrics
export { MetricCard, type MetricCardProps } from "./MetricCard";
export { PrimaryMetrics, type PrimaryMetricsProps } from "./PrimaryMetrics";
export { SolarSummary, type SolarSummaryProps } from "./SolarSummary";

// Band Conditions Table
export { BandRow, type BandRowProps } from "./BandRow";
export { BandConditions, type BandConditionsProps } from "./BandConditions";

// K-Index Chart
export {
  KIndexChart,
  type KIndexChartProps,
  type KIndexDataPoint,
} from "./KIndexChart";

// A-Index Chart
export {
  AIndexChart,
  type AIndexChartProps,
  type AIndexDataPoint,
} from "./AIndexChart";

// Flare Probability & Solar Flux
export {
  FlareProbability,
  type FlareProbabilityProps,
} from "./FlareProbability";
export { SolarFluxChart, type SolarFluxChartProps } from "./SolarFluxChart";
export { EventAlert, type EventAlertProps } from "./EventAlert";

// IMF Bz Chart
export {
  BzChart,
  type BzChartProps,
  type BzDataPoint as BzChartDataPoint,
} from "./BzChart";

// Propagation Index
export {
  PropagationIndex,
  type PropagationIndexProps,
  calculatePropagationIndex,
} from "./PropagationIndex";

// Modal Components
export {
  // Metric Modals
  SolarFluxModal,
  type SolarFluxModalProps,
  KIndexModal,
  type KIndexModalProps,
  SunspotModal,
  type SunspotModalProps,
  AIndexModal,
  type AIndexModalProps,
  BzModal,
  type BzModalProps,
  type BzDataPoint,
  BzChartModal,
  type BzChartModalProps,
  PropagationIndexModal,
  type PropagationIndexModalProps,
  // Chart/Summary Modals
  KIndexChartModal,
  type KIndexChartModalProps,
  AIndexChartModal,
  type AIndexChartModalProps,
  SolarFluxChartModal,
  type SolarFluxChartModalProps,
  SolarSummaryModal,
  type SolarSummaryModalProps,
  FlareProbabilityModal,
  type FlareProbabilityModalProps,
  BandConditionsModal,
  type BandConditionsModalProps,
} from "./modals";
