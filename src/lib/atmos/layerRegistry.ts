/**
 * Registry of AtmosPulse layer metadata
 * Used by the layer panel UI to display toggles and descriptions
 */

import type { AtmosLayerId } from "@/types/atmos";

export interface AtmosLayerMeta {
  id: AtmosLayerId;
  label: string;
  icon: string;
  category: "weather" | "atmospheric" | "infrastructure" | "analysis";
  description: string;
}

export const ATMOS_LAYERS: AtmosLayerMeta[] = [
  {
    id: "radar",
    label: "Weather Radar",
    icon: "radar",
    category: "weather",
    description: "IEM NEXRAD 1km (US) + RainViewer global radar",
  },
  {
    id: "lightning",
    label: "Lightning",
    icon: "bolt",
    category: "weather",
    description: "Real-time lightning strikes",
  },
  {
    id: "alerts",
    label: "NWS Alerts",
    icon: "warning",
    category: "weather",
    description: "Watches, warnings & advisories",
  },
  {
    id: "fires",
    label: "Fire Hotspots",
    icon: "local_fire_department",
    category: "weather",
    description: "NASA VIIRS thermal anomalies",
  },
  {
    id: "goesCloud",
    label: "GOES Cloud",
    icon: "cloud",
    category: "atmospheric",
    description: "Satellite cloud imagery",
  },
  {
    id: "tec",
    label: "Ionospheric TEC",
    icon: "language",
    category: "atmospheric",
    description: "Total Electron Content",
  },
  {
    id: "repeaters",
    label: "Repeaters",
    icon: "cell_tower",
    category: "infrastructure",
    description: "Amateur radio repeaters",
  },
  {
    id: "riverGauges",
    label: "River Gauges",
    icon: "water",
    category: "infrastructure",
    description: "NOAA flood gauge data",
  },
  {
    id: "rim",
    label: "RIM Scores",
    icon: "analytics",
    category: "analysis",
    description: "Radio Impact Model scores",
  },
  {
    id: "sst",
    label: "Sea Surface Temp",
    icon: "thermostat",
    category: "atmospheric",
    description: "Ocean temperature anomaly",
  },
];
