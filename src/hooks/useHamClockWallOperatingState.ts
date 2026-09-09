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
 * `mapStore.target` is written plainly from `cursor.target` on every change,
 * with no fallback merge of any kind — the reader/writer seam for a scoped
 * view runtime is `dxStore.selectedSpot` (#707), not this field, and this
 * hook must not anticipate that landing.
 */

import { useEffect } from "react";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import type { OperatingTarget } from "@/lib/workspace/operatingChannel";
import type { CanvasType } from "@/lib/workspace/types";
import { useMapStore, type TargetLocation } from "@/stores/mapStore";
import { useOperatingStateStore } from "@/stores/operatingStateStore";

/** Fixed: the wall is one screen, not a set of interchangeable workspaces. */
export const HAMCLOCK_WALL_WORKSPACE_ID = "hamclock-wall";

const HAMCLOCK_WALL_CANVAS_TYPE: CanvasType = "wall";

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
    // Pick up whatever the cursor already holds (a `hello` reply may have
    // arrived before this hook mounted), then track every later change.
    // Only when it actually holds something: an empty cursor means "nothing
    // shared yet", not "clear the map". Writing `null` here would wipe a
    // target the wall's own reports set (`BandTopDx`, `RecentContactsReport`,
    // `QuickTargets` all write `mapStore.target`) and, because `setTarget`
    // also resets `isolateTargetPath` on a null, silently drop that setting.
    const initial = useOperatingStateStore.getState().cursor.target;
    if (initial) useMapStore.getState().setTarget(toMapTarget(initial));

    return useOperatingStateStore.subscribe((state, previous) => {
      if (state.cursor.target === previous.cursor.target) return;
      useMapStore.getState().setTarget(toMapTarget(state.cursor.target));
    });
  }, []);
}
