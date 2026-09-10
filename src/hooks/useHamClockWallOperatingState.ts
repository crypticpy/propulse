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
import type { OperatingTarget } from "@/lib/workspace/operatingChannel";
import type { CanvasType } from "@/lib/workspace/types";
import { useMapStore, type TargetLocation } from "@/stores/mapStore";
import { useOperatingStateStore } from "@/stores/operatingStateStore";

/** Fixed: the wall is one screen, not a set of interchangeable workspaces. */
export const HAMCLOCK_WALL_WORKSPACE_ID = "hamclock-wall";

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
    return { lat: target.lat, lon: target.lon, name: target.callsign, grid: target.grid ?? undefined };
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
    // The comparison is lexicographic on `(stamp, sequence)`, because a
    // millisecond is not fine enough: a local `setTarget` and a cursor
    // arriving over the transport can be processed in the same event-loop
    // turn, and on equal timestamps a strict `>` would silently keep the
    // older map target (round 4). Every local write to either side also
    // takes a `nextLocalWriteSeq()`, so a tie on the clock is broken by
    // which one actually happened second. Applying the cursor goes through
    // `setTarget`, which takes the next sequence, so the map outranks the
    // cursor it was just built from and a second mount stays a no-op.
    const operating = useOperatingStateStore.getState();
    const initial = operating.cursor.target;
    const resolved = toMapTarget(initial);
    // `resolved == null` is a callsign-only cursor with no location yet, and
    // an empty cursor is "nothing shared yet" — neither means "clear the
    // map", and `setTarget(null)` would also reset `isolateTargetPath`.
    const map = useMapStore.getState();
    const stamp = operating.stamps.target;
    const cursorIsNewer =
      stamp.appliedAt === map.targetSetAt
        ? stamp.appliedSeq > map.targetSeq
        : stamp.appliedAt > map.targetSetAt;
    if (resolved && cursorIsNewer) {
      map.setTarget(resolved);
    }

    return useOperatingStateStore.subscribe((state, previous) => {
      if (state.cursor.target === previous.cursor.target) return;
      useMapStore.getState().setTarget(toMapTarget(state.cursor.target));
    });
  }, []);
}
