import { useCallback, useMemo, useState } from "react";
import {
  HOME_LAYOUT_KEY,
  HOME_PINS_KEY,
  addHomeItem,
  moveHomeItem,
  moveHomeItemTo,
  readHomeLayout,
  removeHomeItem,
  resetHomeLayout,
  type HomeLayoutState,
} from "@/lib/home/layout";

export interface HomeLayoutController {
  /** The ordered visible item ids for this device. */
  items: string[];
  add: (id: string) => void;
  remove: (id: string) => void;
  move: (id: string, delta: number) => void;
  moveTo: (id: string, index: number) => void;
  reset: () => void;
}

function load(guest: boolean): HomeLayoutState {
  if (guest) return readHomeLayout(null, null);
  try {
    return readHomeLayout(localStorage.getItem(HOME_LAYOUT_KEY), localStorage.getItem(HOME_PINS_KEY));
  } catch {
    /* Private-mode storage keeps the default layout for this visit. */
    return readHomeLayout(null, null);
  }
}

/**
 * Owns the ordered Home layout for the active device. Guest sessions stay in
 * memory; signed-in choices persist immediately so the dashboard behind the
 * Customize dialog updates live.
 */
export function useHomeLayout(isMobile: boolean, guest = false): HomeLayoutController {
  const [layout, setLayout] = useState<HomeLayoutState>(() => load(guest));
  const device = isMobile ? "mobile" : "desktop";

  const update = useCallback(
    (change: (list: string[]) => string[]) =>
      setLayout((previous) => {
        const next = { ...previous, [device]: change(previous[device]) };
        try {
          if (!guest) localStorage.setItem(HOME_LAYOUT_KEY, JSON.stringify(next));
        } catch {
          /* Memory-only preferences remain usable for this visit. */
        }
        return next;
      }),
    [device, guest],
  );

  return useMemo(
    () => ({
      items: layout[device],
      add: (id: string) => update((list) => addHomeItem(list, id)),
      remove: (id: string) => update((list) => removeHomeItem(list, id)),
      move: (id: string, delta: number) => update((list) => moveHomeItem(list, id, delta)),
      moveTo: (id: string, index: number) => update((list) => moveHomeItemTo(list, id, index)),
      reset: () => update(resetHomeLayout),
    }),
    [device, layout, update],
  );
}
