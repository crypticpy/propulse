/**
 * Alert components for solar weather notifications
 *
 * This module provides components for displaying and managing
 * geomagnetic storm and solar event alerts.
 *
 * @module components/alerts
 *
 * @example
 * ```tsx
 * import { AlertBanner, AlertToastContainer } from "@/components/alerts";
 *
 * function App() {
 *   return (
 *     <>
 *       <AlertBanner alerts={activeAlerts} onDismiss={dismissAlert} onViewAll={handleViewAll} />
 *       <AlertToastContainer onDismiss={dismissAlert} />
 *     </>
 *   );
 * }
 * ```
 */

// Component exports
export { AlertBanner } from "./AlertBanner";
export { AlertToast } from "./AlertToast";
export { AlertToastContainer } from "./AlertToastContainer";
export { AlertHistoryModal } from "./AlertHistoryModal";

// Type exports
export type { AlertBannerProps } from "./AlertBanner";
export type { AlertToastProps } from "./AlertToast";
export type { AlertToastContainerProps } from "./AlertToastContainer";
export type { AlertHistoryModalProps } from "./AlertHistoryModal";

// Space Weather Alert Intelligence
export { SwpcAlertDetailModal } from "./SwpcAlertDetailModal";
export { AlertDetailModal } from "./AlertDetailModal";
export { EmergencyTickerBar } from "./EmergencyTickerBar";
export { AlertGlowOverlay } from "./AlertGlowOverlay";
export { StormImpactPanel } from "./StormImpactPanel";

// Spot alert components
export { SpotAlertToastContainer } from "./SpotAlertToast";
export type { SpotAlertToastContainerProps } from "./SpotAlertToast";
export { AlertRuleBuilder } from "./AlertRuleBuilder";
export { SpotAlertHistory } from "./AlertHistory";
export { ContestAlertProfiles } from "./ContestAlertProfiles";
