/**
 * DX Cluster types for Propulse
 * Types representing DX spots and cluster data
 */

/**
 * A single DX spot from a DX Cluster
 */
export interface DXSpot {
  /** Unique identifier for this spot */
  id: string;
  /** Callsign of the station that spotted this DX */
  spotter: string;
  /** Spotter's Maidenhead grid locator */
  spotterGrid?: string;
  /** Spotted DX station callsign */
  dx: string;
  /** DX station's Maidenhead grid locator */
  dxGrid?: string;
  /** Frequency in kHz */
  frequency: number;
  /** Operating mode (CW, SSB, FT8, etc.) */
  mode?: string;
  /** Spot comment/info from spotter */
  comment: string;
  /** Time the spot was posted */
  time: Date;
  /** Band designation derived from frequency (e.g., "20m", "40m") */
  band?: string;
  /** DX station latitude (estimated from grid) */
  dxLat?: number;
  /** DX station longitude (estimated from grid) */
  dxLon?: number;
  /** Spotter latitude (estimated from grid) */
  spotterLat?: number;
  /** Spotter longitude (estimated from grid) */
  spotterLon?: number;
}

/**
 * Spot source types for multi-source filtering
 */
export type SpotSourceType =
  | "PSKReporter"
  | "RBN"
  | "Cluster"
  | "Demo"
  | "WSJT-X";

/**
 * Filter options for DX spots
 */
export interface DXClusterFilters {
  /** Filter by specific bands (e.g., ["20m", "40m"]) */
  bands?: string[];
  /** Filter by specific modes (e.g., ["CW", "FT8"]) */
  modes?: string[];
  /** Filter by specific sources */
  sources?: SpotSourceType[];
  /** Maximum spot age in minutes */
  maxAge?: number;
  /** Search text to filter callsigns and comments */
  searchText?: string;
  /** Grid locator filter (matches spotter OR DX grid, prefix match) */
  gridFilter?: string;
  /** Show only "needed" spots (not yet worked, or band-new) */
  neededOnly?: boolean;
  /** Sort needed spots to top of list */
  sortByNeeded?: boolean;
}

/**
 * DX Cluster connection status
 */
export type DXClusterStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "error";

/**
 * Configuration for a DX Cluster server
 */
export interface DXClusterServer {
  /** Server hostname */
  host: string;
  /** Server port */
  port: number;
  /** Display name */
  name: string;
  /** Whether this is the default server */
  isDefault?: boolean;
}

/**
 * Statistics about current DX spots
 */
export interface DXSpotStats {
  /** Total number of spots */
  total: number;
  /** Spots per band */
  byBand: Record<string, number>;
  /** Spots per mode */
  byMode: Record<string, number>;
  /** Most spotted DX entity */
  topEntity?: string;
}

/**
 * Band color configuration for UI display
 */
export interface BandColorConfig {
  /** Band name (e.g., "20m") */
  band: string;
  /** Primary color for the band */
  color: string;
  /** Background color with transparency */
  bgColor: string;
}
