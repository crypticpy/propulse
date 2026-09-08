import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * How many uniform rows fit in a list box without clipping one mid-row.
 * The wall never scrolls inside a report, so a ranked table or an alert
 * list renders only the rows its flex slot can hold and says so in its
 * caption. Measures the box and rendered rows through a `ResizeObserver`;
 * in jsdom (no layout) every row stays visible.
 *
 * Returns a callback ref so a list that mounts later — inside a tab panel
 * that was not the active one at first render — is measured when it
 * appears, not missed because a ref object was still null.
 */
export function useVisibleRows<T extends HTMLElement>(
  total: number,
  minimum = 1,
): [ref: (el: T | null) => void, visible: number] {
  const [el, setEl] = useState<T | null>(null);
  const [count, setCount] = useState(total);
  const lastRowHeight = useRef(0);
  const ref = useCallback((node: T | null) => setEl(node), []);

  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const measuredRow = Math.max(0, ...Array.from(el.children).map((child) =>
        (child as HTMLElement).getBoundingClientRect().height));
      if (measuredRow > 0) lastRowHeight.current = measuredRow;
      const row = measuredRow || lastRowHeight.current;
      const slot = el.clientHeight;
      if (total === 0) {
        setCount(0);
        return;
      }
      if (!row) {
        // No measurement exists yet (including a 0 -> positive total change),
        // so render probe rows and measure them on the next layout pass.
        setCount(total);
        return;
      }
      if (!slot) {
        // A hidden/unmounted tab has no meaningful capacity. Keep the last
        // count until its observer reports a real slot.
        return;
      }
      const gap = parseFloat(getComputedStyle(el).rowGap) || 0;
      const fit = Math.floor((slot + gap) / (row + gap));
      setCount(Math.max(minimum, Math.min(total, fit)));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // Fonts and wrapped controls can change row heights without resizing
    // the slot. Reconnect after each render to include replaced row nodes.
    for (const child of el.children) observer.observe(child);
    return () => observer.disconnect();
  });

  return [ref, Math.min(count, total)];
}
