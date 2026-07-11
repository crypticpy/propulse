/**
 * React hook for tracking amateur radio award progress
 * Tracks DXCC (DX Century Club), WAS (Worked All States), and WAZ (Worked All Zones) awards
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useLogbook } from "./useLogbook";
import {
  getDXCCFromCallsign,
  getAllCurrentEntities,
  getEntityCountByContinent,
  getCurrentEntityCount,
  type DXCCEntity,
} from "../lib/data/dxcc";
import { getStateFromQTH, US_STATES, TOTAL_STATES } from "../lib/data/states";
import { CQ_ZONES, TOTAL_ZONES } from "../lib/data/zones";

/**
 * DXCC award progress details
 */
export interface DXCCProgress {
  /** Number of unique DXCC entities worked */
  worked: number;
  /** Number of entities confirmed (QSL/LoTW) */
  confirmed: number;
  /** Entity IDs still needed for basic award */
  needed: number[];
  /** Total number of current DXCC entities */
  total: number;
  /** Breakdown by continent */
  byContinent: Record<string, { worked: number; total: number }>;
  /** Recently worked new entities (last 10) */
  recentNew: Array<{
    entity: DXCCEntity;
    callsign: string;
    date: string;
  }>;
}

/**
 * WAS (Worked All States) award progress
 */
export interface WASProgress {
  /** Number of unique US states worked */
  worked: number;
  /** Number of states confirmed (QSL/LoTW) */
  confirmed: number;
  /** State codes still needed */
  needed: string[];
  /** Total number of US states (50) */
  total: 50;
  /** Map of state code to worked status */
  stateStatus: Record<string, { worked: boolean; confirmed: boolean }>;
}

/**
 * WAZ (Worked All Zones) award progress
 */
export interface WAZProgress {
  /** Number of unique CQ zones worked */
  worked: number;
  /** Number of zones confirmed (QSL/LoTW) */
  confirmed: number;
  /** Zone numbers still needed */
  needed: number[];
  /** Total number of CQ zones (40) */
  total: 40;
  /** Map of zone number to worked status */
  zoneStatus: Record<number, { worked: boolean; confirmed: boolean }>;
}

/**
 * Complete awards progress tracking
 */
export interface AwardsProgress {
  dxcc: DXCCProgress;
  was: WASProgress;
  waz: WAZProgress;
}

/**
 * Return type for the useAwards hook
 */
export interface UseAwardsResult {
  /** Complete awards progress data */
  progress: AwardsProgress;
  /** Loading state */
  isLoading: boolean;
  /** Check if a callsign represents an All-Time New One (ATNO) */
  isNewEntity: (callsign: string) => boolean;
  /** Get DXCC entity for a callsign */
  getEntityForCallsign: (callsign: string) => DXCCEntity | null;
  /** Refresh awards data from logbook */
  refresh: () => void;
}

/**
 * Hook for tracking amateur radio award progress
 *
 * @example
 * ```tsx
 * const { progress, isNewEntity } = useAwards();
 *
 * // Display DXCC progress
 * console.log(`DXCC: ${progress.dxcc.worked}/${progress.dxcc.total}`);
 *
 * // Check for new entities during spotting
 * if (isNewEntity('3Y0J')) {
 *   console.log('ATNO alert! Bouvet Island!');
 * }
 * ```
 */
export function useAwards(): UseAwardsResult {
  const {
    entries,
    loading: logbookLoading,
    refresh: refreshLogbook,
  } = useLogbook();
  const [isLoading, setIsLoading] = useState(true);

  // Get total entity count
  const totalEntities = useMemo(() => getCurrentEntityCount(), []);

  // Calculate DXCC progress
  const dxccProgress = useMemo((): DXCCProgress => {
    const workedEntities = new Map<
      number,
      { confirmed: boolean; callsign: string; date: string }
    >();
    const continentCounts = getEntityCountByContinent();

    // Initialize continent progress
    const byContinent: Record<string, { worked: number; total: number }> = {};
    for (const [continent, total] of Object.entries(continentCounts)) {
      byContinent[continent] = { worked: 0, total };
    }

    // Track worked entities from logbook entries
    for (const entry of entries) {
      const entity = getDXCCFromCallsign(entry.callsign);
      if (entity && !entity.deleted) {
        const existing = workedEntities.get(entity.id);
        const isConfirmed =
          entry.qslRcvd === "Y" || entry.lotw === true || entry.eqsl === true;

        if (!existing) {
          workedEntities.set(entity.id, {
            confirmed: isConfirmed,
            callsign: entry.callsign,
            date: entry.date,
          });
        } else if (isConfirmed && !existing.confirmed) {
          // Update to confirmed status
          workedEntities.set(entity.id, {
            ...existing,
            confirmed: true,
          });
        }
      }
    }

    // Calculate worked count per continent
    const allEntities = getAllCurrentEntities();
    for (const entity of allEntities) {
      if (workedEntities.has(entity.id) && byContinent[entity.continent]) {
        byContinent[entity.continent].worked++;
      }
    }

    // Calculate needed entities
    const workedIds = new Set(workedEntities.keys());
    const needed = allEntities
      .filter((e) => !workedIds.has(e.id))
      .map((e) => e.id);

    // Get confirmed count
    const confirmed = Array.from(workedEntities.values()).filter(
      (e) => e.confirmed,
    ).length;

    // Get recent new entities (sorted by date, newest first)
    const recentNew = Array.from(workedEntities.entries())
      .map(([id, data]) => ({
        entity: allEntities.find((e) => e.id === id)!,
        callsign: data.callsign,
        date: data.date,
      }))
      .filter((item) => item.entity)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);

    return {
      worked: workedEntities.size,
      confirmed,
      needed,
      total: totalEntities,
      byContinent,
      recentNew,
    };
  }, [entries, totalEntities]);

  // Calculate WAS progress
  const wasProgress = useMemo((): WASProgress => {
    const stateStatus: Record<string, { worked: boolean; confirmed: boolean }> =
      {};

    // Initialize all states as not worked
    for (const state of US_STATES) {
      stateStatus[state.code] = { worked: false, confirmed: false };
    }

    // Track worked states from US entries
    for (const entry of entries) {
      // Only process US callsigns
      const callsign = entry.callsign.toUpperCase();
      if (
        !callsign.startsWith("K") &&
        !callsign.startsWith("W") &&
        !callsign.startsWith("N") &&
        !callsign.startsWith("A")
      ) {
        continue;
      }

      // Try to extract state from QTH or notes
      const qth = entry.qth || entry.notes || "";
      const state = getStateFromQTH(qth);

      if (state) {
        const isConfirmed =
          entry.qslRcvd === "Y" || entry.lotw === true || entry.eqsl === true;
        const existing = stateStatus[state.code];

        if (!existing.worked) {
          stateStatus[state.code] = { worked: true, confirmed: isConfirmed };
        } else if (isConfirmed && !existing.confirmed) {
          stateStatus[state.code].confirmed = true;
        }
      }
    }

    // Calculate counts
    const worked = Object.values(stateStatus).filter((s) => s.worked).length;
    const confirmed = Object.values(stateStatus).filter(
      (s) => s.confirmed,
    ).length;
    const needed = US_STATES.filter((s) => !stateStatus[s.code].worked).map(
      (s) => s.code,
    );

    return {
      worked,
      confirmed,
      needed,
      total: TOTAL_STATES as 50,
      stateStatus,
    };
  }, [entries]);

  // Calculate WAZ progress
  const wazProgress = useMemo((): WAZProgress => {
    const zoneStatus: Record<number, { worked: boolean; confirmed: boolean }> =
      {};

    // Initialize all zones as not worked
    for (const zone of CQ_ZONES) {
      zoneStatus[zone.zone] = { worked: false, confirmed: false };
    }

    // Track worked zones from entries
    for (const entry of entries) {
      const entity = getDXCCFromCallsign(entry.callsign);
      if (entity && !entity.deleted) {
        const zone = entity.cqZone;
        if (zone >= 1 && zone <= 40) {
          const isConfirmed =
            entry.qslRcvd === "Y" || entry.lotw === true || entry.eqsl === true;
          const existing = zoneStatus[zone];

          if (!existing.worked) {
            zoneStatus[zone] = { worked: true, confirmed: isConfirmed };
          } else if (isConfirmed && !existing.confirmed) {
            zoneStatus[zone].confirmed = true;
          }
        }
      }
    }

    // Calculate counts
    const worked = Object.values(zoneStatus).filter((z) => z.worked).length;
    const confirmed = Object.values(zoneStatus).filter(
      (z) => z.confirmed,
    ).length;
    const needed = CQ_ZONES.filter((z) => !zoneStatus[z.zone].worked).map(
      (z) => z.zone,
    );

    return {
      worked,
      confirmed,
      needed,
      total: TOTAL_ZONES as 40,
      zoneStatus,
    };
  }, [entries]);

  // Combined progress object
  const progress = useMemo(
    (): AwardsProgress => ({
      dxcc: dxccProgress,
      was: wasProgress,
      waz: wazProgress,
    }),
    [dxccProgress, wasProgress, wazProgress],
  );

  // Build set of worked entity IDs for fast lookup
  const workedEntityIds = useMemo(() => {
    const ids = new Set<number>();
    for (const entry of entries) {
      const entity = getDXCCFromCallsign(entry.callsign);
      if (entity && !entity.deleted) {
        ids.add(entity.id);
      }
    }
    return ids;
  }, [entries]);

  /**
   * Check if a callsign represents an All-Time New One (ATNO)
   * Returns true if the entity has never been worked before
   */
  const isNewEntity = useCallback(
    (callsign: string): boolean => {
      const entity = getDXCCFromCallsign(callsign);
      if (!entity || entity.deleted) {
        return false;
      }
      return !workedEntityIds.has(entity.id);
    },
    [workedEntityIds],
  );

  /**
   * Get the DXCC entity for a callsign
   */
  const getEntityForCallsign = useCallback(
    (callsign: string): DXCCEntity | null => {
      return getDXCCFromCallsign(callsign);
    },
    [],
  );

  /**
   * Refresh awards data by refreshing the logbook
   */
  const refresh = useCallback(() => {
    refreshLogbook();
  }, [refreshLogbook]);

  // Update loading state
  useEffect(() => {
    setIsLoading(logbookLoading);
  }, [logbookLoading]);

  return {
    progress,
    isLoading,
    isNewEntity,
    getEntityForCallsign,
    refresh,
  };
}

/**
 * Hook to check if a specific callsign is an All-Time New One
 * Lightweight version for use in spot lists
 *
 * @param callsign - Callsign to check
 * @returns Object with entity info and ATNO status
 */
export function useIsATNO(callsign: string) {
  const { isNewEntity, getEntityForCallsign, isLoading } = useAwards();

  const entity = useMemo(
    () => getEntityForCallsign(callsign),
    [callsign, getEntityForCallsign],
  );
  const isATNO = useMemo(() => isNewEntity(callsign), [callsign, isNewEntity]);

  return {
    entity,
    isATNO,
    isLoading,
  };
}
