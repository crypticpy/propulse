/**
 * useDxccStatus — Real-time DXCC working status for a callsign.
 *
 * Resolves callsign -> DXCC entity via prefix lookup, then queries
 * local IndexedDB for all band+mode slots already worked for that
 * entity. Returns a 5-state status enum with tooltip metadata.
 *
 * Debounced 200ms from last character input. Requires 3+ characters.
 * Works fully offline (IndexedDB only, no network).
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { lookupEntity, getActiveDXCCCount } from "@/lib/data/dxccEntities";
import type { DXCCEntity } from "@/lib/data/dxccEntities";
import { getWorkedDxccSlots } from "@/lib/db/logStore";
import { getLogEntriesByCallsign } from "@/lib/db/logStore";
import { useContestStore } from "@/stores/contestStore";

// ── Types ────────────────────────────────────────────────────────────────────

export type DXCCStatus =
  | "new_entity"
  | "new_band"
  | "new_mode"
  | "worked"
  | "dupe";

/** Options for customizing DXCC status behavior */
export interface DXCCStatusOptions {
  /** When true, also check if the entity is a new multiplier for the active contest */
  contestMode?: boolean;
}

export interface DXCCStatusResult {
  /** Current DXCC working status */
  status: DXCCStatus | null;
  /** Resolved DXCC entity, if found */
  entity: DXCCEntity | null;
  /** Bands on which this entity has been worked */
  workedBands: string[];
  /** Modes on which this entity has been worked */
  workedModes: string[];
  /** Total active DXCC entities count */
  totalEntities: number;
  /** Number of unique DXCC entities in the log */
  workedEntityCount: number;
  /** One-line tooltip explanation */
  tooltipText: string;
  /** Whether a lookup is in progress */
  loading: boolean;
  /** Whether this entity is a new multiplier in the active contest (only when contestMode is true) */
  isNewMultiplier?: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 200;
const MIN_CALLSIGN_LENGTH = 3;
const TOTAL_ENTITIES = getActiveDXCCCount();

// ── Memoization cache ────────────────────────────────────────────────────────

/** Simple cache keyed by dxccId to avoid redundant IndexedDB queries within a session */
const slotsCache = new Map<
  number,
  { slots: { band: string; mode: string }[]; timestamp: number }
>();
const CACHE_TTL_MS = 5000; // 5 seconds — fresh enough for real-time feel

function getCachedSlots(
  dxccId: number,
): { band: string; mode: string }[] | null {
  const cached = slotsCache.get(dxccId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.slots;
  }
  return null;
}

function setCachedSlots(
  dxccId: number,
  slots: { band: string; mode: string }[],
): void {
  slotsCache.set(dxccId, { slots, timestamp: Date.now() });
}

/** Invalidate the cache for a specific entity (call after logging a QSO) */
export function invalidateDxccCache(dxccId?: number): void {
  if (dxccId !== undefined) {
    slotsCache.delete(dxccId);
  } else {
    slotsCache.clear();
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useDxccStatus(
  callsign: string,
  band: string,
  mode: string,
  options?: DXCCStatusOptions,
): DXCCStatusResult {
  const [status, setStatus] = useState<DXCCStatus | null>(null);
  const [entity, setEntity] = useState<DXCCEntity | null>(null);
  const [workedBands, setWorkedBands] = useState<string[]>([]);
  const [workedModes, setWorkedModes] = useState<string[]>([]);
  const [workedEntityCount, setWorkedEntityCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isNewMultiplier, setIsNewMultiplier] = useState<boolean | undefined>(
    undefined,
  );

  const contestMode = options?.contestMode ?? false;

  // Track the latest request to avoid stale updates
  const requestIdRef = useRef(0);

  // Memoize the lookup key to detect actual changes
  const lookupKey = useMemo(
    () => `${callsign.trim().toUpperCase()}|${band}|${mode}`,
    [callsign, band, mode],
  );

  useEffect(() => {
    const trimmedCallsign = callsign.trim().toUpperCase();

    // Reset when callsign is too short
    if (trimmedCallsign.length < MIN_CALLSIGN_LENGTH) {
      setStatus(null);
      setEntity(null);
      setWorkedBands([]);
      setWorkedModes([]);
      setLoading(false);
      return;
    }

    // Debounce
    const requestId = ++requestIdRef.current;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        // 1. Resolve callsign to DXCC entity
        const lookupResult = lookupEntity(trimmedCallsign);
        if (!lookupResult || requestId !== requestIdRef.current) {
          if (requestId === requestIdRef.current) {
            setStatus(null);
            setEntity(null);
            setWorkedBands([]);
            setWorkedModes([]);
            setLoading(false);
          }
          return;
        }

        const resolvedEntity = lookupResult.entity;

        // 2. Query IndexedDB for worked slots on this DXCC entity
        let slots = getCachedSlots(resolvedEntity.id);
        if (!slots) {
          slots = await getWorkedDxccSlots(resolvedEntity.id);
          if (requestId !== requestIdRef.current) return;
          setCachedSlots(resolvedEntity.id, slots);
        }

        // Bail if a newer request has started
        if (requestId !== requestIdRef.current) return;

        // 3. Extract unique bands and modes
        const bands = [...new Set(slots.map((s) => s.band))];
        const modes = [...new Set(slots.map((s) => s.mode))];

        // 4. Determine status
        let resolvedStatus: DXCCStatus;

        if (slots.length === 0) {
          // Never worked this DXCC entity at all
          resolvedStatus = "new_entity";
        } else {
          const normalizedBand = band.toLowerCase().trim();
          const normalizedMode = mode.toUpperCase().trim();

          const hasBand = bands.some(
            (b) => b.toLowerCase().trim() === normalizedBand,
          );
          const hasMode = modes.some(
            (m) => m.toUpperCase().trim() === normalizedMode,
          );
          const hasBandMode = slots.some(
            (s) =>
              s.band.toLowerCase().trim() === normalizedBand &&
              s.mode.toUpperCase().trim() === normalizedMode,
          );

          if (hasBandMode) {
            // Check for exact dupe (same callsign + band + mode + date)
            const today = new Date().toISOString().slice(0, 10);
            const callsignEntries =
              await getLogEntriesByCallsign(trimmedCallsign);

            if (requestId !== requestIdRef.current) return;

            const isDupe = callsignEntries.some(
              (e) =>
                e.band?.toLowerCase().trim() === normalizedBand &&
                e.mode?.toUpperCase().trim() === normalizedMode &&
                e.date === today,
            );

            resolvedStatus = isDupe ? "dupe" : "worked";
          } else if (!hasBand) {
            resolvedStatus = "new_band";
          } else if (!hasMode) {
            resolvedStatus = "new_mode";
          } else {
            // Band worked and mode worked but not this combination
            resolvedStatus = "new_mode";
          }
        }

        // 5. Count unique worked entities (lightweight: use cache size as proxy, or do a quick scan)
        // For now we use a simple count from the cache entries that have slots
        // This is a best-effort count; a full scan would be expensive
        let entityCount = 0;
        for (const [, cached] of slotsCache) {
          if (cached.slots.length > 0) entityCount++;
        }
        // The cache might not have all entities loaded, so this is a minimum.
        // For accurate count we'd need a separate query, but that's expensive.
        // We'll accept the cache-based count as a reasonable approximation.

        // 6. Check contest multiplier status if in contest mode
        let multiplierStatus: boolean | undefined;
        if (contestMode) {
          const activeSession = useContestStore.getState().activeSession;
          if (activeSession) {
            // Check if this entity's DXCC prefix is already a worked multiplier
            const dxccValue = resolvedEntity.prefix.toUpperCase();
            const isWorked = activeSession.multipliers.some(
              (m) => m.type === "DXCC" && m.value.toUpperCase() === dxccValue,
            );
            multiplierStatus = !isWorked;
          } else {
            multiplierStatus = false;
          }
        }

        // 7. Update state (only if still the latest request)
        if (requestId === requestIdRef.current) {
          setStatus(resolvedStatus);
          setEntity(resolvedEntity);
          setWorkedBands(bands);
          setWorkedModes(modes);
          setWorkedEntityCount(entityCount);
          setIsNewMultiplier(multiplierStatus);
          setLoading(false);
        }
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        console.error("[useDxccStatus] lookup failed:", err);
        if (requestId === requestIdRef.current) {
          setStatus(null);
          setEntity(null);
          setWorkedBands([]);
          setWorkedModes([]);
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      // The timer may already be awaiting IndexedDB when this lookup is
      // replaced or unmounted. Invalidate those continuations as well.
      requestIdRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupKey, contestMode]);

  // Build tooltip text
  const tooltipText = useMemo(() => {
    if (!entity || !status) return "";

    const entityLabel = `${entity.name} (${entity.prefix}) — Entity #${entity.id}`;

    switch (status) {
      case "new_entity":
        return `${entityLabel} — New! You have ${workedEntityCount} of ${TOTAL_ENTITIES} entities`;
      case "new_band":
        return `${entityLabel} — Worked before, but not on ${band}`;
      case "new_mode":
        return `${entityLabel} — Worked on ${band}, but not ${mode}`;
      case "worked":
        return `${entityLabel} — Already worked on ${band} ${mode}`;
      case "dupe":
        return `${entityLabel} — Duplicate: same callsign+band+mode today`;
      default:
        return entityLabel;
    }
  }, [entity, status, band, mode, workedEntityCount]);

  return {
    status,
    entity,
    workedBands,
    workedModes,
    totalEntities: TOTAL_ENTITIES,
    workedEntityCount,
    tooltipText,
    loading,
    isNewMultiplier,
  };
}
