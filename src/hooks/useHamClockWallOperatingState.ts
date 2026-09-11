/**
 * Registers the HamClock wall with the shared operating roster (#658) and
 * mirrors the inbound cursor's target onto `mapStore.target` (issue #712).
 *
 * Deliberately not `useOperatingScreen()`: that hook derives its canvas type
 * from the workspace system (`useEffectiveCanvasType()`), which the wall has
 * no part of — `HamClockView` is not rendered inside `WorkspacePage` and
 * never will be (the HamClock wall *is* the wall canvas, epic #652). This is
 * the wall-shaped equivalent: a fixed `canvasType: "wall"` registration, with
 * `canCommand` still coming out of the same formula `useOperatingScreen` uses
 * (`canvasType !== "wall"`) rather than a second hardcoded `false` that could
 * drift from it.
 *
 * The wall never sends a command and never writes the shared cursor — no
 * `selectSpot`/`setBand`/`setTarget` call on `operatingStateStore` lives
 * here, only reads. `flipPage`/`tune` are not handled here either: both
 * require `capabilities.canCommand`, which this registration always reports
 * `false`, so no phone or workstation can ever address one to this screen.
 *
 * `mapStore.target` is written from `cursor.target` on later cursor changes,
 * with no fallback merge of any kind — the reader/writer seam for a scoped
 * view runtime is `dxStore.selectedSpot` (#707), not this field, and this
 * hook must not anticipate that landing. On mount the two are reconciled by
 * stamp — `operatingStateStore.stamps.target.appliedAt`/`appliedSeq` against
 * `mapStore.targetSetAt`/`targetSeq`, all four this window's own — because
 * the wall remounts
 * (layout-mode toggle, navigate back to `/map`) while the app-level
 * `OperatingTransportHost` keeps
 * running: a stale phone cursor must not clobber a newer local `setTarget`,
 * and a cursor that advanced during the unmount must not be ignored merely
 * because the map still holds the previous target, which would leave the map
 * disagreeing with `HamClockWallCursorChip` indefinitely (#859).
 */

import { useEffect } from "react";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import { writtenAt } from "@/lib/writeStamp";
import type { OperatingTarget } from "@/lib/workspace/operatingChannel";
import type { CanvasType } from "@/lib/workspace/types";
import { useMapStore, type TargetLocation } from "@/stores/mapStore";
import {
  useOperatingStateStore,
  type FieldStamp,
} from "@/stores/operatingStateStore";

/** Fixed: the wall is one screen, not a set of interchangeable workspaces. */
export const HAMCLOCK_WALL_WORKSPACE_ID = "hamclock-wall";

/**
 * Does the shared operating cursor outrank this window's map target?
 *
 * Both numbers come from this window's own counter, minted at the moment it
 * applied each side — the cursor in `mergePatch`, the target in `setTarget`
 * or when a workspace snapshot was applied (#859 round 11). So the question
 * they answer is exactly the question the remount asks: of the two things
 * this window is holding, which did it take on second?
 *
 * That is the only ordering available. `Date.now()` is too coarse for two
 * events in one event-loop turn (round 4) and can step backwards (round 9),
 * and the sequence the *writer* minted — round 10 — is a counter on another
 * device, which says nothing about the order of events here: a phone that
 * has never heard from this window numbers from its own zero, and no amount
 * of observing the messages that do arrive makes an unseen writer's lower
 * number mean "earlier".
 *
 * A side with no number at all cannot be placed in this window's history, so
 * it loses to a side that can rather than being guessed at: that is the
 * round 9 rule (unknown loses to known). Only when *neither* side has one is
 * there anything left to guess, and then it is the two local timestamps —
 * `appliedAt`, when the cursor landed here, against `targetSetAt`, both this
 * window's clock, never the wire `at`, which is the originating device's
 * (round 3).
 */
function cursorBeatsMapTarget(
  stamp: Pick<FieldStamp, "at" | "appliedAt" | "appliedSeq">,
  map: Pick<
    ReturnType<typeof useMapStore.getState>,
    "targetSetAt" | "targetSeq"
  >,
): boolean {
  // `at === 0` is "no cursor has ever been written", which loses to anything.
  if (writtenAt(stamp.at) === undefined) return false;
  if (stamp.appliedSeq !== undefined && map.targetSeq !== undefined) {
    return stamp.appliedSeq > map.targetSeq;
  }
  if (stamp.appliedSeq !== undefined) return true;
  if (map.targetSeq !== undefined) return false;
  // `writtenAt` reads the `0` sentinel, an absent stamp and a non-finite one
  // as the one thing they all mean — never written — so a window that has
  // never picked a target cannot outrank a cursor (#859 round 16).
  const mapAt = writtenAt(map.targetSetAt);
  if (mapAt === undefined) return true;
  return stamp.appliedAt > mapAt;
}

/**
 * Exported so `HamClockView` can pass an `isWallCanvas` prop down to the map
 * views (and from there to `SpotCollectionPopover`/`ClusterDetailPopover`)
 * from this single literal, instead of a second hardcoded `true` that could
 * drift from the registration above (#846/#871 round 3: those popovers used
 * to read `useEffectiveCanvasType()`, which this hook's own doc comment
 * already explains the wall never participates in).
 */
export const HAMCLOCK_WALL_CANVAS_TYPE: CanvasType = "wall";

/**
 * Same formula as `useOperatingScreen` (epic #652 rule 5): a wall shows
 * information, it never acts. Computed from the canvas type constant above
 * rather than written as a literal `false`, so the two can never disagree.
 */
const HAMCLOCK_WALL_CAN_COMMAND = HAMCLOCK_WALL_CANVAS_TYPE !== "wall";

/**
 * Resolves a shared cursor target to a map location. `lat`/`lon` win when
 * present; otherwise a valid grid is converted. A target with neither (a
 * callsign-only pick from a screen with no location data yet) resolves to
 * `null` — the header chip still shows the callsign, but the map has nothing
 * to place a pin at.
 */
function toMapTarget(target: OperatingTarget | null): TargetLocation | null {
  if (!target) return null;
  if (target.lat != null && target.lon != null) {
    return {
      lat: target.lat,
      lon: target.lon,
      name: target.callsign,
      grid: target.grid ?? undefined,
    };
  }
  if (target.grid && isValidGrid(target.grid)) {
    const { lat, lon } = gridToLatLon(target.grid);
    return { lat, lon, name: target.callsign, grid: target.grid };
  }
  return null;
}

export function useHamClockWallOperatingState(): void {
  useEffect(
    () =>
      useOperatingStateStore.getState().registerWorkspace({
        workspaceId: HAMCLOCK_WALL_WORKSPACE_ID,
        canvasType: HAMCLOCK_WALL_CANVAS_TYPE,
        label: "HamClock Wall",
        capabilities: { canTune: false, canCommand: HAMCLOCK_WALL_CAN_COMMAND },
      }),
    [],
  );

  useEffect(() => {
    // Reconcile with a cursor that moved while this hook was unmounted (a
    // `hello` reply, or a phone that advanced the cursor through the
    // app-level `OperatingTransportHost` while the wall was off screen).
    // The newer of the two wins outright: a stale cursor never clobbers a
    // newer local `setTarget`, and a newer cursor is never ignored just
    // because the map happens to hold some older target (#859). A tie keeps
    // the map, which is also what an already-applied cursor produces
    // (`setTarget` stamps at apply time, so a second mount is a no-op).
    //
    // Compared against `appliedAt`, not the wire `at`: `at` is the
    // *originating* device's `Date.now()` (a phone, whose clock is its own),
    // while `targetSetAt` is this browser's, so comparing them would be wrong
    // by the inter-device skew in either direction — a phone running behind
    // would have its fresh cursor ignored, one running ahead could clobber a
    // newer local pick. `appliedAt` is stamped by this window when the cursor
    // lands here, so both sides of the comparison come off one clock. The
    // cross-window workspace-sync path that carries `targetSetAt` (round 2,
    // `useMapOperationalContext`) needs no such treatment: those windows are
    // on one machine and share its clock.
    //
    // The sequence decides, not the clock (round 9). `Date.now()` is not
    // monotonic — an NTP correction can step it backwards mid-session, and
    // then a target the operator picks *after* a cursor arrives carries the
    // smaller timestamp and loses to it. `nextLocalWriteSeq()` cannot go
    // backwards, and both sides take one on every local write: applying the
    // cursor goes through `setTarget`, so the map outranks the cursor it was
    // just built from and a second mount stays a no-op. The clock is only
    // consulted where there is no sequence to consult — a target relayed
    // from another window of this app, which keeps the stamp it came with
    // (see `useMapOperationalContext`) — and that is sound because those
    // windows share a machine.
    const operating = useOperatingStateStore.getState();
    const initial = operating.cursor.target;
    const resolved = toMapTarget(initial);
    const map = useMapStore.getState();
    const stamp = operating.stamps.target;
    // A cursor cleared on purpose — a phone changing band drops the target —
    // is a write like any other, and the store's ordering rule (see the
    // "A stamp is what orders writes" block in `operatingStateStore`) says a
    // value never decides whether it lands. Before round 13 the reconcile
    // only looked at `resolved`, so a stamped clear that happened while the
    // wall was unmounted was skipped and the wall kept the old target for
    // good, even though the live subscription below would have cleared it.
    // `stamp.at !== 0` is what separates it from the initial cursor, which
    // is null because nothing has ever been written, not because someone
    // cleared it.
    //
    // A *non-null* cursor that resolves to nothing is different: it is a
    // callsign-only pick from a screen with no location yet, not an
    // instruction to clear the map (and `setTarget(null)` would also reset
    // `isolateTargetPath`), so the map keeps what it has.
    const explicitClear = initial === null && writtenAt(stamp.at) !== undefined;
    if ((resolved || explicitClear) && cursorBeatsMapTarget(stamp, map)) {
      map.setTarget(resolved);
    }

    return useOperatingStateStore.subscribe((state, previous) => {
      if (state.cursor.target === previous.cursor.target) return;
      useMapStore.getState().setTarget(toMapTarget(state.cursor.target));
    });
  }, []);
}
