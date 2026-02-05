/**
 * ContestGlobalHotkeys
 *
 * Global contest-specific hotkeys that should work across routes (/contest <-> /map).
 */

import { useEffect } from "react";
import { useContestStore } from "@/stores/contestStore";
import { useContestUIEphemeralStore } from "@/stores/contestUIEphemeralStore";

export function ContestGlobalHotkeys() {
  const hasActiveSession = useContestStore((s) => Boolean(s.activeSession));
  const requestEntryFocus = useContestUIEphemeralStore(
    (s) => s.requestEntryFocus,
  );

  useEffect(() => {
    if (!hasActiveSession) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // Alt+E: focus entry
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.key.toLowerCase() === "e"
      ) {
        event.preventDefault();
        requestEntryFocus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasActiveSession, requestEntryFocus]);

  return null;
}
