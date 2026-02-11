/**
 * Operating Profile Types
 *
 * An OperatingProfile bundles layer configuration, display preferences,
 * spot filtering, and panel layout into a single switchable profile.
 * Built-in profiles cover common operating styles; users can create custom ones.
 */

import type { LayoutMode } from "@/stores/mapStore";

export interface SpotFilters {
  bands: string[]; // empty = all bands
  modes: string[]; // empty = all modes
}

export interface PanelVisibility {
  visible: boolean;
  collapsed: boolean;
}

export interface OperatingProfile {
  id: string;
  name: string;
  shortLabel: string; // 2-4 chars for compact display
  description: string;
  iconPath: string; // SVG path for 24x24 viewBox
  activeColor: string; // Tailwind color token (e.g., 'plasma-orange')

  // Layer configuration
  layers: {
    terminator: boolean;
    greyline: boolean;
    aurora: boolean;
    muf: boolean;
    nvis: boolean;
    spots: boolean;
    nightLights: boolean;
    labels: boolean;
    satellites: boolean;
  };

  // Display preferences
  spotColorMode: "mode" | "band" | "snr" | "age";
  visualStyle: "realistic" | "high-viz";
  mapStyle: "satellite" | "standard";

  // Spot filtering
  spotFilters: SpotFilters;

  // Panel configuration
  panelConfig: {
    bandConditions: PanelVisibility;
    pathAnalysis: PanelVisibility;
    dxCluster: PanelVisibility;
    satellites: PanelVisibility;
  };

  // Behavior
  autoFollow: boolean;
  suggestedLayoutMode?: LayoutMode;
  defaultZoomLevel?: number;
}

export type BuiltinProfileId =
  | "dx-hunter"
  | "contest"
  | "vhf"
  | "emergency"
  | "listener";

export type ProfileId = BuiltinProfileId | string;
