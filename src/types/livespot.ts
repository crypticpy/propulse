/**
 * Live Spot Types
 * Extends DXSpot with source attribution for real-time spot integration
 */

import type { DXSpot } from "./dxcluster";

/**
 * Source of the spot data
 */
export type SpotSource = "PSKReporter" | "RBN" | "Cluster" | "Demo";

/**
 * Extended spot with source attribution and additional metadata
 */
export interface LiveSpot extends DXSpot {
  /** Source of the spot data */
  source: SpotSource;
  /** Signal-to-noise ratio (PSKReporter) */
  snr?: number;
  /** CW speed in words per minute (RBN) */
  wpm?: number;
  /** Receiver callsign (who heard it) */
  receiverCallsign?: string;
  /** Receiver grid locator */
  receiverGrid?: string;
}

/**
 * Filter options for live spots
 */
export interface LiveSpotFilters {
  /** Sources to include */
  sources: SpotSource[];
  /** Bands to filter (e.g., ['20m', '40m']) */
  bands: string[];
  /** Modes to filter (e.g., ['FT8', 'CW']) */
  modes: string[];
  /** Maximum age in minutes */
  maxAge: number;
  /** Only show spots relevant to current path */
  onlyPathRelevant: boolean;
}

/**
 * Color configuration for spot sources
 */
export const SPOT_SOURCE_COLORS: Record<
  SpotSource,
  { color: string; bgColor: string }
> = {
  PSKReporter: { color: "#54a0ff", bgColor: "rgba(84, 160, 255, 0.2)" },
  RBN: { color: "#1dd1a1", bgColor: "rgba(29, 209, 161, 0.2)" },
  Cluster: { color: "#ff9f43", bgColor: "rgba(255, 159, 67, 0.2)" },
  Demo: { color: "#a5b1c2", bgColor: "rgba(165, 177, 194, 0.2)" },
};

/**
 * PSKReporter API response types
 */
export interface PSKReporterSpot {
  senderCallsign: string;
  senderLocator?: string;
  receiverCallsign: string;
  receiverLocator?: string;
  frequency: number;
  flowStartSeconds: number;
  mode: string;
  sNR?: number;
}

/**
 * RBN API response types
 */
export interface RBNSpot {
  callsign: string;
  de_cont: string;
  de_pfx: string;
  dx_cont: string;
  dx_pfx: string;
  freq: number;
  band: number;
  mode: string;
  db: number;
  wpm: number;
  time: number;
  spotted_time: string;
}
