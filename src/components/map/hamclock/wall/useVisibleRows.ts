import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * How many uniform rows fit in a list box without clipping one mid-row.
 * The wall never scrolls inside a report, so a ranked table or an alert
 * list renders only the rows its flex slot can hold and says so in its
 * caption. Measures the box and its first row through a `ResizeObserver`;
 * in jsdom (no layout) every row stays visible.
 */
export function useVisibleRows<T extends HTMLElement>(
  ref: RefObject<T | null>,
  total: number,
): number {
  const [count, setCount] = useState(total);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const first = el.firstElementChild as HTMLElement | null;
      const row = first?.getBoundingClientRect().height ?? 0;
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
  }, [ref, total]);

  return Math.min(count, total);
}
