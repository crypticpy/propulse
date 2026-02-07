/**
 * useAutoPanToSpots Hook
 *
 * When enabled, detects genuinely new spots arriving via the DX store
 * and pans the map to the most recent new spot. Implements an 8-second
 * cooldown between pans to avoid disorienting rapid movements.
 *
 * Works with both FlatMapView and GlobeView via mapStore.setCenterLocation.
 */

import { useEffect, useRef } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useDXStore } from "@/stores/dxStore";

/** Minimum milliseconds between auto-pans */
const PAN_COOLDOWN_MS = 8_000;

/**
 * Auto-pan the map to newly arriving spots when enabled.
 *
 * - Reads `autoPanToSpots` from mapStore
 * - Subscribes to spot changes in dxStore
 * - Tracks seen spot IDs to detect genuinely new arrivals
 * - Only pans to the most recent new spot per update cycle
 * - Enforces an 8-second cooldown between pans
 */
export function useAutoPanToSpots(): void {
  const autoPanEnabled = useMapStore((s) => s.autoPanToSpots);
  const spots = useDXStore((s) => s.spots);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const lastPanTimeRef = useRef<number>(0);
  const initializedRef = useRef(false);

  useEffect(() => {
    // Early-out if feature is disabled
    if (!autoPanEnabled) {
      return;
    }

    // On first run (or re-enable), seed the seen set with current spots
    // so we don't pan to existing spots on toggle-on.
    if (!initializedRef.current) {
      const seedSet = new Set<string>();
      for (const spot of spots) {
        seedSet.add(spot.id);
      }
      seenIdsRef.current = seedSet;
      initializedRef.current = true;
      return;
    }

    // Find genuinely new spots (IDs not in seenIds)
    const newSpots = spots.filter((s) => !seenIdsRef.current.has(s.id));

    // Update seen set with all current spot IDs
    const updatedSet = new Set<string>();
    for (const spot of spots) {
      updatedSet.add(spot.id);
    }
    seenIdsRef.current = updatedSet;

    if (newSpots.length === 0) {
      return;
    }

    // Check cooldown
    const now = Date.now();
    if (now - lastPanTimeRef.current < PAN_COOLDOWN_MS) {
      return;
    }

    // Pick the most recent new spot (spots are sorted newest-first by dxStore)
    const mostRecent = newSpots[0];

    // Need lat/lon to pan — try dxLat/dxLon first
    const lat = mostRecent.dxLat;
    const lon = mostRecent.dxLon;

    if (lat == null || lon == null) {
      return;
    }

    // Pan the map
    useMapStore.getState().setCenterLocation(lat, lon);
    lastPanTimeRef.current = now;
  }, [autoPanEnabled, spots]);

  // Reset initialization when feature is toggled off so re-enabling
  // seeds the seen set fresh.
  useEffect(() => {
    if (!autoPanEnabled) {
      initializedRef.current = false;
    }
  }, [autoPanEnabled]);
}
