/**
 * useContestOverlayEngine
 *
 * Computes and applies contest-aware map overlay layers across all renderers.
 * Currently focuses on lightweight marker overlays for "high value" spots
 * (e.g., NEW DXCC multipliers) so operators can stay in the map context.
 */

import { useEffect, useMemo } from "react";
import { useDXCluster } from "@/hooks/useDXCluster";
import { useContestStore } from "@/stores/contestStore";
import { useContestUIStore } from "@/stores/contestUIStore";
import { useMapStore } from "@/stores/mapStore";
import { getContestById } from "@/lib/data/contests";
import { getNeededMultipliers } from "@/lib/contest/strategy";
import type { OverlayMarker } from "@/types/mapOverlays";

const LAYER_ID = "contest-needed-mults";
const MAX_MARKERS = 180;

function extractDxccPrefix(callsign: string): string | null {
  const match = callsign.match(/^([A-Z]{1,3}[0-9]{0,2})/i);
  return match ? match[1].toUpperCase() : null;
}

export function useContestOverlayEngine({ enabled }: { enabled: boolean }) {
  const activeSession = useContestStore((s) => s.activeSession);
  const isDupeCheck = useContestStore((s) => s.isDupe);

  const sessionId = activeSession?.id ?? null;
  const currentBand = useContestUIStore((s) =>
    sessionId ? s.bandBySessionId[sessionId] ?? "20m" : "20m",
  );
  const currentMode = useContestUIStore((s) =>
    sessionId ? s.modeBySessionId[sessionId] ?? "CW" : "CW",
  );

  const { allSpots } = useDXCluster();
  const updateOverlayLayer = useMapStore((s) => s.updateOverlayLayer);
  const removeOverlayLayer = useMapStore((s) => s.removeOverlayLayer);

  const markers = useMemo((): OverlayMarker[] => {
    if (!enabled || !activeSession) {
      return [];
    }

    const contest = getContestById(activeSession.contestId);
    if (!contest) {
      return [];
    }

    const needed = getNeededMultipliers(activeSession, contest);
    const neededDxcc = new Set(
      needed.filter((m) => m.type === "DXCC").map((m) => m.value.toUpperCase()),
    );

    // Build a quick "worked DXCC" set so we can distinguish NEW vs NEEDED.
    const workedDxcc = new Set(
      activeSession.multipliers
        .filter((m) => m.type === "DXCC")
        .map((m) => m.value.toUpperCase()),
    );

    const candidates = allSpots
      .filter(
        (spot) =>
          typeof spot.dxLat === "number" &&
          typeof spot.dxLon === "number" &&
          spot.dx &&
          spot.dx.length >= 2,
      )
      .slice()
      .sort((a, b) => b.time.getTime() - a.time.getTime());

    const markers: OverlayMarker[] = [];

    for (const spot of candidates) {
      if (markers.length >= MAX_MARKERS) {
        break;
      }

      const callsign = spot.dx.toUpperCase();
      const isDupe = isDupeCheck(callsign, currentBand, currentMode);
      if (isDupe) {
        continue;
      }

      const prefix = extractDxccPrefix(callsign);
      if (!prefix || !neededDxcc.has(prefix)) {
        continue;
      }

      const isNew = !workedDxcc.has(prefix);

      markers.push({
        id: `dxcc-${prefix}-${spot.id}`,
        lat: spot.dxLat as number,
        lon: spot.dxLon as number,
        color: isNew ? "#ff6b35" : "#22d3ee",
        opacity: isNew ? 0.95 : 0.7,
        size: isNew ? 7 : 5,
        label: prefix,
      });
    }

    return markers;
  }, [activeSession, allSpots, currentBand, currentMode, enabled, isDupeCheck]);

  useEffect(() => {
    if (!enabled || !activeSession) {
      removeOverlayLayer(LAYER_ID);
      return;
    }

    updateOverlayLayer(LAYER_ID, { type: "markers", markers });
  }, [activeSession, enabled, markers, removeOverlayLayer, updateOverlayLayer]);
}

export default useContestOverlayEngine;

