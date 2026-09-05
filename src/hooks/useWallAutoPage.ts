import { useEffect } from "react";
import {
  useHamClockDisplayStore,
  wallPages,
} from "@/stores/hamclockDisplayStore";
import { activeKioskHamClockPin, useKioskStore } from "@/stores/kioskStore";

/** How long the wall waits after the last interaction before it starts
 * rotating pages again (wall spec §5). */
const RESUME_QUIET_MS = 60_000;

/** Any interaction on the rails or the wall header pauses rotation (wall
 * spec §5). Scoped by DOM location via `closest`, not by which component
 * owns the listener, so this hook needs no ref plumbing through
 * `HamClockRail`/`HamClockWallHeader`. */
const INTERACTION_SELECTOR = ".hc-rail, .hc-hdr";
const INTERACTION_EVENTS = [
  "pointerdown",
  "keydown",
  "touchstart",
  "wheel",
] as const;

/**
 * Runs the wall's auto-page rotation (wall spec §5, HW-20): while
 * `autoPage.enabled` is on, both rails advance to the next page every
 * `autoPage.dwellSeconds`. Any pointer, key or touch interaction on the
 * rails or header pauses rotation; it resumes on its own after a minute of
 * quiet. A kiosk scene that pins a HamClock page suspends rotation entirely
 * while it is active, since the pin is the operator's own page choice for
 * that scene.
 *
 * Mount once, at the top of `HamClockWall` — the component that only
 * renders at wall density, so desk never runs this timer regardless of the
 * stored `autoPage.enabled` value.
 */
export function useWallAutoPage(): void {
  const enabled = useHamClockDisplayStore((s) => s.autoPage.enabled);
  const dwellSeconds = useHamClockDisplayStore((s) => s.autoPage.dwellSeconds);
  const railLayout = useHamClockDisplayStore((s) => s.railLayout);
  const stepPage = useHamClockDisplayStore((s) => s.stepPage);
  // Only a scene that actually pins a page suspends rotation; a HamClock
  // scene with no page pin leaves the wall free to rotate.
  const kioskPinned = useKioskStore((s) => {
    const pin = activeKioskHamClockPin(s);
    return Boolean(pin?.leftPage || pin?.rightPage);
  });

  const pageCount = wallPages(railLayout).length;
  const running = enabled && !kioskPinned;

  useEffect(() => {
    if (!running) return;

    let dwellTimer: ReturnType<typeof setTimeout> | null = null;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;

    function clearDwell() {
      if (dwellTimer !== null) {
        clearTimeout(dwellTimer);
        dwellTimer = null;
      }
    }

    function clearResume() {
      if (resumeTimer !== null) {
        clearTimeout(resumeTimer);
        resumeTimer = null;
      }
    }

    function scheduleDwell() {
      clearDwell();
      dwellTimer = setTimeout(
        () => {
          stepPage("left", 1, pageCount);
          scheduleDwell();
        },
        Math.max(1, dwellSeconds) * 1000,
      );
    }

    function handleInteraction(event: Event) {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(INTERACTION_SELECTOR)) {
        return;
      }
      clearResume();
      clearDwell();
      resumeTimer = setTimeout(scheduleDwell, RESUME_QUIET_MS);
    }

    scheduleDwell();
    for (const type of INTERACTION_EVENTS) {
      document.addEventListener(type, handleInteraction, {
        passive: true,
        capture: true,
      });
    }

    return () => {
      clearDwell();
      clearResume();
      for (const type of INTERACTION_EVENTS) {
        document.removeEventListener(type, handleInteraction, true);
      }
    };
  }, [running, dwellSeconds, pageCount, stepPage]);
}
