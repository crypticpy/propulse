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

// Flare Probability & Solar Flux
export {
  FlareProbability,
  type FlareProbabilityProps,
} from "./FlareProbability";
export { SolarFluxChart, type SolarFluxChartProps } from "./SolarFluxChart";
export { EventAlert, type EventAlertProps } from "./EventAlert";
