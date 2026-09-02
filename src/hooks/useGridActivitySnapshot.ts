import { useEffect, useMemo, useState } from "react";
import type { ResolvedSpot } from "@/components/map/LiveSpotArcs";
import {
  buildGridActivitySnapshot,
  type GridActivityEndpoint,
  type GridActivityResolution,
  type GridActivitySnapshot,
} from "@/lib/map/gridActivityModel";

const EMPTY_SPOTS: readonly ResolvedSpot[] = Object.freeze([]);

/**
 * React boundary for the pure grid-activity model. Feed changes rebuild the
 * snapshot immediately; when a feed goes quiet, one timer wakes exactly when
 * the oldest retained report expires. Persistent cells therefore need no
 * polling interval and no animation-frame-driven React state.
 */
export function useGridActivitySnapshot(
  spots: readonly ResolvedSpot[],
  resolution: GridActivityResolution,
  endpoint: GridActivityEndpoint = "dx",
  enabled = true,
): GridActivitySnapshot {
  const [expiryTick, setExpiryTick] = useState(0);
  const snapshot = useMemo(
    () => {
      // The value itself is irrelevant; its increment is the quiet-feed wakeup
      // signal that asks the pure model to evaluate a fresh wall-clock cutoff.
      void expiryTick;
      return buildGridActivitySnapshot(enabled ? spots : EMPTY_SPOTS, {
        resolution,
        endpoint,
        now: Date.now(),
      });
    },
    [enabled, endpoint, expiryTick, resolution, spots],
  );

  useEffect(() => {
    if (snapshot.nextExpiryTimestamp === null) return;
    const delay = Math.max(1, snapshot.nextExpiryTimestamp - Date.now() + 25);
    const timer = window.setTimeout(
      () => setExpiryTick((tick) => tick + 1),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [snapshot.nextExpiryTimestamp]);

  return snapshot;
}
