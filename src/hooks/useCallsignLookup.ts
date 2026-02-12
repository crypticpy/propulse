/**
 * Auto-lookup callsign when it changes (debounced 500ms).
 * Minimum 3 characters before triggering lookup.
 */

import { useEffect, useRef } from "react";
import { useQSOStore } from "@/stores/qsoStore";

export function useCallsignLookup() {
  const callsign = useQSOStore((s) => s.form.callsign);
  const lookupCallsign = useQSOStore((s) => s.lookupCallsign);
  const clearLookup = useQSOStore((s) => s.clearLookup);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = callsign.trim().toUpperCase();
    if (trimmed.length < 3) {
      clearLookup();
      return;
    }

    timerRef.current = setTimeout(() => {
      lookupCallsign(trimmed);
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [callsign, lookupCallsign, clearLookup]);
}
