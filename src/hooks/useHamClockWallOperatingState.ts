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
 * stamp — `operatingStateStore.stamps.target.at` against `mapStore
 * .targetSetAt` — because the wall remounts (layout-mode toggle, navigate
 * back to `/map`) while the app-level `OperatingTransportHost` keeps
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
    // Both sides carry a millisecond stamp in the same clock domain, so the
    // newer of the two wins outright: a stale cursor never clobbers a newer
    // local `setTarget`, and a newer cursor is never ignored just because
    // the map happens to hold some older target (#859). A tie keeps the map,
    // which is also what an already-applied cursor produces (`setTarget`
    // stamps at apply time, so a second mount is a no-op).
    const operating = useOperatingStateStore.getState();
    const initial = operating.cursor.target;
    const resolved = toMapTarget(initial);
    // `resolved == null` is a callsign-only cursor with no location yet, and
    // an empty cursor is "nothing shared yet" — neither means "clear the
    // map", and `setTarget(null)` would also reset `isolateTargetPath`.
    if (resolved && operating.stamps.target.at > useMapStore.getState().targetSetAt) {
      useMapStore.getState().setTarget(resolved);
    }

    return useOperatingStateStore.subscribe((state, previous) => {
      if (state.cursor.target === previous.cursor.target) return;
      useMapStore.getState().setTarget(toMapTarget(state.cursor.target));
    });
  }, []);
}
