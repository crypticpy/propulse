/**
 * Map Types
 *
 * Type definitions for the 2D/3D map views including region presets
 * and zoom state management. Region presets allow users to quickly
 * navigate to common geographic views for DX hunting and propagation
 * analysis.
 */

/**
 * Region view preset for quick navigation between geographic areas.
 * Built-in presets cover major DX regions and propagation paths.
 * Users can also create custom presets from their current view.
 */
export interface RegionPreset {
  /** Unique identifier (e.g., "preset-world", "preset-na") */
  id: string;
  /** Display name for the preset */
  name: string;
  /** Emoji or icon identifier for visual distinction */
  icon?: string;
  /** Geographic center point of the view */
  center: { lat: number; lon: number };
  /** Zoom level for the view (0.5 - 4.0) */
  zoom: number;
  /** Globe rotation angles for 3D mode */
  rotation?: { x: number; y: number };
  /** Optional view mode lock when activating this preset */
  viewMode?: "globe" | "flat" | "azimuthal";
  /** Whether this is a built-in preset (cannot be deleted) */
  isBuiltIn: boolean;
  /** ISO timestamp when the preset was created */
  createdAt: string;
  /** ISO timestamp when the preset was last activated */
  lastUsed?: string;
}

/**
 * Zoom state for 2D flat map pan/zoom interactions.
 * Tracks the current transform applied to the flat map projection.
 */
export interface FlatMapZoomState {
  /** Current scale factor (1.0 = no zoom) */
  scale: number;
  /** Horizontal pan offset in pixels */
  offsetX: number;
  /** Vertical pan offset in pixels */
  offsetY: number;
}

/**
 * Fixed creation date for all built-in presets.
 * Using a stable date ensures consistent ordering and avoids
 * unnecessary diffs when presets are serialized.
 */
const BUILT_IN_CREATED_AT = "2025-01-01T00:00:00.000Z";

/**
 * Default built-in region presets covering major DX regions
 * and common propagation paths. These cannot be deleted by users.
 */
export const DEFAULT_REGION_PRESETS: RegionPreset[] = [
  {
    id: "preset-world",
    name: "World Overview",
    icon: "\u{1F30D}",
    center: { lat: 0, lon: 0 },
    zoom: 1.0,
    isBuiltIn: true,
    createdAt: BUILT_IN_CREATED_AT,
  },
  {
    id: "preset-na",
    name: "North America",
    icon: "\u{1F1FA}\u{1F1F8}",
    center: { lat: 40, lon: -100 },
    zoom: 1.8,
    isBuiltIn: true,
    createdAt: BUILT_IN_CREATED_AT,
  },
  {
    id: "preset-eu",
    name: "Europe",
    icon: "\u{1F1EA}\u{1F1FA}",
    center: { lat: 50, lon: 10 },
    zoom: 2.0,
    isBuiltIn: true,
    createdAt: BUILT_IN_CREATED_AT,
  },
  {
    id: "preset-ja",
    name: "Japan/Pacific",
    icon: "\u{1F1EF}\u{1F1F5}",
    center: { lat: 35, lon: 140 },
    zoom: 1.8,
    isBuiltIn: true,
    createdAt: BUILT_IN_CREATED_AT,
  },
  {
    id: "preset-caribbean",
    name: "Caribbean",
    icon: "\u{1F3DD}\u{FE0F}",
    center: { lat: 18, lon: -70 },
    zoom: 2.2,
    isBuiltIn: true,
    createdAt: BUILT_IN_CREATED_AT,
  },
  {
    id: "preset-sa",
    name: "South America",
    icon: "\u{1F30E}",
    center: { lat: -15, lon: -60 },
    zoom: 1.6,
    isBuiltIn: true,
    createdAt: BUILT_IN_CREATED_AT,
  },
  {
    id: "preset-af",
    name: "Africa",
    icon: "\u{1F30D}",
    center: { lat: 5, lon: 20 },
    zoom: 1.4,
    isBuiltIn: true,
    createdAt: BUILT_IN_CREATED_AT,
  },
  {
    id: "preset-oc",
    name: "Oceania",
    icon: "\u{1F998}",
    center: { lat: -25, lon: 135 },
    zoom: 1.6,
    isBuiltIn: true,
    createdAt: BUILT_IN_CREATED_AT,
  },
  {
    id: "preset-path-na-eu",
    name: "NA\u2192EU Path",
    icon: "\u{1F4E1}",
    center: { lat: 45, lon: -30 },
    zoom: 1.2,
    isBuiltIn: true,
    createdAt: BUILT_IN_CREATED_AT,
  },
  {
    id: "preset-path-na-ja",
    name: "NA\u2192JA Path",
    icon: "\u{1F4E1}",
    center: { lat: 40, lon: -160 },
    zoom: 1.2,
    isBuiltIn: true,
    createdAt: BUILT_IN_CREATED_AT,
  },
];
