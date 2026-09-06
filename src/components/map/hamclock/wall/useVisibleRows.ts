import { useCallback, useLayoutEffect, useState } from "react";

/**
 * How many uniform rows fit in a list box without clipping one mid-row.
 * The wall never scrolls inside a report, so a ranked table or an alert
 * list renders only the rows its flex slot can hold and says so in its
 * caption. Measures the box and its first row through a `ResizeObserver`;
 * in jsdom (no layout) every row stays visible.
 *
 * Returns a callback ref so a list that mounts later — inside a tab panel
 * that was not the active one at first render — is measured when it
 * appears, not missed because a ref object was still null.
 */
export function useVisibleRows<T extends HTMLElement>(
  total: number,
): [ref: (el: T | null) => void, visible: number] {
  const [el, setEl] = useState<T | null>(null);
  const [count, setCount] = useState(total);
  const ref = useCallback((node: T | null) => setEl(node), []);

  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      // Divider borders can make later rows taller than the first one.
      const row = Math.max(0, ...Array.from(el.children).map((child) =>
        (child as HTMLElement).getBoundingClientRect().height));
      const slot = el.clientHeight;
      if (!row || !slot) {
        setCount(total);
        return;
      }
      const gap = parseFloat(getComputedStyle(el).rowGap) || 0;
      const fit = Math.floor((slot + gap) / (row + gap));
      setCount(Math.max(1, Math.min(total, fit)));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, total, count]);

  return [ref, Math.min(count, total)];
}
