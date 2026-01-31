/**
 * Solar Modals - Barrel Export
 *
 * Modal components for displaying detailed information about solar metrics,
 * charts, and propagation conditions.
 *
 * @example
 * ```tsx
 * import {
 *   SolarFluxModal,
 *   KIndexModal,
 *   KIndexChartModal,
 *   SolarSummaryModal,
 * } from './modals';
 * ```
 */

// Metric Modals (individual KPI details)
export { SolarFluxModal, type SolarFluxModalProps } from "./SolarFluxModal";
export { KIndexModal, type KIndexModalProps } from "./KIndexModal";
export { SunspotModal, type SunspotModalProps } from "./SunspotModal";
export { AIndexModal, type AIndexModalProps } from "./AIndexModal";

// Chart/Summary Modals (expanded views with detailed analysis)
export {
  KIndexChartModal,
  type KIndexChartModalProps,
} from "./KIndexChartModal";
export {
  SolarFluxChartModal,
  type SolarFluxChartModalProps,
} from "./SolarFluxChartModal";
export {
  SolarSummaryModal,
  type SolarSummaryModalProps,
} from "./SolarSummaryModal";
export {
  FlareProbabilityModal,
  type FlareProbabilityModalProps,
} from "./FlareProbabilityModal";
export {
  BandConditionsModal,
  type BandConditionsModalProps,
} from "./BandConditionsModal";
export { BzModal, type BzModalProps, type BzDataPoint } from "./BzModal";
