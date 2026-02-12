/**
 * Auto-check for duplicate QSO when callsign, band, or mode changes.
 * Debounced 300ms. Clears when callsign is empty.
 */

import { useEffect, useRef } from "react";
import { useQSOStore } from "@/stores/qsoStore";

export function useDupeCheck() {
  const callsign = useQSOStore((s) => s.form.callsign);
  const band = useQSOStore((s) => s.form.band);
  const mode = useQSOStore((s) => s.form.mode);
  const checkDupe = useQSOStore((s) => s.checkDupe);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = callsign.trim().toUpperCase();
    if (trimmed.length < 2) return;

    timerRef.current = setTimeout(() => {
      checkDupe(trimmed);
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [callsign, band, mode, checkDupe]);
}
