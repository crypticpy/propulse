/**
 * Contest UI Components
 * Components for ham radio contest logging
 */

// Configuration modal
export { ContestConfigModal } from "./ContestConfigModal";
export type {
  ContestConfigModalProps,
  ContestConfig,
} from "./ContestConfigModal";

// Legacy score panel (retained for backwards compatibility)
export { ContestScorePanel } from "./ContestScorePanel";
export type { ContestScorePanelProps } from "./ContestScorePanel";

// New composable panels (Phase 2)
export { ContestScoreboard } from "./ContestScoreboard";
export type { ContestScoreboardProps } from "./ContestScoreboard";

export { ContestEntryArea } from "./ContestEntryArea";
export type { ContestEntryAreaProps } from "./ContestEntryArea";

export { ContestMultiplierPanel } from "./ContestMultiplierPanel";
export type { ContestMultiplierPanelProps } from "./ContestMultiplierPanel";

export { ContestQSOTable } from "./ContestQSOTable";
export type { ContestQSOTableProps } from "./ContestQSOTable";

// Entry form (used by ContestEntryArea)
export { ContestEntryForm } from "./ContestEntryForm";
export type { ContestEntryFormProps } from "./ContestEntryForm";

// One-line entry (Phase 3 - keyboard-first high-speed entry)
export { ContestOneLineEntry } from "./ContestOneLineEntry";
export type { ContestOneLineEntryProps } from "./ContestOneLineEntry";

// Edit last modal (Phase 3 - fast QSO correction)
export { ContestEditLastModal } from "./ContestEditLastModal";
export type { ContestEditLastModalProps } from "./ContestEditLastModal";

// Multiplier tracker (used by ContestMultiplierPanel)
export { MultiplierTracker } from "./MultiplierTracker";
export type { MultiplierTrackerProps } from "./MultiplierTracker";

// Phase 4B - Multiplier Matrix and Needed List
export { MultiplierMatrix } from "./MultiplierMatrix";
export type { MultiplierMatrixProps } from "./MultiplierMatrix";

export { NeededMultsPanel } from "./NeededMultsPanel";
export type { NeededMultsPanelProps } from "./NeededMultsPanel";

// UI components
export { DupeIndicator } from "./DupeIndicator";
export type { DupeIndicatorProps } from "./DupeIndicator";

// Phase 4C - Quality Control
export { AuditQueuePanel } from "./AuditQueuePanel";
export type { AuditQueuePanelProps } from "./AuditQueuePanel";

// Phase 5A - Contest-Aware Spots Panel
export { ContestSpotsPanel } from "./ContestSpotsPanel";
export type {
  ContestSpotsPanelProps,
  ContestSpot,
  SpotStatus,
} from "./ContestSpotsPanel";

// Phase 5B - Contest BandMap Integration
export { ContestBandMap } from "./ContestBandMap";
export type { ContestBandMapProps } from "./ContestBandMap";

// Phase 5C - Band Readiness Strip
export { BandReadinessStrip } from "./BandReadinessStrip";
export type { BandReadinessStripProps, BandStatus } from "./BandReadinessStrip";

// Phase 6A - Cabrillo Export
export { CabrilloExportModal } from "./CabrilloExportModal";
export type { CabrilloExportModalProps } from "./CabrilloExportModal";

// Phase 6C.1 - Call History Import (SCP Booster)
export { CallHistoryImportModal } from "./CallHistoryImportModal";
export type { CallHistoryImportModalProps } from "./CallHistoryImportModal";

// Phase 6B.1 - ADIF Import/Export
export { ADIFImportExportModal } from "./ADIFImportExportModal";
export type { ADIFImportExportModalProps } from "./ADIFImportExportModal";

// Phase 7E.1 - Bridge Connection and Rig Status
export { BridgeStatusIndicator } from "./BridgeStatusIndicator";
export type { BridgeStatusIndicatorProps } from "./BridgeStatusIndicator";

export { RigStatusBar } from "./RigStatusBar";
export type { RigStatusBarProps } from "./RigStatusBar";

// Phase 5 - Contest Timer and Off-Time Tracker
export { ContestTimer } from "./ContestTimer";
export type { ContestTimerProps } from "./ContestTimer";

// Phase 5 - Band-Change Advisor
export { BandAdvisor } from "./BandAdvisor";
export type { BandAdvisorProps } from "./BandAdvisor";

// Tier 3 - Contest Rate Sheet
export { ContestRateSheet } from "./ContestRateSheet";
export type { ContestRateSheetProps } from "./ContestRateSheet";
