/**
 * Auto-lookup callsign when it changes (debounced 500ms).
 * Minimum 3 characters before triggering lookup.
 *
 * Also performs a best-effort POTA/SOTA spot cross-reference
 * to check if the contacted station is currently active on
 * a park or summit.
 */

import { useEffect, useRef, useState } from "react";
import { useQSOStore } from "@/stores/qsoStore";

// ── POTA/SOTA Enrichment Types ──────────────────────────────────────────────

export interface ActivationSpotInfo {
  /** POTA park info if the callsign is spotted activating */
  activePota?: { ref: string; park: string };
  /** SOTA summit info if the callsign is spotted activating */
  activeSota?: { ref: string; summit: string };
}

/** POTA spot record shape from the API proxy */
interface POTASpotRecord {
  reference?: string;
  parkName?: string;
  name?: string;
}

/**
 * Best-effort check whether a callsign is currently active on POTA.
 * Non-blocking: returns null on any failure rather than throwing.
 */
async function fetchPotaSpot(
  callsign: string,
): Promise<{ ref: string; park: string } | null> {
  try {
    const resp = await fetch(
      `/api/activation/pota?activator=${encodeURIComponent(callsign)}`,
    );
    if (!resp.ok) return null;

    const data = (await resp.json()) as { spots?: POTASpotRecord[] };
    const spots = data.spots;
    if (!Array.isArray(spots) || spots.length === 0) return null;

    const spot = spots[0];
    return {
      ref: spot.reference ?? "",
      park: spot.parkName ?? spot.name ?? "",
    };
  } catch {
    return null;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCallsignLookup() {
  const callsign = useQSOStore((s) => s.form.callsign);
  const preserveActivationGrid = useQSOStore(
    (s) => Boolean(s.form.grid && s.form.sig && s.form.sigInfo),
  );
  const lookupCallsign = useQSOStore((s) => s.lookupCallsign);
  const clearLookup = useQSOStore((s) => s.clearLookup);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // POTA/SOTA enrichment state
  const [activationSpot, setActivationSpot] = useState<ActivationSpotInfo>({});
  const enrichRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (enrichRef.current) clearTimeout(enrichRef.current);

    const trimmed = callsign.trim().toUpperCase();
    if (trimmed.length < 3) {
      clearLookup();
      setActivationSpot({});
      return;
    }

    // Main callsign lookup (500ms debounce)
    timerRef.current = setTimeout(() => {
      lookupCallsign(trimmed, { preserveGrid: preserveActivationGrid });
    }, 500);

    // Best-effort POTA/SOTA enrichment (600ms debounce, slightly after main lookup)
    enrichRef.current = setTimeout(() => {
      fetchPotaSpot(trimmed).then((pota) => {
        if (pota && pota.ref) {
          setActivationSpot({ activePota: pota });
        } else {
          setActivationSpot({});
        }
      });
    }, 600);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (enrichRef.current) clearTimeout(enrichRef.current);
    };
  }, [callsign, lookupCallsign, clearLookup, preserveActivationGrid]);

  return { activationSpot };
}
