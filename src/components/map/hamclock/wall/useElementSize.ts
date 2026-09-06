import { useLayoutEffect, useState, type RefObject } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Live content-box size of an element, in CSS pixels. Reads the laid-out
 * size once on mount and follows it through a `ResizeObserver`, so a chart
 * drawn in pixel coordinates can fill whatever slot the report's flex column
 * hands it at 1080p or 4K. jsdom has no `ResizeObserver` and lays nothing
 * out, so there the size stays `{0, 0}` and callers fall back to a nominal
 * drawing size.
 */
export function useElementSize<T extends HTMLElement>(
  ref: RefObject<T | null>,
): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const next = {
        width: Math.round(el.clientWidth),
        height: Math.round(el.clientHeight),
      };
      setSize((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next,
      );
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
