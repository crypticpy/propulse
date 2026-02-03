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
