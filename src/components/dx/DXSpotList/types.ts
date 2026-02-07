/**
 * DXSpotList Type Definitions
 *
 * Interfaces and types for the DXSpotList component family.
 * This file should have no imports from other local module files to avoid circular dependencies.
 */

import type { DXSpot, SpotSourceType } from "@/types/dxcluster";
import type { BandPreset } from "@/types/user";

/**
 * Worked status information for a callsign
 */
export interface WorkedStatus {
  /** Whether the callsign has ever been worked */
  isWorked: boolean;
  /** Whether worked on the current spot's band */
  workedOnBand: boolean;
  /** List of bands the callsign has been worked on */
  workedBands: string[];
  /** Whether this is an All-Time New One (DXCC entity never worked) */
  isATNO: boolean;
  /** DXCC entity name for display (if resolved) */
  entityName?: string;
}

/**
 * Props for the SpotRow component
 */
export interface SpotRowProps {
  spot: DXSpot;
  index: number;
  isSelected: boolean;
  isHovered: boolean;
  workedStatus: WorkedStatus;
  isAlertMatch: boolean;
  isNeeded: boolean;
  distanceKm: number | null;
  onSelect: (spot: DXSpot) => void;
  onHover: (spot: DXSpot | null) => void;
  onContextMenu?: (spot: DXSpot, position: { x: number; y: number }) => void;
  onGridClick?: (grid: string) => void;
  onBandClick?: (band: string) => void;
  onFrequencyCopied?: (frequency: number) => void;
  /** Quick action: set target on map (crosshair icon) */
  onSetTarget?: (spot: DXSpot) => void;
  /** Quick action: watch callsign (eye icon) */
  onWatchCallsign?: (spot: DXSpot) => void;
  /** Quick action: hide spot (x icon) */
  onHideSpot?: (spot: DXSpot) => void;
  /** Whether to show the age column */
  showAgeColumn?: boolean;
  /** Whether age-based row opacity is enabled */
  ageVisualizationEnabled?: boolean;
  /** Currently active band filter (for showing active state on badge) */
  activeBandFilter?: string | null;
  /** Q8: Whether this row is temporarily highlighted (scroll-to animation) */
  isHighlighted?: boolean;
  /** QoL1: Whether this row has keyboard focus */
  isFocused?: boolean;
}

/**
 * Props for the FilterControls component
 */
export interface FilterControlsProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  gridFilter: string;
  onGridFilterChange: (grid: string) => void;
  maxAge: number;
  onMaxAgeChange: (age: number) => void;
  selectedBands: string[];
  onBandToggle: (band: string) => void;
  selectedModes: string[];
  onModeToggle: (mode: string) => void;
  selectedSources: SpotSourceType[];
  onSourceToggle: (source: SpotSourceType) => void;
  availableBands: string[];
  availableModes: string[];
  // Band Sync Mode (Feature 2.3)
  syncMode: boolean;
  syncedBand: string | null;
  onSyncToggle: () => void;
  // Needed filter (Feature 2.1)
  neededOnly: boolean;
  onNeededOnlyToggle: () => void;
  sortByNeeded: boolean;
  onSortByNeededToggle: () => void;
  neededCount: number;
  // Band Presets (Q11)
  bandPresets: BandPreset[];
  onSavePreset: (name: string) => void;
  onApplyPreset: (bands: string[]) => void;
  onDeletePreset: (id: string) => void;
}

/**
 * Props for the main DXSpotList component
 */
export interface DXSpotListProps {
  /** Maximum height of the list container */
  maxHeight?: string;
  /** Show filter controls */
  showFilters?: boolean;
  /** Show header */
  showHeader?: boolean;
  /** Custom class name */
  className?: string;
  /** Callback when expand button is clicked */
  onExpand?: () => void;
  /** Callback when research grid action is triggered from context menu */
  onResearchGrid?: (grid: string) => void;
}

/**
 * Context menu state for spot right-click actions
 */
export interface ContextMenuState {
  spot: DXSpot;
  position: { x: number; y: number };
}
