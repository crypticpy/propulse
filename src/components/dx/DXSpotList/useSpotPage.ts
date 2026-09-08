import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { spotPageWindow } from "./pageWindow";

/** Keep report identity stable while live spots are inserted before a page. */
export function useSpotPage(spots: readonly { id: string }[], size: number, selectedId: string | undefined, enabled: boolean) {
  const ids = useMemo(() => spots.map(spot => spot.id), [spots]);
  const [focusedId, setFocusedId] = useState<string | null>(enabled ? selectedId ?? null : null);
  const [anchor, setAnchor] = useState<{ id: string | null; offset: number }>({ id: null, offset: 0 });
  const handledSelection = useRef<string>();
  const focusedIndex = focusedId === null ? -1 : ids.indexOf(focusedId);
  const anchorIndex = anchor.id === null ? -1 : ids.indexOf(anchor.id);
  const offset = anchorIndex < 0 ? anchor.offset : anchorIndex;
  const page = enabled ? spotPageWindow(ids.length, size, offset, focusedIndex) : { start: 0, end: ids.length };

  useEffect(() => {
    if (!selectedId) { handledSelection.current = undefined; return; }
    if (!enabled || handledSelection.current === selectedId || !ids.includes(selectedId)) return;
    handledSelection.current = selectedId;
    setFocusedId(selectedId);
  }, [enabled, selectedId, ids]);

  useEffect(() => {
    if (!enabled) return;
    // Page zero stays live unless keyboard/selection focus requires moving it.
    const id = page.start === 0 ? null : ids[page.start] ?? null;
    if (anchor.id !== id || anchor.offset !== page.start) setAnchor({ id, offset: page.start });
  }, [enabled, ids, page.start, anchor.id, anchor.offset]);

  const setFocusedIndex = useCallback((next: SetStateAction<number>) => {
    setFocusedId(previous => {
      const index = previous === null ? -1 : ids.indexOf(previous);
      return ids[typeof next === "function" ? next(index) : next] ?? null;
    });
  }, [ids]);
  const changePage = useCallback((next: number) => {
    setFocusedId(null);
    setAnchor({ id: next === 0 ? null : ids[next] ?? null, offset: next });
  }, [ids]);
  return { ...page, focusedIndex, setFocusedIndex, changePage };
}
