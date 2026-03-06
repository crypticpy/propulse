/**
 * RIM (Radio Impact Model) Internal Types
 *
 * Types specific to RIM computation. Public-facing types (RIMResult, RIMSubScore,
 * RIMConfig) are exported from @/types/atmos.
 */

/** Input data collected from all hooks for RIM computation */
export interface RIMInput {
  // Solar/space weather
  kpIndex: number | null;
  solarFlux: number | null;
  xrayFlux: number | null;
  protonFlux: number | null;
  dstIndex: number | null;
  tecValue: number | null; // TECU — median TEC at station location (null if unavailable)

  // Terrestrial weather
  lightningStrikeCount: number;
  nearestLightningKm: number | null;
  activeAlertSeverities: ("Extreme" | "Severe" | "Moderate" | "Minor")[];
  hasActiveRadar: boolean;

  // Hydrological
  floodProximity?: "none" | "action" | "minor" | "moderate" | "major";

  // Station context
  stationLat: number | null;
  stationLon: number | null;

  // EmComm readiness
  repeaterCount: number;
  operationalRepeaterRatio: number | null;
  nvisViable: boolean;
  alertMaxSeverityLevel: number; // 0=none, 1=Minor, 2=Moderate, 3=Severe, 4=Extreme
}

/** Weather-to-radio impact matrix entry */
export interface WeatherImpactEntry {
  condition: string;
  hfImpact: "none" | "low" | "moderate" | "high" | "critical";
  vhfImpact: "none" | "low" | "moderate" | "high" | "critical";
  infraRisk: "none" | "low" | "moderate" | "high" | "critical";
  description: string;
}

/** Impact severity to numeric penalty (0 = no impact, 1 = total impact) */
export const IMPACT_PENALTY: Record<string, number> = {
  none: 0,
  low: 0.15,
  moderate: 0.35,
  high: 0.6,
  critical: 0.9,
};
