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
import { extractMultiplierValue } from "@/lib/contest";
import { getNeededMultipliers } from "@/lib/contest/strategy";
import type { OverlayMarker } from "@/types/mapOverlays";
import { useMapOperationalContext } from "@/hooks/useMapOperationalContext";
import { policyAllows } from "@/lib/map/operationalScope";

const LAYER_ID = "contest-needed-mults";
const MAX_MARKERS = 180;

function resolveDxccPrefix(
  callsign: string,
  neededPrefixesByLength: string[],
): string | null {
  const upper = callsign.toUpperCase().trim();
  const parts = upper.split("/").map((p) => p.trim()).filter(Boolean);

  // Fast path: match directly against the contest's needed DXCC prefix set.
  // Longest-first avoids collapsing EA8 -> EA, KP4 -> K, etc.
  for (const prefix of neededPrefixesByLength) {
    for (const part of parts) {
      if (part.startsWith(prefix)) {
        return prefix;
      }
    }
  }

  // Fallback: use the same DXCC resolver as multiplier extraction/scoring.
  const resolved = extractMultiplierValue(upper, "DXCC", "callsign");
  return resolved ? resolved.toUpperCase() : null;
}

export function useContestOverlayEngine({ enabled }: { enabled: boolean }) {
  const { policy } = useMapOperationalContext();
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
  const publicMultiplierAssistance = policyAllows(
    policy,
    "neededMultipliers",
    "public",
  );

  const markers = useMemo((): OverlayMarker[] => {
    if (!enabled || !activeSession || !publicMultiplierAssistance) {
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
    const neededDxccPrefixesByLength = [...neededDxcc].sort(
      (a, b) => b.length - a.length,
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

      const resolvedPrefix = resolveDxccPrefix(
        callsign,
        neededDxccPrefixesByLength,
      );

      if (!resolvedPrefix || !neededDxcc.has(resolvedPrefix)) {
        continue;
      }

      const isNew = !workedDxcc.has(resolvedPrefix);

      markers.push({
        id: `dxcc-${resolvedPrefix}-${spot.id}`,
        lat: spot.dxLat as number,
        lon: spot.dxLon as number,
        color: isNew ? "#ff6b35" : "#22d3ee",
        opacity: isNew ? 0.95 : 0.7,
        size: isNew ? 7 : 5,
        label: resolvedPrefix,
      });
    }

    return markers;
  }, [
    activeSession,
    allSpots,
    currentBand,
    currentMode,
    enabled,
    isDupeCheck,
    publicMultiplierAssistance,
  ]);

  useEffect(() => {
    if (!enabled || !activeSession || !publicMultiplierAssistance) {
      removeOverlayLayer(LAYER_ID);
      return;
    }

    updateOverlayLayer(LAYER_ID, { type: "markers", markers });
  }, [
    activeSession,
    enabled,
    markers,
    publicMultiplierAssistance,
    removeOverlayLayer,
    updateOverlayLayer,
  ]);
}

export default useContestOverlayEngine;
