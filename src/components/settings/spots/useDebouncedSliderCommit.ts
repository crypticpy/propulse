import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_DELAY_MS = 120;

/**
 * Debounces a slider's committed writes without dropping the final value.
 *
 * `SettingSlider` fires its `onChange` on every native `input` event (a
 * pointer-move tick, not just drag-end). For the Spots & Paths sliders each
 * commit runs `updateWorkingView` -> `viewConfigurationSchema` clone+parse
 * (twice) -> `persistNow` -> `workingStorage.write` (a third clone+parse
 * plus a synchronous `sessionStorage` write) -- three full-config zod
 * validations per pointer move across up to eight sliders in one panel.
 *
 * This returns a `displayValue` that updates on every tick (so dragging
 * still feels responsive) and a `commit` to pass as the slider's `onChange`.
 * The expensive write is debounced to the trailing edge (`delayMs` of no
 * further ticks), and flushed synchronously on unmount so a mid-drag tab
 * switch or panel close never drops the in-flight value.
 */
export function useDebouncedSliderCommit(
  value: number,
  onCommit: (value: number) => void,
  delayMs = DEFAULT_DELAY_MS,
): [number, (value: number) => void] {
  const [pending, setPending] = useState<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current !== null) {
      const next = pendingRef.current;
      pendingRef.current = null;
      setPending(null);
      onCommitRef.current(next);
    }
  }, []);

  // Flush on unmount (tab switch or dialog close both unmount the section)
  // so a value the user already released never gets silently dropped.
  useEffect(() => flush, [flush]);

  const commit = useCallback(
    (next: number) => {
      pendingRef.current = next;
      setPending(next);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const settled = pendingRef.current;
        pendingRef.current = null;
        setPending(null);
        if (settled !== null) onCommitRef.current(settled);
      }, delayMs);
    },
    [delayMs],
  );

  return [pending ?? value, commit];
}
