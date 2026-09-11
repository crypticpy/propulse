import { useEffect } from "react";
import { useMapOperationalStore } from "@/stores/mapOperationalStore";
import { WORKSPACE_CHANNEL } from "@/lib/map/workspaceChannel";

/**
 * Liveness of the `/map/ops` popout, as seen by the window that opened it
 * (#884 round 15).
 *
 * The opener used to answer "is a popout up?" by setting its own
 * `workspaceOpen`, which is the inline dock's flag. Nothing cleared it when the
 * popout closed — the child's collapse only clears its own copy, and since
 * round 12 `workspaceOpen` is per-window and publishes nothing — so an opener
 * with a nonempty draft stayed in automatic Log scope and went on suppressing
 * public activity after the popout was gone. Those are two different facts, so
 * this is the second one, tracked as itself.
 *
 * The handle is the source of truth; the child's `popout-closed` message and
 * the opener regaining focus are only the moments we re-read it:
 * - a *reload* posts `popout-closed` on pagehide but leaves `handle.closed`
 *   false, so liveness stays true across it and the scope does not flap;
 * - a real close usually has not flipped `handle.closed` yet when the message
 *   arrives, but focus returns to the opener immediately afterwards, and a tab
 *   killed by the browser (no message at all) is caught by the same check.
 *
 * `window.open` reuses a window with the same target name, so one opener has at
 * most one popout and a single handle is enough.
 */
let popoutHandle: Window | null = null;

/** Open the operating workspace popout and record it as live. */
export function openOperatingPopout(): Window | null {
  const opened = window.open(
    "/map/ops",
    "propulse-operating-workspace",
    "popup=yes,width=1100,height=760,resizable=yes,scrollbars=yes",
  );
  // A blocked popup must not change automatic scope or hide public activity.
  if (!opened) return null;
  popoutHandle = opened;
  useMapOperationalStore.getState().setWorkspacePopoutOpen(true);
  return opened;
}

/** Re-read the handle; clear liveness once the popout is really gone. */
export function refreshOperatingPopoutLiveness(): void {
  if (popoutHandle === null) return;
  if (!popoutHandle.closed) return;
  popoutHandle = null;
  useMapOperationalStore.getState().setWorkspacePopoutOpen(false);
}

/** Test seam: forget the handle between cases. */
export function resetOperatingPopoutLiveness(): void {
  popoutHandle = null;
}

/**
 * Called by the popout itself: tell the opener, over the workspace channel,
 * that this document is going away. `pagehide` also fires on a reload, which
 * is why the opener re-reads the handle rather than trusting the message.
 */
export function useOperatingPopoutPresence(): void {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(WORKSPACE_CHANNEL);
    const announceClosing = () => {
      channel.postMessage({ kind: "popout-closed" });
    };
    window.addEventListener("pagehide", announceClosing);
    return () => {
      window.removeEventListener("pagehide", announceClosing);
      announceClosing();
      channel.close();
    };
  }, []);
}
