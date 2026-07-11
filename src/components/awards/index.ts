/**
 * Awards Components
 *
 * Components for displaying amateur radio award progress:
 * - DXCC (DX Century Club)
 * - WAS (Worked All States)
 * - WAZ (Worked All Zones)
 */

// Award Progress Components
export { DXCCProgress, type DXCCProgressProps } from "./DXCCProgress";
export { WASProgress, type WASProgressProps } from "./WASProgress";
export { WAZProgress, type WAZProgressProps } from "./WAZProgress";
export { AwardsDashboard, type AwardsDashboardProps } from "./AwardsDashboard";

// Re-export hook and types for convenience
export {
  useAwards,
  useIsATNO,
  type AwardsProgress,
  type DXCCProgress as DXCCProgressData,
  type WASProgress as WASProgressData,
  type WAZProgress as WAZProgressData,
  type UseAwardsResult,
} from "../../hooks/useAwards";

// Re-export data modules
export {
  getDXCCFromCallsign,
  getDXCCFromPrefix,
  getAllCurrentEntities,
  getEntitiesByContinent,
  type DXCCEntity,
} from "../../lib/data/dxcc";

export {
  getStateFromQTH,
  getStateByCode,
  US_STATES,
  TOTAL_STATES,
  type USState,
} from "../../lib/data/states";

export {
  getZoneByNumber,
  getZoneFromPrefix,
  CQ_ZONES,
  TOTAL_ZONES,
  type CQZone,
} from "../../lib/data/zones";
